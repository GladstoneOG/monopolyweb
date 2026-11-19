// src/net/peerClient.ts
import type { AvatarConfig, MonopolyActionType, RoomState } from '../engine/types';
import type {
  ChatMessage,
  HostToPeerMessage,
  PeerToHostMessage,
} from './protocol';

export interface PeerTransport {
  sendToHost(msg: PeerToHostMessage): void;
}

export interface PeerCallbacks {
  onStateChange(room: RoomState, stateVersion: number): void;
  onChatMessage(msg: ChatMessage): void;
  onChatHistory?(messages: ChatMessage[]): void;
  onActionError?(message: string): void;
  onTradeRejected?(receiverName: string): void;
  onKicked?(reason: string): void;
}

export class PeerClient {
  private lastRoom: RoomState | null = null;
  private lastStateVersion = 0;
  private chatHistory: ChatMessage[] = [];
  private transport: PeerTransport;
  private callbacks: PeerCallbacks;

  constructor(transport: PeerTransport, callbacks: PeerCallbacks) {
    this.transport = transport;
    this.callbacks = callbacks;
  }

  public sendHello(sessionId: string, name: string, avatar: AvatarConfig): void {
    this.transport.sendToHost({ type: 'hello', sessionId, name, avatar });
  }

  public toggleReady(): void {
    this.transport.sendToHost({ type: 'toggle-ready' });
  }

  public sendGameAction(action: MonopolyActionType, payload?: unknown): void {
    this.transport.sendToHost({ type: 'game-action', action, payload });
  }

  public sendChat(text: string, msgType?: 'text' | 'sticker', stickerUrl?: string): void {
    this.transport.sendToHost({ type: 'chat-send', text, msgType, stickerUrl });
  }

  public requestSync(): void {
    this.transport.sendToHost({ type: 'sync-request' });
  }

  public handleHostMessage(msg: HostToPeerMessage): void {
    switch (msg.type) {
      case 'state-sync':
        if (msg.stateVersion <= this.lastStateVersion) return;
        this.lastStateVersion = msg.stateVersion;
        this.lastRoom = msg.room;
        this.callbacks.onStateChange(msg.room, msg.stateVersion);
        break;

      case 'chat-message':
        this.chatHistory.push(msg.message);
        if (this.chatHistory.length > 150) {
          this.chatHistory = this.chatHistory.slice(-150);
        }
        this.callbacks.onChatMessage(msg.message);
        break;

      case 'chat-history':
        this.chatHistory = [...msg.messages];
        this.callbacks.onChatHistory?.(this.chatHistory);
        break;

      case 'action-error':
        this.callbacks.onActionError?.(msg.message);
        break;

      case 'trade-rejected':
        this.callbacks.onTradeRejected?.(msg.receiverName);
        break;

      case 'kicked':
        this.callbacks.onKicked?.(msg.reason);
        break;
    }
  }

  /** Returns hot-standby snapshot for seamless Host Migration */
  public getMigrationSnapshot(): {
    room: RoomState | null;
    stateVersion: number;
    chatHistory: ChatMessage[];
  } {
    return {
      room: this.lastRoom,
      stateVersion: this.lastStateVersion,
      chatHistory: [...this.chatHistory],
    };
  }
}
