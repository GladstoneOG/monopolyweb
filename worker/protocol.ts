// worker/protocol.ts
// Shared wire protocol between Cloudflare SignalRoomDO and browser clients.
// Uses structural types so this file compiles in both DOM and Workers runtimes.

export interface SdpPayload {
  type: 'offer' | 'answer' | 'pranswer' | 'rollback';
  sdp?: string;
}

export interface IceCandidatePayload {
  candidate?: string;
  sdpMid?: string | null;
  sdpMLineIndex?: number | null;
  usernameFragment?: string | null;
}

export interface PeerDescriptor {
  peerId: string;
  sessionId: string;
  joinedAt: number;
  isHost: boolean;
}

export interface LobbySummary {
  code: string;
  hostName: string;
  ruleset: 'Classic' | 'Get Rich';
  playerCount: number;
  maxPlayers: number;
  hasPassword: boolean;
  status: 'lobby' | 'playing';
  updatedAt: number;
}

export type ClientSignalMessage =
  | { type: 'signal-offer'; targetPeerId: string; sdp: SdpPayload }
  | { type: 'signal-answer'; targetPeerId: string; sdp: SdpPayload }
  | { type: 'signal-ice'; targetPeerId: string; candidate: IceCandidatePayload }
  | { type: 'relay-to-host'; payload: unknown }
  | { type: 'relay-to-peer'; targetPeerId: string; payload: unknown }
  | { type: 'relay-broadcast'; payload: unknown }
  | {
      type: 'room-meta-update';
      hostName: string;
      ruleset: 'Classic' | 'Get Rich';
      playerCount: number;
      status: 'lobby' | 'playing';
    }
  | { type: 'heartbeat-ping'; ts: number };

export type ServerSignalMessage =
  | {
      type: 'room-welcome';
      code: string;
      peerId: string;
      hostPeerId: string;
      isHost: boolean;
      peers: PeerDescriptor[];
      restored?: boolean;
    }
  | { type: 'room-error'; message: string }
  | { type: 'peer-joined'; peer: PeerDescriptor; peers: PeerDescriptor[] }
  | { type: 'peer-left'; peerId: string; sessionId: string; peers: PeerDescriptor[] }
  | { type: 'host-promoted'; newHostPeerId: string; peers: PeerDescriptor[] }
  | { type: 'signal-offer'; fromPeerId: string; sdp: SdpPayload }
  | { type: 'signal-answer'; fromPeerId: string; sdp: SdpPayload }
  | { type: 'signal-ice'; fromPeerId: string; candidate: IceCandidatePayload }
  | { type: 'relay-envelope'; fromPeerId: string; payload: unknown }
  | { type: 'heartbeat-pong'; ts: number };
