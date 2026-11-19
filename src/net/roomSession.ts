// src/net/roomSession.ts
import type {
  ClientSignalMessage,
  LobbySummary,
  PeerDescriptor,
  ServerSignalMessage,
} from '../../worker/protocol';
import {
  cloneState,
  createLobbyRoom,
  type AvatarConfig,
  type GameRules,
  type MonopolyActionType,
  type RoomState,
} from '../engine';
import {
  HostController,
  loadPersistedHostSnapshot,
  replacePlayerIdInRoom,
} from './hostController';
import { PeerClient } from './peerClient';
import type {
  ChatMessage,
  HostToPeerMessage,
  PeerLinkMode,
  PeerToHostMessage,
} from './protocol';
import { WebRtcPeerLink } from './webrtcChannel';

export type { LobbySummary };

export async function fetchActiveLobbies(): Promise<LobbySummary[]> {
  const resp = await fetch('/api/lobbies', { cache: 'no-store' });
  if (!resp.ok) {
    throw new Error('Could not load active lobbies.');
  }
  const data = (await resp.json()) as { lobbies?: LobbySummary[] };
  return Array.isArray(data.lobbies) ? data.lobbies : [];
}

export interface RoomSessionCallbacks {
  onStateChange(room: RoomState, myPlayerId: string, isHost: boolean): void;
  onChatMessage(msg: ChatMessage): void;
  onChatHistory(messages: ChatMessage[]): void;
  onConnectionModeChange(mode: PeerLinkMode, peerModes: Record<string, PeerLinkMode>): void;
  onError(message: string): void;
  onTradeRejected(receiverName: string): void;
  onKicked(reason: string): void;
  onHostMigrated?(newHostName: string): void;
}

const SESSION_ID_KEY = 'monopoly_web_session_id';

export function getOrCreateSessionId(): string {
  try {
    const existing = sessionStorage.getItem(SESSION_ID_KEY);
    if (existing) return existing;
    const id = `sess_${crypto.randomUUID()}`;
    sessionStorage.setItem(SESSION_ID_KEY, id);
    return id;
  } catch {
    return `sess_${Math.random().toString(36).slice(2, 12)}`;
  }
}

export class RoomSession {
  private callbacks: RoomSessionCallbacks;
  private ws: WebSocket | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  private myPeerId = '';
  private hostPeerId = '';
  private isHost = false;
  private isLocalOnly = false;
  private sessionId = getOrCreateSessionId();
  private profile: { name: string; avatar: AvatarConfig } | null = null;
  private lastPublishedMetaKey = '';

  private hostController: HostController | null = null;
  private peerClient: PeerClient | null = null;
  private links = new Map<string, WebRtcPeerLink>();
  private peerModes: Record<string, PeerLinkMode> = {};
  private disposed = false;

  constructor(callbacks: RoomSessionCallbacks) {
    this.callbacks = callbacks;
  }

  public getMyPlayerId(): string {
    return this.myPeerId;
  }

  public getIsHost(): boolean {
    return this.isHost;
  }

  public getIsLocalOnly(): boolean {
    return this.isLocalOnly;
  }

  // =====================================================================
  // Online Host-and-Peer Mode (Cloudflare SignalRoomDO + WebRTC)
  // =====================================================================

  public async createOnlineRoom(params: {
    name: string;
    avatar: AvatarConfig;
    rules?: Partial<GameRules>;
    password?: string;
  }): Promise<string> {
    this.dispose();
    this.disposed = false;
    this.isLocalOnly = false;
    this.lastPublishedMetaKey = '';
    this.profile = { name: params.name, avatar: params.avatar };

    const resp = await fetch('/api/rooms', { method: 'POST' });
    if (!resp.ok) {
      throw new Error('Could not allocate room code from Cloudflare Worker.');
    }
    const { code } = (await resp.json()) as { code: string };
    await this.connectSignalSocket({
      code,
      role: 'create',
      password: params.password,
      hostName: params.name,
      ruleset: params.rules?.ruleset ?? 'Get Rich',
      initialRules: params.rules,
    });
    return code;
  }

  public async joinOnlineRoom(params: {
    code: string;
    name: string;
    avatar: AvatarConfig;
    password?: string;
  }): Promise<void> {
    this.dispose();
    this.disposed = false;
    this.isLocalOnly = false;
    this.lastPublishedMetaKey = '';
    this.profile = { name: params.name, avatar: params.avatar };

    const cleanCode = params.code.trim().toUpperCase();
    if (!/^[A-Z0-9]{4}$/.test(cleanCode)) {
      throw new Error('Invalid room code.');
    }
    await this.connectSignalSocket({
      code: cleanCode,
      role: 'join',
      password: params.password,
    });
  }

  // =====================================================================
  // Unified Actions
  // =====================================================================

  public dispatchGameAction(action: MonopolyActionType, payload?: unknown): void {
    if (this.isHost && this.hostController) {
      this.hostController.dispatchLocalAction(action, payload);
    } else if (this.peerClient) {
      this.peerClient.sendGameAction(action, payload);
    }
  }

  public sendChat(text: string, msgType?: 'text' | 'sticker', stickerUrl?: string): void {
    if (this.isHost && this.hostController) {
      this.hostController.sendLocalChat(text, msgType, stickerUrl);
    } else if (this.peerClient) {
      this.peerClient.sendChat(text, msgType, stickerUrl);
    }
  }

  public toggleReady(): void {
    if (!this.isHost && this.peerClient) {
      this.peerClient.toggleReady();
    }
  }

  public updateRules(partial: Partial<GameRules>): void {
    if (this.isHost && this.hostController) {
      this.hostController.updateRules(partial);
    }
  }

  public addBot(): void {
    if (this.isHost && this.hostController) {
      this.hostController.addBot();
    }
  }

  public removeBot(botId: string): void {
    if (this.isHost && this.hostController) {
      this.hostController.removeBot(botId);
    }
  }

  public kickPlayer(playerId: string): void {
    if (this.isHost && this.hostController) {
      this.hostController.kickPlayer(playerId);
    }
  }

  public startGame(): void {
    if (this.isHost && this.hostController) {
      this.hostController.startGame();
    }
  }

  public restartGame(): void {
    if (this.isHost && this.hostController) {
      this.hostController.restartGame();
    }
  }

  public returnToLobby(): void {
    if (this.isHost && this.hostController) {
      this.hostController.returnToLobby();
    }
  }

  public dispose(): void {
    this.disposed = true;
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    this.hostController?.dispose();
    this.hostController = null;
    this.peerClient = null;
    for (const link of this.links.values()) {
      link.close();
    }
    this.links.clear();
    this.peerModes = {};
    if (this.ws) {
      try {
        this.ws.close(1000, 'Client left room');
      } catch {
        // ignore
      }
      this.ws = null;
    }
  }

  // =====================================================================
  // Signaling & WebRTC Star Management
  // =====================================================================

  private connectSignalSocket(opts: {
    code: string;
    role: 'create' | 'join';
    password?: string;
    hostName?: string;
    ruleset?: 'Classic' | 'Get Rich';
    initialRules?: Partial<GameRules>;
  }): Promise<void> {
    return new Promise((resolve, reject) => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const qs = new URLSearchParams({
        role: opts.role,
        sessionId: this.sessionId,
      });
      if (opts.password?.trim()) qs.set('password', opts.password.trim());
      if (opts.hostName) qs.set('hostName', opts.hostName);
      if (opts.ruleset) qs.set('ruleset', opts.ruleset);

      const url = `${protocol}//${window.location.host}/api/rooms/${opts.code}/ws?${qs.toString()}`;
      const ws = new WebSocket(url);
      this.ws = ws;
      this.callbacks.onConnectionModeChange('connecting', {});

      let settled = false;

      ws.onopen = () => {
        this.heartbeatTimer = setInterval(() => {
          this.sendSignal({ type: 'heartbeat-ping', ts: Date.now() });
        }, 20_000);
      };

      ws.onerror = () => {
        if (!settled) {
          settled = true;
          reject(new Error('Could not connect to room signaling server.'));
        }
      };

      ws.onclose = () => {
        if (this.heartbeatTimer) {
          clearInterval(this.heartbeatTimer);
          this.heartbeatTimer = null;
        }
        if (!settled) {
          settled = true;
          reject(new Error('Connection closed before joining room.'));
        } else if (!this.disposed) {
          this.callbacks.onConnectionModeChange('disconnected', { ...this.peerModes });
        }
      };

      ws.onmessage = (ev) => {
        if (typeof ev.data !== 'string' || this.disposed) return;
        let msg: ServerSignalMessage;
        try {
          msg = JSON.parse(ev.data) as ServerSignalMessage;
        } catch {
          return;
        }

        if (msg.type === 'room-error') {
          if (!settled) {
            settled = true;
            reject(new Error(msg.message));
          } else {
            this.callbacks.onError(msg.message);
          }
          return;
        }

        if (msg.type === 'room-welcome') {
          if (!settled) {
            settled = true;
            resolve();
          }
          this.handleWelcome(msg, opts.initialRules);
          return;
        }

        this.handleSignalMessage(msg);
      };
    });
  }

  private handleWelcome(
    msg: Extract<ServerSignalMessage, { type: 'room-welcome' }>,
    initialRules?: Partial<GameRules>
  ): void {
    this.myPeerId = msg.peerId;
    this.hostPeerId = msg.hostPeerId;
    this.isHost = msg.isHost;

    if (this.isHost) {
      const persisted = msg.restored ? loadPersistedHostSnapshot(msg.code) : null;
      let initialRoom: RoomState;
      let initialVersion = 1;

      if (persisted) {
        initialRoom = cloneState(persisted.room);
        const prevHost = initialRoom.players.find(
          (p) => !p.isBot && p.sessionId === this.sessionId
        );
        if (prevHost) {
          const oldId = prevHost.id;
          prevHost.id = this.myPeerId;
          prevHost.isHost = true;
          prevHost.disconnected = false;
          replacePlayerIdInRoom(initialRoom, oldId, this.myPeerId);
        }
        initialVersion = persisted.stateVersion;
      } else {
        initialRoom = createLobbyRoom({
          code: msg.code,
          host: {
            id: this.myPeerId,
            sessionId: this.sessionId,
            name: this.profile?.name || 'Host',
            avatar: this.profile!.avatar,
          },
          rules: initialRules,
        });
      }

      this.initHostController(initialRoom, initialVersion, []);
      const currentRoom = this.hostController!.getRoom();
      this.publishLobbyDirectoryMeta(currentRoom);
      this.callbacks.onStateChange(currentRoom, this.myPeerId, true);

      for (const peer of msg.peers) {
        if (peer.peerId !== this.myPeerId) {
          void this.openHostLinkToPeer(peer.peerId);
        }
      }
      this.emitConnectionSummary();
    } else {
      this.initPeerClient();
      this.ensurePeerLinkToHost(this.hostPeerId);
      this.peerClient!.sendHello(
        this.sessionId,
        this.profile?.name || 'Player',
        this.profile!.avatar
      );
      this.emitConnectionSummary();
    }
  }

  private publishLobbyDirectoryMeta(room: RoomState): void {
    if (!this.isHost || this.isLocalOnly) return;
    const hostPlayer = room.players.find((p) => p.isHost) ?? room.players[0];
    const hostName = hostPlayer?.name || this.profile?.name || 'Host';
    const status: 'lobby' | 'playing' = room.gameState === 'lobby' ? 'lobby' : 'playing';
    const playerCount = room.players.length;
    const ruleset = room.rules.ruleset;
    const key = `${hostName}|${ruleset}|${playerCount}|${status}`;
    if (key === this.lastPublishedMetaKey) return;
    this.lastPublishedMetaKey = key;

    this.sendSignal({
      type: 'room-meta-update',
      hostName,
      ruleset,
      playerCount,
      status,
    });
  }

  private handleSignalMessage(msg: ServerSignalMessage): void {
    switch (msg.type) {
      case 'peer-joined': {
        if (this.isHost && msg.peer.peerId !== this.myPeerId) {
          void this.openHostLinkToPeer(msg.peer.peerId);
        }
        break;
      }

      case 'peer-left': {
        const existing = this.links.get(msg.peerId);
        if (existing) {
          existing.close();
          this.links.delete(msg.peerId);
          delete this.peerModes[msg.peerId];
        }
        if (this.isHost && this.hostController) {
          this.hostController.handlePeerDisconnected(msg.peerId);
        }
        this.emitConnectionSummary();
        break;
      }

      case 'signal-offer': {
        if (!this.isHost) {
          const link = this.ensurePeerLinkToHost(msg.fromPeerId);
          void link.handleOffer(msg.sdp);
        }
        break;
      }

      case 'signal-answer': {
        const link = this.links.get(msg.fromPeerId);
        if (link) {
          void link.handleAnswer(msg.sdp);
        }
        break;
      }

      case 'signal-ice': {
        const link = this.links.get(msg.fromPeerId);
        if (link) {
          void link.handleIceCandidate(msg.candidate);
        }
        break;
      }

      case 'relay-envelope': {
        if (this.isHost && this.hostController) {
          this.hostController.handlePeerMessage(
            msg.fromPeerId,
            msg.payload as PeerToHostMessage
          );
        } else if (!this.isHost && this.peerClient) {
          this.peerClient.handleHostMessage(msg.payload as HostToPeerMessage);
        }
        break;
      }

      case 'host-promoted': {
        this.handleHostPromoted(msg.newHostPeerId, msg.peers);
        break;
      }

      case 'heartbeat-pong':
        break;
    }
  }

  private handleHostPromoted(newHostPeerId: string, peers: PeerDescriptor[]): void {
    for (const link of this.links.values()) {
      link.close();
    }
    this.links.clear();
    this.peerModes = {};
    this.hostPeerId = newHostPeerId;

    if (newHostPeerId === this.myPeerId) {
      const snap = this.peerClient?.getMigrationSnapshot();
      this.peerClient = null;
      this.isHost = true;
      this.lastPublishedMetaKey = '';

      if (snap && snap.room) {
        const migratedRoom = cloneState(snap.room);
        let newHostName = this.profile?.name || 'Host';
        for (const p of migratedRoom.players) {
          if (p.id === this.myPeerId) {
            p.isHost = true;
            p.isReady = true;
            p.disconnected = false;
            newHostName = p.name;
          } else if (p.isHost) {
            p.isHost = false;
            p.disconnected = true;
          }
        }

        this.initHostController(migratedRoom, snap.stateVersion, snap.chatHistory);
        const latest = this.hostController!.getRoom();
        this.publishLobbyDirectoryMeta(latest);
        this.callbacks.onHostMigrated?.(newHostName);
        this.callbacks.onStateChange(latest, this.myPeerId, true);

        for (const peer of peers) {
          if (peer.peerId !== this.myPeerId) {
            void this.openHostLinkToPeer(peer.peerId);
            this.hostController!.syncPeer(peer.peerId);
          }
        }
      }
    } else {
      this.isHost = false;
      this.ensurePeerLinkToHost(newHostPeerId);
      this.peerClient?.requestSync();
      const snap = this.peerClient?.getMigrationSnapshot();
      const newHostName =
        snap?.room?.players.find((p) => p.id === newHostPeerId)?.name ?? 'New Host';
      this.callbacks.onHostMigrated?.(newHostName);
    }

    this.emitConnectionSummary();
  }

  private initHostController(
    initialRoom: RoomState,
    stateVersion: number,
    chatHistory: ChatMessage[]
  ): void {
    this.hostController?.dispose();
    this.hostController = new HostController({
      initialRoom,
      hostPeerId: this.myPeerId,
      initialStateVersion: stateVersion,
      initialChatHistory: chatHistory,
      transport: {
        sendToPeer: (peerId, msg) => {
          const link = this.links.get(peerId);
          if (link) {
            link.send(msg);
          } else {
            this.sendSignal({ type: 'relay-to-peer', targetPeerId: peerId, payload: msg });
          }
        },
        broadcast: (msg) => {
          let needsRelayFallback = false;
          for (const [, link] of this.links) {
            if (link.getMode() === 'p2p-webrtc') {
              link.send(msg);
            } else {
              needsRelayFallback = true;
            }
          }
          if (needsRelayFallback) {
            for (const [peerId, link] of this.links) {
              if (link.getMode() !== 'p2p-webrtc') {
                this.sendSignal({
                  type: 'relay-to-peer',
                  targetPeerId: peerId,
                  payload: msg,
                });
              }
            }
          }
        },
      },
      callbacks: {
        onStateChange: (room) => {
          this.publishLobbyDirectoryMeta(room);
          this.callbacks.onStateChange(room, this.myPeerId, true);
        },
        onChatMessage: (msg) => this.callbacks.onChatMessage(msg),
        onActionError: (msg) => this.callbacks.onError(msg),
        onTradeRejected: (name) => this.callbacks.onTradeRejected(name),
      },
    });
  }

  private initPeerClient(): void {
    this.peerClient = new PeerClient(
      {
        sendToHost: (msg) => {
          const link = this.links.get(this.hostPeerId);
          if (link) {
            link.send(msg);
          } else {
            this.sendSignal({ type: 'relay-to-host', payload: msg });
          }
        },
      },
      {
        onStateChange: (room) => {
          this.callbacks.onStateChange(room, this.myPeerId, false);
        },
        onChatMessage: (msg) => this.callbacks.onChatMessage(msg),
        onChatHistory: (msgs) => this.callbacks.onChatHistory(msgs),
        onActionError: (msg) => this.callbacks.onError(msg),
        onTradeRejected: (name) => this.callbacks.onTradeRejected(name),
        onKicked: (reason) => this.callbacks.onKicked(reason),
      }
    );
  }

  private async openHostLinkToPeer(peerId: string): Promise<void> {
    const existing = this.links.get(peerId);
    if (existing) existing.close();

    const link = new WebRtcPeerLink(peerId, {
      sendOffer: (targetPeerId, sdp) =>
        this.sendSignal({ type: 'signal-offer', targetPeerId, sdp }),
      sendAnswer: (targetPeerId, sdp) =>
        this.sendSignal({ type: 'signal-answer', targetPeerId, sdp }),
      sendIce: (targetPeerId, candidate) =>
        this.sendSignal({ type: 'signal-ice', targetPeerId, candidate }),
      sendViaRelay: (payload) =>
        this.sendSignal({ type: 'relay-to-peer', targetPeerId: peerId, payload }),
      onMessage: (payload) => {
        this.hostController?.handlePeerMessage(peerId, payload as PeerToHostMessage);
      },
      onModeChange: (mode) => {
        this.peerModes[peerId] = mode;
        this.emitConnectionSummary();
      },
    });

    this.links.set(peerId, link);
    this.peerModes[peerId] = link.getMode();
    await link.startAsOfferer();
  }

  private ensurePeerLinkToHost(hostId: string): WebRtcPeerLink {
    const existing = this.links.get(hostId);
    if (existing) return existing;

    const link = new WebRtcPeerLink(hostId, {
      sendOffer: (targetPeerId, sdp) =>
        this.sendSignal({ type: 'signal-offer', targetPeerId, sdp }),
      sendAnswer: (targetPeerId, sdp) =>
        this.sendSignal({ type: 'signal-answer', targetPeerId, sdp }),
      sendIce: (targetPeerId, candidate) =>
        this.sendSignal({ type: 'signal-ice', targetPeerId, candidate }),
      sendViaRelay: (payload) =>
        this.sendSignal({ type: 'relay-to-host', payload }),
      onMessage: (payload) => {
        this.peerClient?.handleHostMessage(payload as HostToPeerMessage);
      },
      onModeChange: (mode) => {
        this.peerModes[hostId] = mode;
        this.emitConnectionSummary();
      },
    });

    this.links.set(hostId, link);
    this.peerModes[hostId] = link.getMode();
    return link;
  }

  private emitConnectionSummary(): void {
    const modes = Object.values(this.peerModes);
    let summary: PeerLinkMode = 'p2p-webrtc';
    if (modes.length === 0) {
      summary = this.ws?.readyState === WebSocket.OPEN ? 'p2p-webrtc' : 'connecting';
    } else if (modes.every((m) => m === 'p2p-webrtc')) {
      summary = 'p2p-webrtc';
    } else if (modes.some((m) => m === 'ws-relay')) {
      summary = 'ws-relay';
    } else if (modes.some((m) => m === 'connecting')) {
      summary = 'connecting';
    } else {
      summary = 'disconnected';
    }
    this.callbacks.onConnectionModeChange(summary, { ...this.peerModes });
  }

  private sendSignal(msg: ClientSignalMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify(msg));
      } catch {
        // ignore
      }
    }
  }
}
