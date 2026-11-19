// src/net/hostController.ts
import {
  applyMonopolyAction,
  BOT_AVATARS,
  BOT_NAMES,
  cloneState,
  createPlayer,
  defaultRng,
  getNextBotAction,
  resolveScheduledEffect,
  startGame,
  type AvatarConfig,
  type EngineEvent,
  type GameRules,
  type MonopolyActionType,
  type RngSource,
  type RoomState,
  type ScheduledEffect,
} from '../engine';
import type {
  ChatMessage,
  HostToPeerMessage,
  PeerToHostMessage,
} from './protocol';

export interface HostTransport {
  sendToPeer(peerId: string, msg: HostToPeerMessage): void;
  broadcast(msg: HostToPeerMessage): void;
}

export interface HostCallbacks {
  onStateChange(room: RoomState, stateVersion: number): void;
  onChatMessage(msg: ChatMessage): void;
  onActionError?(message: string): void;
  onTradeRejected?(receiverName: string): void;
}

export interface HostControllerOptions {
  initialRoom: RoomState;
  hostPeerId: string;
  initialStateVersion?: number;
  initialChatHistory?: ChatMessage[];
  transport: HostTransport;
  callbacks: HostCallbacks;
  rng?: RngSource;
  /** Override delays (ms) for deterministic fast tests */
  botDelayMs?: number;
  effectDelayScale?: number;
}

const SNAPSHOT_STORAGE_PREFIX = 'monopoly_web_host_snap_';
const MAX_ANIMATION_HOLD_MS = 3400;

function formatTime(): string {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function makeChatId(): string {
  return `msg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Computes a deterministic, strictly bounded animation hold duration (ms)
 * so bots and the next player wait for token hops, jail slams, card fly-ins,
 * and bill transfers to finish — without ever waiting on client ACKs (zero deadlock risk).
 */
export function computeAnimationHoldMs(prev: RoomState, next: RoomState): number {
  if (prev.gameState !== 'playing' || next.gameState !== 'playing') return 0;
  // Rolling / casino flip have their own dedicated scheduledEffect timers
  if (next.phase === 'rolling_animation' || next.phase === 'casino_result_hold') return 0;

  let holdMs = 0;

  // 1. Check player movement / jail slam / airport flight
  for (const nextP of next.players) {
    const prevP = prev.players.find((p) => p.id === nextP.id);
    if (!prevP) continue;

    if (!prevP.inJail && nextP.inJail) {
      holdMs = Math.max(holdMs, 1750);
    } else if (prevP.position !== nextP.position) {
      if (
        next.lastActionDetail?.type === 'airport' &&
        next.lastActionDetail.tileIndex === nextP.position
      ) {
        holdMs = Math.max(holdMs, 1150);
      } else {
        const backward3 = (prevP.position - nextP.position + 40) % 40 === 3;
        const steps = backward3 ? 3 : (nextP.position - prevP.position + 40) % 40;
        const hopMs = steps * 220 + 780;
        holdMs = Math.max(holdMs, hopMs);
      }
    }
  }

  // 2. Chance / Community Chest card fly-in (triggers after landing settle)
  if (next.phase === 'card_drawn' && prev.phase !== 'card_drawn') {
    holdMs = Math.max(holdMs + 750, 1300);
  }

  // 3. Cash transfer / property purchase / turn handoff visual beat
  if (holdMs === 0) {
    const moneyChanged = next.players.some((np) => {
      const pp = prev.players.find((p) => p.id === np.id);
      return pp && pp.money !== np.money;
    });
    if (moneyChanged || next.turnIndex !== prev.turnIndex) {
      holdMs = 650;
    }
  }

  return Math.min(holdMs, MAX_ANIMATION_HOLD_MS);
}

/**
 * Remaps all player ID references inside RoomState when a peer reconnects with a new peerId.
 */
export function replacePlayerIdInRoom(room: RoomState, oldId: string, newId: string): void {
  if (oldId === newId) return;

  for (const tile of room.board) {
    if (tile.owner === oldId) tile.owner = newId;
  }
  if (room.activeDebt) {
    if (room.activeDebt.from === oldId) room.activeDebt.from = newId;
    if (room.activeDebt.to === oldId) room.activeDebt.to = newId;
    if (room.activeDebt.payoutPlayers) {
      for (const p of room.activeDebt.payoutPlayers) {
        if (p.id === oldId) p.id = newId;
      }
    }
  }
  if (room.auctionState) {
    if (room.auctionState.highestBidder === oldId) room.auctionState.highestBidder = newId;
    room.auctionState.bidders = room.auctionState.bidders.map((id) =>
      id === oldId ? newId : id
    );
  }
  if (room.activeTrade) {
    if (room.activeTrade.senderId === oldId) room.activeTrade.senderId = newId;
    if (room.activeTrade.receiverId === oldId) room.activeTrade.receiverId = newId;
  }
  if (room.pendingForceAcquire && room.pendingForceAcquire.byId === oldId) {
    room.pendingForceAcquire.byId = newId;
  }
  if (room.pendingRent) {
    if (room.pendingRent.fromId === oldId) room.pendingRent.fromId = newId;
    if (room.pendingRent.toId === oldId) room.pendingRent.toId = newId;
  }
  if (room.casinoState && room.casinoState.playerId === oldId) {
    room.casinoState.playerId = newId;
  }
  if (room.pendingRollResolution && room.pendingRollResolution.playerId === oldId) {
    room.pendingRollResolution.playerId = newId;
  }
}

const TURN_START_ACTIONS: ReadonlySet<MonopolyActionType> = new Set([
  'roll-dice',
  'roll-jail-doubles',
  'pay-jail-fine',
  'use-jail-card',
]);

export class HostController {
  private room: RoomState;
  private hostPeerId: string;
  private stateVersion: number;
  private chatHistory: ChatMessage[];
  private transport: HostTransport;
  private callbacks: HostCallbacks;
  private rng: RngSource;
  private botDelayMs: number;
  private effectDelayScale: number;

  private effectTimer: ReturnType<typeof setTimeout> | null = null;
  private botTimer: ReturnType<typeof setTimeout> | null = null;
  private actionHoldUntil = 0;
  private disposed = false;

  constructor(options: HostControllerOptions) {
    this.room = cloneState(options.initialRoom);
    this.hostPeerId = options.hostPeerId;
    this.stateVersion = options.initialStateVersion ?? 1;
    this.chatHistory = options.initialChatHistory ? [...options.initialChatHistory] : [];
    this.transport = options.transport;
    this.callbacks = options.callbacks;
    this.rng = options.rng ?? defaultRng;
    this.botDelayMs = options.botDelayMs ?? 850;
    this.effectDelayScale = options.effectDelayScale ?? 1;

    this.resumePendingAnimationsIfMigrated();
    this.scheduleBotTurnIfNeeded();
  }

  public getRoom(): RoomState {
    return this.room;
  }

  public getStateVersion(): number {
    return this.stateVersion;
  }

  public getChatHistory(): ChatMessage[] {
    return this.chatHistory;
  }

  public getRemainingAnimationHoldMs(): number {
    return Math.max(0, this.actionHoldUntil - Date.now());
  }

  public dispose(): void {
    this.disposed = true;
    this.clearTimers();
  }

  public syncPeer(peerId: string): void {
    this.transport.sendToPeer(peerId, {
      type: 'state-sync',
      stateVersion: this.stateVersion,
      room: this.room,
    });
    if (this.chatHistory.length > 0) {
      this.transport.sendToPeer(peerId, {
        type: 'chat-history',
        messages: this.chatHistory.slice(-60),
      });
    }
  }

  public handlePeerMessage(fromPeerId: string, msg: PeerToHostMessage): void {
    if (this.disposed) return;

    switch (msg.type) {
      case 'hello':
        this.handlePeerHello(fromPeerId, msg);
        break;

      case 'sync-request':
        this.syncPeer(fromPeerId);
        break;

      case 'toggle-ready':
        this.handleToggleReady(fromPeerId);
        break;

      case 'game-action':
        this.handleGameAction(fromPeerId, msg.action, msg.payload);
        break;

      case 'chat-send':
        this.handleChatSend(fromPeerId, msg.text, msg.msgType, msg.stickerUrl);
        break;
    }
  }

  public handlePeerDisconnected(peerId: string): void {
    if (this.disposed) return;
    const idx = this.room.players.findIndex((p) => p.id === peerId);
    if (idx === -1) return;

    const player = this.room.players[idx];
    if (player.isBot) return;

    const next = cloneState(this.room);
    if (next.gameState === 'lobby') {
      next.players.splice(idx, 1);
      this.commitState(next);
      this.emitSystemChat(`${player.name} left the lobby.`);
    } else {
      next.players[idx].disconnected = true;
      this.commitState(next);
      this.emitSystemChat(`${player.name} disconnected. Waiting for them to rejoin...`);
    }
  }

  // =====================================================================
  // Host Local Commands (Lobby & Gameplay)
  // =====================================================================

  public dispatchLocalAction(action: MonopolyActionType, payload?: unknown): void {
    this.handleGameAction(this.hostPeerId, action, payload);
  }

  public sendLocalChat(text: string, msgType?: 'text' | 'sticker', stickerUrl?: string): void {
    this.handleChatSend(this.hostPeerId, text, msgType, stickerUrl);
  }

  public updateRules(partial: Partial<GameRules>): void {
    if (this.room.gameState !== 'lobby') return;
    const next = cloneState(this.room);
    next.rules = { ...next.rules, ...partial };
    this.commitState(next);
  }

  public addBot(): void {
    if (this.room.gameState !== 'lobby' || this.room.players.length >= 4) return;
    const next = cloneState(this.room);
    const usedNames = new Set(next.players.map((p) => p.name));
    const available = BOT_NAMES.filter((n) => !usedNames.has(n));
    const botName =
      available.length > 0
        ? available[Math.floor(this.rng.next() * available.length)]
        : `Bot ${next.players.length + 1}`;
    const botAvatar = BOT_AVATARS[next.players.length % BOT_AVATARS.length];
    const botId = `bot_${Math.floor(this.rng.next() * 1e9).toString(36)}`;

    next.players.push(
      createPlayer({
        id: botId,
        name: botName,
        avatar: botAvatar,
        isHost: false,
        isBot: true,
        startingCash: next.rules.startingCash,
      })
    );
    this.commitState(next);
    this.emitSystemChat(`🤖 ${botName} joined the table.`);
  }

  public removeBot(botId: string): void {
    if (this.room.gameState !== 'lobby') return;
    const idx = this.room.players.findIndex((p) => p.id === botId && p.isBot);
    if (idx === -1) return;
    const next = cloneState(this.room);
    const [removed] = next.players.splice(idx, 1);
    this.commitState(next);
    this.emitSystemChat(`Removed ${removed.name}.`);
  }

  public kickPlayer(targetId: string): void {
    if (this.room.gameState !== 'lobby' || targetId === this.hostPeerId) return;
    const idx = this.room.players.findIndex((p) => p.id === targetId);
    if (idx === -1) return;
    const target = this.room.players[idx];
    if (target.isBot) {
      this.removeBot(targetId);
      return;
    }
    this.transport.sendToPeer(targetId, {
      type: 'kicked',
      reason: 'You were removed from the lobby by the Host.',
    });
    const next = cloneState(this.room);
    next.players.splice(idx, 1);
    this.commitState(next);
    this.emitSystemChat(`${target.name} was removed from the lobby.`);
  }

  public startGame(): void {
    if (this.room.gameState !== 'lobby' && this.room.gameState !== 'gameover') return;
    if (this.room.players.length < 2) {
      this.callbacks.onActionError?.('Need at least 2 players (or bots) to start.');
      return;
    }
    const nonHostUnready = this.room.players.some(
      (p) => !p.isHost && !p.isBot && !p.isReady
    );
    if (this.room.gameState === 'lobby' && nonHostUnready) {
      this.callbacks.onActionError?.('Waiting for all players to click Ready.');
      return;
    }

    this.clearTimers();
    this.actionHoldUntil = 0;
    const res = startGame(this.room, this.rng);
    if (!res.changed) return;

    // Give the intro curtain countdown a bounded 2.6s hold so bots don't roll behind closed curtains
    const introHold = Math.round(2600 * this.effectDelayScale);
    if (introHold > 0) {
      this.actionHoldUntil = Date.now() + introHold;
    }

    this.commitState(res.state, false);
    this.processEngineEvents(res.events);
    this.scheduleBotTurnIfNeeded();
  }

  public restartGame(): void {
    this.startGame();
  }

  public returnToLobby(): void {
    this.clearTimers();
    this.actionHoldUntil = 0;
    const next = cloneState(this.room);
    next.gameState = 'lobby';
    for (const p of next.players) {
      p.isReady = p.isHost || p.isBot;
    }
    this.commitState(next, false);
  }

  // =====================================================================
  // Internals
  // =====================================================================

  private handlePeerHello(
    peerId: string,
    msg: { sessionId: string; name: string; avatar: AvatarConfig }
  ): void {
    const next = cloneState(this.room);

    const existingBySession = next.players.find(
      (p) => !p.isBot && p.sessionId === msg.sessionId
    );
    if (existingBySession) {
      const oldId = existingBySession.id;
      existingBySession.id = peerId;
      existingBySession.name = msg.name || existingBySession.name;
      existingBySession.avatar = msg.avatar || existingBySession.avatar;
      existingBySession.disconnected = false;
      replacePlayerIdInRoom(next, oldId, peerId);
      this.commitState(next, false);
      this.syncPeer(peerId);
      this.emitSystemChat(`${existingBySession.name} rejoined the room.`);
      return;
    }

    const existingById = next.players.find((p) => p.id === peerId);
    if (existingById) {
      existingById.name = msg.name || existingById.name;
      existingById.avatar = msg.avatar || existingById.avatar;
      existingById.disconnected = false;
      this.commitState(next, false);
      this.syncPeer(peerId);
      return;
    }

    if (next.gameState !== 'lobby') {
      this.transport.sendToPeer(peerId, {
        type: 'kicked',
        reason: 'Game is already in progress.',
      });
      return;
    }
    if (next.players.length >= 4) {
      this.transport.sendToPeer(peerId, {
        type: 'kicked',
        reason: 'Room is full (max 4 players).',
      });
      return;
    }

    next.players.push(
      createPlayer({
        id: peerId,
        sessionId: msg.sessionId,
        name: msg.name || `Player ${next.players.length + 1}`,
        avatar: msg.avatar,
        isHost: false,
        isBot: false,
        startingCash: next.rules.startingCash,
      })
    );
    this.commitState(next, false);
    this.syncPeer(peerId);
    this.emitSystemChat(`${msg.name || 'A player'} joined the lobby.`);
  }

  private handleToggleReady(peerId: string): void {
    if (this.room.gameState !== 'lobby') return;
    const next = cloneState(this.room);
    const player = next.players.find((p) => p.id === peerId);
    if (!player || player.isHost || player.isBot) return;
    player.isReady = !player.isReady;
    this.commitState(next, false);
  }

  private handleGameAction(
    senderId: string,
    action: MonopolyActionType,
    payload?: unknown
  ): void {
    // Prevent starting a new turn while the previous player's animation hold is still active.
    // Strictly time-bounded (<= 3.4s), so it can NEVER lock or halt the game.
    if (TURN_START_ACTIONS.has(action) && Date.now() < this.actionHoldUntil) {
      return;
    }

    const res = applyMonopolyAction(this.room, senderId, action, payload, this.rng);
    if (res.events.length > 0) {
      this.processEngineEvents(res.events);
    }
    if (!res.changed) return;

    this.commitState(res.state, true);
    if (res.scheduledEffect) {
      this.scheduleEffect(res.scheduledEffect);
    } else {
      this.scheduleBotTurnIfNeeded();
    }
  }

  private handleChatSend(
    senderId: string,
    text: string,
    msgType?: 'text' | 'sticker',
    stickerUrl?: string
  ): void {
    const player = this.room.players.find((p) => p.id === senderId);
    if (!player) return;

    const cleanText = String(text ?? '').trim().slice(0, 300);
    if (msgType === 'sticker') {
      if (!stickerUrl || !stickerUrl.startsWith('/stickers/')) return;
    } else if (!cleanText) {
      return;
    }

    const message: ChatMessage = {
      id: makeChatId(),
      senderId: player.id,
      senderName: player.name,
      text: msgType === 'sticker' ? '' : cleanText,
      timestamp: formatTime(),
      type: msgType ?? 'text',
      stickerUrl: msgType === 'sticker' ? stickerUrl : undefined,
    };

    this.pushChatMessage(message);
  }

  private emitSystemChat(text: string): void {
    this.pushChatMessage({
      id: makeChatId(),
      senderId: 'system',
      senderName: 'System',
      text,
      timestamp: formatTime(),
      system: true,
    });
  }

  private pushChatMessage(message: ChatMessage): void {
    this.chatHistory.push(message);
    if (this.chatHistory.length > 150) {
      this.chatHistory = this.chatHistory.slice(-150);
    }
    this.callbacks.onChatMessage(message);
    this.transport.broadcast({ type: 'chat-message', message });
  }

  private processEngineEvents(events: EngineEvent[]): void {
    for (const ev of events) {
      switch (ev.type) {
        case 'system-chat':
          this.emitSystemChat(ev.text);
          break;
        case 'action-error':
          if (ev.targetPlayerId === this.hostPeerId) {
            this.callbacks.onActionError?.(ev.message);
          } else {
            this.transport.sendToPeer(ev.targetPlayerId, {
              type: 'action-error',
              message: ev.message,
            });
          }
          break;
        case 'trade-rejected':
          if (ev.targetPlayerId === this.hostPeerId) {
            this.callbacks.onTradeRejected?.(ev.receiverName);
          } else {
            this.transport.sendToPeer(ev.targetPlayerId, {
              type: 'trade-rejected',
              receiverName: ev.receiverName,
            });
          }
          break;
        case 'game-over':
          break;
      }
    }
  }

  private scheduleEffect(effect: ScheduledEffect): void {
    if (this.effectTimer) clearTimeout(this.effectTimer);
    if (this.botTimer) {
      clearTimeout(this.botTimer);
      this.botTimer = null;
    }

    const delay = Math.max(0, Math.round(effect.delayMs * this.effectDelayScale));
    this.effectTimer = setTimeout(() => {
      this.effectTimer = null;
      if (this.disposed) return;

      const res = resolveScheduledEffect(this.room, effect.type, effect.token, this.rng);
      if (res.events.length > 0) {
        this.processEngineEvents(res.events);
      }
      if (!res.changed) return;

      this.commitState(res.state, true);
      if (res.scheduledEffect) {
        this.scheduleEffect(res.scheduledEffect);
      } else {
        this.scheduleBotTurnIfNeeded();
      }
    }, delay);
  }

  private resumePendingAnimationsIfMigrated(): void {
    if (this.room.gameState !== 'playing') return;
    if (this.room.phase === 'rolling_animation' && this.room.pendingRollResolution) {
      this.scheduleEffect({
        type: 'resolve-roll',
        delayMs: 800,
        token: this.room.pendingRollResolution.token,
      });
    } else if (
      this.room.phase === 'casino_flip' &&
      this.room.casinoState?.status === 'flipping' &&
      this.room.pendingCasinoToken
    ) {
      this.scheduleEffect({
        type: 'resolve-casino-flip',
        delayMs: 800,
        token: this.room.pendingCasinoToken,
      });
    } else if (
      this.room.phase === 'casino_result_hold' &&
      this.room.pendingCasinoToken
    ) {
      this.scheduleEffect({
        type: 'finish-casino-hold',
        delayMs: 800,
        token: this.room.pendingCasinoToken,
      });
    }
  }

  private scheduleBotTurnIfNeeded(): void {
    if (this.disposed) return;
    if (this.botTimer) {
      clearTimeout(this.botTimer);
      this.botTimer = null;
    }
    if (this.effectTimer) return;

    const decision = getNextBotAction(this.room);
    if (!decision) return;

    const remainingHold = Math.max(0, this.actionHoldUntil - Date.now());
    const baseDelay = Math.max(0, Math.round(this.botDelayMs * this.effectDelayScale));
    const delay = Math.max(baseDelay, remainingHold);

    this.botTimer = setTimeout(() => {
      this.botTimer = null;
      if (this.disposed) return;

      const latestDecision = getNextBotAction(this.room);
      if (!latestDecision) return;

      this.handleGameAction(
        this.hostPeerId,
        latestDecision.action,
        latestDecision.payload
      );
    }, delay);
  }

  private commitState(nextRoom: RoomState, trackAnimationHold = true): void {
    if (trackAnimationHold) {
      const holdMs = Math.round(
        computeAnimationHoldMs(this.room, nextRoom) * this.effectDelayScale
      );
      if (holdMs > 0) {
        this.actionHoldUntil = Math.max(this.actionHoldUntil, Date.now() + holdMs);
      }
    }

    this.room = nextRoom;
    this.stateVersion += 1;
    this.persistSnapshot();
    this.callbacks.onStateChange(this.room, this.stateVersion);
    this.transport.broadcast({
      type: 'state-sync',
      stateVersion: this.stateVersion,
      room: this.room,
    });
  }

  private persistSnapshot(): void {
    try {
      if (typeof sessionStorage !== 'undefined' && this.room.code) {
        sessionStorage.setItem(
          `${SNAPSHOT_STORAGE_PREFIX}${this.room.code}`,
          JSON.stringify({
            stateVersion: this.stateVersion,
            room: this.room,
          })
        );
      }
    } catch {
      // ignore
    }
  }

  private clearTimers(): void {
    if (this.effectTimer) {
      clearTimeout(this.effectTimer);
      this.effectTimer = null;
    }
    if (this.botTimer) {
      clearTimeout(this.botTimer);
      this.botTimer = null;
    }
  }
}

export function loadPersistedHostSnapshot(
  code: string
): { stateVersion: number; room: RoomState } | null {
  try {
    if (typeof sessionStorage === 'undefined') return null;
    const raw = sessionStorage.getItem(`${SNAPSHOT_STORAGE_PREFIX}${code.toUpperCase()}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { stateVersion?: number; room?: RoomState };
    if (parsed && typeof parsed.stateVersion === 'number' && parsed.room) {
      return { stateVersion: parsed.stateVersion, room: parsed.room };
    }
    return null;
  } catch {
    return null;
  }
}
