// worker/SignalRoomDO.ts
import { DurableObject } from 'cloudflare:workers';
import type {
  ClientSignalMessage,
  PeerDescriptor,
  ServerSignalMessage,
} from './protocol';

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

const MAX_PEERS = 4;
const HOST_MIGRATION_GRACE_MS = 5_000;
const STORAGE_ROOM_META = 'room_meta';
const STORAGE_PENDING_MIGRATION = 'pending_host_migration';

interface RoomMeta {
  code: string;
  createdAt: number;
}

export class SignalRoomDO extends DurableObject {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const upgradeHeader = request.headers.get('Upgrade');
    if (upgradeHeader !== 'websocket') {
      return new Response('Expected WebSocket upgrade', { status: 426 });
    }

    const code = (url.searchParams.get('code') || '').toUpperCase();
    const role = url.searchParams.get('role') || 'join';
    const sessionId = url.searchParams.get('sessionId') || crypto.randomUUID();

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];

    const existingSockets = this.getActivePeers();
    const roomMeta = await this.ctx.storage.get<RoomMeta>(STORAGE_ROOM_META);
    const pendingMigration = await this.ctx.storage.get<PendingHostMigration>(
      STORAGE_PENDING_MIGRATION
    );

    // Check if this sessionId is reconnecting
    const sameSession = existingSockets.find((s) => s.meta.sessionId === sessionId);
    const isReturningHost =
      pendingMigration !== undefined && pendingMigration.hostSessionId === sessionId;

    if (role === 'join' && !roomMeta && existingSockets.length === 0) {
      server.accept();
      this.sendJson(server, {
        type: 'room-error',
        message: 'Room not found. Check the 4-letter code or create a new room.',
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

    // Close any stale socket belonging to the same sessionId
    if (sameSession) {
      try {
        sameSession.ws.close(4000, 'Replaced by new connection');
      } catch {
        // ignore close errors
      }
    }

    const remainingPeers = existingSockets.filter((s) => s.meta.sessionId !== sessionId);
    if (remainingPeers.length >= MAX_PEERS) {
      server.accept();
      this.sendJson(server, {
        type: 'room-error',
        message: `Room is full (max ${MAX_PEERS} human players).`,
      });
      server.close(4008, 'Room full');
      return new Response(null, { status: 101, webSocket: client });
    }

    // Persist room metadata on creation
    if (!roomMeta) {
      await this.ctx.storage.put<RoomMeta>(STORAGE_ROOM_META, {
        code,
        createdAt: Date.now(),
      });
    }

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

    this.sendJson(server, {
      type: 'room-welcome',
      code,
      peerId,
      hostPeerId,
      isHost: shouldBeHost,
      peers: peerList,
      restored: Boolean(sameSession || isReturningHost),
    });

    // Notify everyone else
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
        // Only the host may direct relay envelopes to specific peers
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
        // Only the host may broadcast authoritative state/events via relay
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

    if (active.length === 0) {
      // Room is completely empty -> clean up storage so code can be recycled
      await this.ctx.storage.deleteAll();
      return;
    }

    // If a host already reconnected, nothing to do
    if (active.some((p) => p.meta.isHost)) {
      if (pending) {
        await this.ctx.storage.delete(STORAGE_PENDING_MIGRATION);
      }
      return;
    }

    // Promote the earliest-joined connected peer deterministically
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

    if (remaining.length === 0) {
      // Keep room alive briefly for a refresh reconnect, then clean up
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
      // ignore closed socket write errors
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
