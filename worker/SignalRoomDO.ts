// worker/SignalRoomDO.ts
import { DurableObject } from 'cloudflare:workers';
import type {
  ClientSignalMessage,
  LobbySummary,
  PeerDescriptor,
  ServerSignalMessage,
} from './protocol';

export interface SignalRoomEnv {
  ASSETS: Fetcher;
  SIGNAL_ROOM: DurableObjectNamespace<SignalRoomDO>;
}

interface SocketAttachment {
  peerId: string;
  sessionId: string;
  joinedAt: number;
  isHost: boolean;
}

interface PendingHostMigration {
  hostSessionId: string;
  disconnectedAt: number;
}

interface RoomMeta {
  code: string;
  createdAt: number;
  password: string;
  hostName: string;
  ruleset: 'Classic' | 'Get Rich';
  playerCount: number;
  status: 'lobby' | 'playing';
  admittedSessions: string[];
}

export const LOBBY_DIRECTORY_ID = '__LOBBY_DIRECTORY__';

const MAX_PEERS = 4;
const HOST_MIGRATION_GRACE_MS = 5_000;
const DIRECTORY_STALE_MS = 10 * 60 * 1000;
const STORAGE_ROOM_META = 'room_meta';
const STORAGE_PENDING_MIGRATION = 'pending_host_migration';
const DIRECTORY_KEY_PREFIX = 'lobby:';

export class SignalRoomDO extends DurableObject<SignalRoomEnv> {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // =================================================================
    // Mode 1: Singleton Lobby Directory HTTP endpoints
    // =================================================================
    if (url.pathname.startsWith('/directory/')) {
      return this.handleDirectoryRequest(request, url);
    }

    // =================================================================
    // Mode 2: Room WebSocket Signaling + Password Gate
    // =================================================================
    const upgradeHeader = request.headers.get('Upgrade');
    if (upgradeHeader !== 'websocket') {
      return new Response('Expected WebSocket upgrade', { status: 426 });
    }

    const code = (url.searchParams.get('code') || '').toUpperCase();
    const role = url.searchParams.get('role') || 'join';
    const sessionId = url.searchParams.get('sessionId') || crypto.randomUUID();
    const providedPassword = (url.searchParams.get('password') || '').trim();
    const hostNameParam = (url.searchParams.get('hostName') || 'Host').trim().slice(0, 24);
    const rulesetParam: 'Classic' | 'Get Rich' =
      url.searchParams.get('ruleset') === 'Classic' ? 'Classic' : 'Get Rich';

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];

    const existingSockets = this.getActivePeers();
    let roomMeta = await this.ctx.storage.get<RoomMeta>(STORAGE_ROOM_META);
    const pendingMigration = await this.ctx.storage.get<PendingHostMigration>(
      STORAGE_PENDING_MIGRATION
    );

    const sameSession = existingSockets.find((s) => s.meta.sessionId === sessionId);
    const isReturningHost =
      pendingMigration !== undefined && pendingMigration.hostSessionId === sessionId;
    const isPreviouslyAdmitted = Boolean(roomMeta?.admittedSessions?.includes(sessionId));

    if (role === 'join' && !roomMeta && existingSockets.length === 0) {
      server.accept();
      this.sendJson(server, {
        type: 'room-error',
        message: 'Lobby no longer exists. Refresh the lobby list to see active rooms.',
      });
      server.close(4004, 'Room not found');
      return new Response(null, { status: 101, webSocket: client });
    }

    if (role === 'create' && existingSockets.length > 0 && !sameSession && !isReturningHost) {
      server.accept();
      this.sendJson(server, {
        type: 'room-error',
        message: 'Room code is already in use. Please try again.',
      });
      server.close(4009, 'Room exists');
      return new Response(null, { status: 101, webSocket: client });
    }

    // Password check for joining peers (skip if already admitted/reconnecting)
    if (
      role === 'join' &&
      roomMeta &&
      roomMeta.password &&
      !sameSession &&
      !isReturningHost &&
      !isPreviouslyAdmitted
    ) {
      if (providedPassword !== roomMeta.password) {
        server.accept();
        this.sendJson(server, {
          type: 'room-error',
          message: 'Incorrect room password.',
        });
        server.close(4003, 'Invalid password');
        return new Response(null, { status: 101, webSocket: client });
      }
    }

    // Close any stale socket belonging to the same sessionId
    if (sameSession) {
      try {
        sameSession.ws.close(4000, 'Replaced by new connection');
      } catch {
        // ignore
      }
    }

    const remainingPeers = existingSockets.filter((s) => s.meta.sessionId !== sessionId);
    if (remainingPeers.length >= MAX_PEERS) {
      server.accept();
      this.sendJson(server, {
        type: 'room-error',
        message: `Room is full (max ${MAX_PEERS} players).`,
      });
      server.close(4008, 'Room full');
      return new Response(null, { status: 101, webSocket: client });
    }

    // Create or update room metadata
    if (!roomMeta) {
      roomMeta = {
        code,
        createdAt: Date.now(),
        password: providedPassword,
        hostName: hostNameParam || 'Host',
        ruleset: rulesetParam,
        playerCount: 1,
        status: 'lobby',
        admittedSessions: [sessionId],
      };
    } else if (!roomMeta.admittedSessions.includes(sessionId)) {
      roomMeta.admittedSessions = [...roomMeta.admittedSessions, sessionId];
    }
    await this.ctx.storage.put<RoomMeta>(STORAGE_ROOM_META, roomMeta);

    const peerId = `p_${crypto.randomUUID().slice(0, 8)}`;
    const hasConnectedHost = remainingPeers.some((p) => p.meta.isHost);
    const shouldBeHost =
      isReturningHost ||
      Boolean(sameSession?.meta.isHost) ||
      (!hasConnectedHost && remainingPeers.length === 0);

    if (isReturningHost) {
      await this.ctx.storage.delete(STORAGE_PENDING_MIGRATION);
      await this.ctx.storage.deleteAlarm();
    }

    const attachment: SocketAttachment = {
      peerId,
      sessionId,
      joinedAt: sameSession ? sameSession.meta.joinedAt : Date.now(),
      isHost: shouldBeHost,
    };

    this.ctx.acceptWebSocket(server, [peerId]);
    server.serializeAttachment(attachment);

    const allPeers = this.getActivePeers();
    const peerList = allPeers.map((p) => this.toDescriptor(p.meta));
    const currentHost = allPeers.find((p) => p.meta.isHost);
    const hostPeerId = currentHost ? currentHost.meta.peerId : peerId;

    // Publish room to directory immediately on create/rejoin
    await this.publishToDirectory(roomMeta);

    this.sendJson(server, {
      type: 'room-welcome',
      code,
      peerId,
      hostPeerId,
      isHost: shouldBeHost,
      peers: peerList,
      restored: Boolean(sameSession || isReturningHost),
    });

    this.broadcastExcept(peerId, {
      type: 'peer-joined',
      peer: this.toDescriptor(attachment),
      peers: peerList,
    });

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (typeof message !== 'string') return;
    const sender = this.readAttachment(ws);
    if (!sender) return;

    let parsed: ClientSignalMessage;
    try {
      parsed = JSON.parse(message) as ClientSignalMessage;
    } catch {
      return;
    }

    switch (parsed.type) {
      case 'heartbeat-ping': {
        this.sendJson(ws, { type: 'heartbeat-pong', ts: parsed.ts });
        if (sender.isHost) {
          const meta = await this.ctx.storage.get<RoomMeta>(STORAGE_ROOM_META);
          if (meta) {
            await this.publishToDirectory(meta);
          }
        }
        break;
      }

      case 'room-meta-update': {
        if (!sender.isHost) return;
        const meta = await this.ctx.storage.get<RoomMeta>(STORAGE_ROOM_META);
        if (!meta) return;
        meta.hostName = (parsed.hostName || meta.hostName).slice(0, 24);
        meta.ruleset = parsed.ruleset === 'Classic' ? 'Classic' : 'Get Rich';
        meta.playerCount = Math.max(1, Math.min(MAX_PEERS, Number(parsed.playerCount) || 1));
        meta.status = parsed.status === 'playing' ? 'playing' : 'lobby';
        await this.ctx.storage.put<RoomMeta>(STORAGE_ROOM_META, meta);
        await this.publishToDirectory(meta);
        break;
      }

      case 'signal-offer': {
        const target = this.findSocketByPeerId(parsed.targetPeerId);
        if (target) {
          this.sendJson(target, {
            type: 'signal-offer',
            fromPeerId: sender.peerId,
            sdp: parsed.sdp,
          });
        }
        break;
      }

      case 'signal-answer': {
        const target = this.findSocketByPeerId(parsed.targetPeerId);
        if (target) {
          this.sendJson(target, {
            type: 'signal-answer',
            fromPeerId: sender.peerId,
            sdp: parsed.sdp,
          });
        }
        break;
      }

      case 'signal-ice': {
        const target = this.findSocketByPeerId(parsed.targetPeerId);
        if (target) {
          this.sendJson(target, {
            type: 'signal-ice',
            fromPeerId: sender.peerId,
            candidate: parsed.candidate,
          });
        }
        break;
      }

      case 'relay-to-host': {
        const host = this.getActivePeers().find((p) => p.meta.isHost);
        if (host && host.meta.peerId !== sender.peerId) {
          this.sendJson(host.ws, {
            type: 'relay-envelope',
            fromPeerId: sender.peerId,
            payload: parsed.payload,
          });
        }
        break;
      }

      case 'relay-to-peer': {
        if (!sender.isHost) return;
        const target = this.findSocketByPeerId(parsed.targetPeerId);
        if (target) {
          this.sendJson(target, {
            type: 'relay-envelope',
            fromPeerId: sender.peerId,
            payload: parsed.payload,
          });
        }
        break;
      }

      case 'relay-broadcast': {
        if (!sender.isHost) return;
        this.broadcastExcept(sender.peerId, {
          type: 'relay-envelope',
          fromPeerId: sender.peerId,
          payload: parsed.payload,
        });
        break;
      }
    }
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    await this.handleDisconnect(ws);
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    await this.handleDisconnect(ws);
  }

  async alarm(): Promise<void> {
    const pending = await this.ctx.storage.get<PendingHostMigration>(
      STORAGE_PENDING_MIGRATION
    );
    const active = this.getActivePeers();
    const meta = await this.ctx.storage.get<RoomMeta>(STORAGE_ROOM_META);

    if (active.length === 0) {
      if (meta?.code) {
        await this.removeFromDirectory(meta.code);
      }
      await this.ctx.storage.deleteAll();
      return;
    }

    if (active.some((p) => p.meta.isHost)) {
      if (pending) {
        await this.ctx.storage.delete(STORAGE_PENDING_MIGRATION);
      }
      return;
    }

    active.sort((a, b) => a.meta.joinedAt - b.meta.joinedAt);
    const nextHost = active[0];
    const updatedMeta: SocketAttachment = { ...nextHost.meta, isHost: true };
    nextHost.ws.serializeAttachment(updatedMeta);
    nextHost.meta = updatedMeta;

    await this.ctx.storage.delete(STORAGE_PENDING_MIGRATION);

    const peerList = active.map((p) => this.toDescriptor(p.meta));
    this.broadcastAll({
      type: 'host-promoted',
      newHostPeerId: updatedMeta.peerId,
      peers: peerList,
    });
  }

  // =================================================================
  // Directory Handler (when invoked as __LOBBY_DIRECTORY__)
  // =================================================================

  private async handleDirectoryRequest(request: Request, url: URL): Promise<Response> {
    if (url.pathname === '/directory/list' && request.method === 'GET') {
      const entries = await this.ctx.storage.list<LobbySummary>({
        prefix: DIRECTORY_KEY_PREFIX,
      });
      const now = Date.now();
      const staleKeys: string[] = [];
      const active: LobbySummary[] = [];

      for (const [key, summary] of entries) {
        if (!summary || now - summary.updatedAt > DIRECTORY_STALE_MS) {
          staleKeys.push(key);
        } else {
          active.push(summary);
        }
      }
      if (staleKeys.length > 0) {
        await this.ctx.storage.delete(staleKeys);
      }

      // Open lobbies first, then most recently updated
      active.sort((a, b) => {
        if (a.status !== b.status) return a.status === 'lobby' ? -1 : 1;
        return b.updatedAt - a.updatedAt;
      });

      return Response.json(
        { lobbies: active },
        { headers: { 'Cache-Control': 'no-store' } }
      );
    }

    if (url.pathname === '/directory/upsert' && request.method === 'POST') {
      const summary = (await request.json()) as LobbySummary;
      if (!summary?.code) return new Response('Bad request', { status: 400 });
      await this.ctx.storage.put<LobbySummary>(
        `${DIRECTORY_KEY_PREFIX}${summary.code.toUpperCase()}`,
        {
          ...summary,
          code: summary.code.toUpperCase(),
          updatedAt: Date.now(),
        }
      );
      return new Response('ok');
    }

    if (url.pathname.startsWith('/directory/delete/') && request.method === 'DELETE') {
      const code = url.pathname.slice('/directory/delete/'.length).toUpperCase();
      if (code) {
        await this.ctx.storage.delete(`${DIRECTORY_KEY_PREFIX}${code}`);
      }
      return new Response('ok');
    }

    return new Response('Not found', { status: 404 });
  }

  private async publishToDirectory(meta: RoomMeta): Promise<void> {
    if (!meta.code) return;
    try {
      const dirStub = this.env.SIGNAL_ROOM.get(
        this.env.SIGNAL_ROOM.idFromName(LOBBY_DIRECTORY_ID)
      );
      const summary: LobbySummary = {
        code: meta.code,
        hostName: meta.hostName,
        ruleset: meta.ruleset,
        playerCount: meta.playerCount,
        maxPlayers: MAX_PEERS,
        hasPassword: Boolean(meta.password),
        status: meta.status,
        updatedAt: Date.now(),
      };
      await dirStub.fetch('https://directory.internal/directory/upsert', {
        method: 'POST',
        body: JSON.stringify(summary),
      });
    } catch {
      // non-fatal directory publish error
    }
  }

  private async removeFromDirectory(code: string): Promise<void> {
    if (!code) return;
    try {
      const dirStub = this.env.SIGNAL_ROOM.get(
        this.env.SIGNAL_ROOM.idFromName(LOBBY_DIRECTORY_ID)
      );
      await dirStub.fetch(`https://directory.internal/directory/delete/${code}`, {
        method: 'DELETE',
      });
    } catch {
      // ignore
    }
  }

  private async handleDisconnect(ws: WebSocket): Promise<void> {
    const departed = this.readAttachment(ws);
    if (!departed) return;

    const remaining = this.getActivePeers().filter(
      (p) => p.ws !== ws && p.meta.peerId !== departed.peerId
    );
    const peerList = remaining.map((p) => this.toDescriptor(p.meta));

    this.broadcastExcept(departed.peerId, {
      type: 'peer-left',
      peerId: departed.peerId,
      sessionId: departed.sessionId,
      peers: peerList,
    });

    const meta = await this.ctx.storage.get<RoomMeta>(STORAGE_ROOM_META);

    if (remaining.length === 0) {
      // Remove empty room from public lobby browser right away
      if (meta?.code) {
        await this.removeFromDirectory(meta.code);
      }
      if (departed.isHost) {
        await this.ctx.storage.put<PendingHostMigration>(STORAGE_PENDING_MIGRATION, {
          hostSessionId: departed.sessionId,
          disconnectedAt: Date.now(),
        });
      }
      await this.ctx.storage.setAlarm(Date.now() + 60_000);
      return;
    }

    if (departed.isHost) {
      await this.ctx.storage.put<PendingHostMigration>(STORAGE_PENDING_MIGRATION, {
        hostSessionId: departed.sessionId,
        disconnectedAt: Date.now(),
      });
      await this.ctx.storage.setAlarm(Date.now() + HOST_MIGRATION_GRACE_MS);
    }
  }

  private getActivePeers(): Array<{ ws: WebSocket; meta: SocketAttachment }> {
    const sockets = this.ctx.getWebSockets();
    const active: Array<{ ws: WebSocket; meta: SocketAttachment }> = [];
    for (const ws of sockets) {
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        const meta = this.readAttachment(ws);
        if (meta) active.push({ ws, meta });
      }
    }
    return active;
  }

  private findSocketByPeerId(peerId: string): WebSocket | null {
    const sockets = this.ctx.getWebSockets(peerId);
    for (const ws of sockets) {
      if (ws.readyState === WebSocket.OPEN) return ws;
    }
    return null;
  }

  private readAttachment(ws: WebSocket): SocketAttachment | null {
    try {
      const data = ws.deserializeAttachment() as SocketAttachment | null;
      return data && data.peerId ? data : null;
    } catch {
      return null;
    }
  }

  private toDescriptor(meta: SocketAttachment): PeerDescriptor {
    return {
      peerId: meta.peerId,
      sessionId: meta.sessionId,
      joinedAt: meta.joinedAt,
      isHost: meta.isHost,
    };
  }

  private sendJson(ws: WebSocket, msg: ServerSignalMessage): void {
    try {
      ws.send(JSON.stringify(msg));
    } catch {
      // ignore
    }
  }

  private broadcastAll(msg: ServerSignalMessage): void {
    const encoded = JSON.stringify(msg);
    for (const { ws } of this.getActivePeers()) {
      try {
        ws.send(encoded);
      } catch {
        // ignore
      }
    }
  }

  private broadcastExcept(excludePeerId: string, msg: ServerSignalMessage): void {
    const encoded = JSON.stringify(msg);
    for (const { ws, meta } of this.getActivePeers()) {
      if (meta.peerId === excludePeerId) continue;
      try {
        ws.send(encoded);
      } catch {
        // ignore
      }
    }
  }
}
