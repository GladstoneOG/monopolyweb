// src/net/protocol.ts
import type {
  AvatarConfig,
  GameRules,
  MonopolyActionType,
  RoomState,
} from '../engine/types';

export type PeerLinkMode =
  | 'local'
  | 'connecting'
  | 'p2p-webrtc'
  | 'ws-relay'
  | 'disconnected';

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  timestamp: string;
  system?: boolean;
  type?: 'text' | 'sticker';
  stickerUrl?: string;
}

export type PeerToHostMessage =
  | {
      type: 'hello';
      sessionId: string;
      name: string;
      avatar: AvatarConfig;
    }
  | { type: 'toggle-ready' }
  | {
      type: 'game-action';
      action: MonopolyActionType;
      payload?: unknown;
    }
  | {
      type: 'chat-send';
      text: string;
      msgType?: 'text' | 'sticker';
      stickerUrl?: string;
    }
  | { type: 'sync-request' };

export type HostToPeerMessage =
  | {
      type: 'state-sync';
      stateVersion: number;
      room: RoomState;
    }
  | {
      type: 'chat-message';
      message: ChatMessage;
    }
  | {
      type: 'chat-history';
      messages: ChatMessage[];
    }
  | {
      type: 'action-error';
      message: string;
    }
  | {
      type: 'trade-rejected';
      receiverName: string;
    }
  | {
      type: 'kicked';
      reason: string;
    };

export interface HostLobbyCommands {
  addBot(): void;
  removeBot(botId: string): void;
  kickPlayer(playerId: string): void;
  updateRules(partial: Partial<GameRules>): void;
  startGame(): void;
  restartGame(): void;
  returnToLobby(): void;
}
