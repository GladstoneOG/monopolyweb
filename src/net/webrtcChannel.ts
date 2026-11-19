// src/net/webrtcChannel.ts
import type { IceCandidatePayload, SdpPayload } from '../../worker/protocol';
import type { PeerLinkMode } from './protocol';

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.cloudflare.com:3478' },
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

const ICE_FALLBACK_TIMEOUT_MS = 5500;

export interface WebRtcLinkCallbacks {
  sendOffer(targetPeerId: string, sdp: SdpPayload): void;
  sendAnswer(targetPeerId: string, sdp: SdpPayload): void;
  sendIce(targetPeerId: string, candidate: IceCandidatePayload): void;
  sendViaRelay(payload: unknown): void;
  onMessage(payload: unknown): void;
  onModeChange(mode: PeerLinkMode): void;
}

/**
 * Manages a single WebRTC DataChannel link with automatic WebSocket relay fallback.
 * If WebRTC opens, all traffic flows directly peer-to-peer; if NAT/firewall blocks
 * ICE after 5.5s (or fails), traffic transparently routes through SignalRoomDO relay.
 */
export class WebRtcPeerLink {
  public readonly remotePeerId: string;
  private pc: RTCPeerConnection | null = null;
  private dc: RTCDataChannel | null = null;
  private callbacks: WebRtcLinkCallbacks;
  private mode: PeerLinkMode = 'connecting';
  private fallbackTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingIce: IceCandidatePayload[] = [];
  private closed = false;

  constructor(remotePeerId: string, callbacks: WebRtcLinkCallbacks) {
    this.remotePeerId = remotePeerId;
    this.callbacks = callbacks;

    if (typeof RTCPeerConnection === 'undefined') {
      this.setMode('ws-relay');
      return;
    }

    this.pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    this.pc.onicecandidate = (ev) => {
      if (ev.candidate && !this.closed) {
        this.callbacks.sendIce(this.remotePeerId, {
          candidate: ev.candidate.candidate,
          sdpMid: ev.candidate.sdpMid,
          sdpMLineIndex: ev.candidate.sdpMLineIndex,
          usernameFragment: ev.candidate.usernameFragment,
        });
      }
    };

    this.pc.oniceconnectionstatechange = () => {
      if (!this.pc || this.closed) return;
      const st = this.pc.iceConnectionState;
      if (st === 'failed' || st === 'disconnected') {
        this.activateRelayFallback();
      }
    };

    this.pc.ondatachannel = (ev) => {
      this.attachDataChannel(ev.channel);
    };

    this.fallbackTimer = setTimeout(() => {
      if (!this.closed && this.mode === 'connecting') {
        this.activateRelayFallback();
      }
    }, ICE_FALLBACK_TIMEOUT_MS);
  }

  public getMode(): PeerLinkMode {
    return this.mode;
  }

  /** Initiator (Host) creates the DataChannel and sends an SDP Offer */
  public async startAsOfferer(): Promise<void> {
    if (!this.pc || this.closed) return;
    try {
      const channel = this.pc.createDataChannel('monopoly', { ordered: true });
      this.attachDataChannel(channel);
      const offer = await this.pc.createOffer();
      await this.pc.setLocalDescription(offer);
      this.callbacks.sendOffer(this.remotePeerId, {
        type: offer.type,
        sdp: offer.sdp,
      });
    } catch {
      this.activateRelayFallback();
    }
  }

  /** Responder (Peer) accepts SDP Offer and sends SDP Answer */
  public async handleOffer(sdp: SdpPayload): Promise<void> {
    if (!this.pc || this.closed) return;
    try {
      await this.pc.setRemoteDescription(sdp);
      await this.flushPendingIce();
      const answer = await this.pc.createAnswer();
      await this.pc.setLocalDescription(answer);
      this.callbacks.sendAnswer(this.remotePeerId, {
        type: answer.type,
        sdp: answer.sdp,
      });
    } catch {
      this.activateRelayFallback();
    }
  }

  public async handleAnswer(sdp: SdpPayload): Promise<void> {
    if (!this.pc || this.closed) return;
    try {
      await this.pc.setRemoteDescription(sdp);
      await this.flushPendingIce();
    } catch {
      this.activateRelayFallback();
    }
  }

  public async handleIceCandidate(candidate: IceCandidatePayload): Promise<void> {
    if (!this.pc || this.closed) return;
    if (!this.pc.remoteDescription) {
      this.pendingIce.push(candidate);
      return;
    }
    try {
      await this.pc.addIceCandidate(candidate);
    } catch {
      // ignore benign race candidates
    }
  }

  public send(payload: unknown): void {
    if (this.closed) return;
    if (this.dc && this.dc.readyState === 'open') {
      try {
        this.dc.send(JSON.stringify(payload));
        return;
      } catch {
        // fall through to relay
      }
    }
    this.callbacks.sendViaRelay(payload);
  }

  public close(): void {
    this.closed = true;
    if (this.fallbackTimer) {
      clearTimeout(this.fallbackTimer);
      this.fallbackTimer = null;
    }
    try {
      this.dc?.close();
    } catch {
      // ignore
    }
    try {
      this.pc?.close();
    } catch {
      // ignore
    }
    this.dc = null;
    this.pc = null;
    this.setMode('disconnected');
  }

  private attachDataChannel(channel: RTCDataChannel): void {
    this.dc = channel;
    channel.onopen = () => {
      if (this.closed) return;
      if (this.fallbackTimer) {
        clearTimeout(this.fallbackTimer);
        this.fallbackTimer = null;
      }
      this.setMode('p2p-webrtc');
    };
    channel.onclose = () => {
      if (!this.closed) {
        this.activateRelayFallback();
      }
    };
    channel.onerror = () => {
      if (!this.closed) {
        this.activateRelayFallback();
      }
    };
    channel.onmessage = (ev) => {
      if (this.closed || typeof ev.data !== 'string') return;
      try {
        const parsed = JSON.parse(ev.data);
        this.callbacks.onMessage(parsed);
      } catch {
        // ignore malformed packets
      }
    };
  }

  private async flushPendingIce(): Promise<void> {
    if (!this.pc) return;
    const queued = this.pendingIce;
    this.pendingIce = [];
    for (const c of queued) {
      try {
        await this.pc.addIceCandidate(c);
      } catch {
        // ignore
      }
    }
  }

  private activateRelayFallback(): void {
    if (this.closed || this.mode === 'p2p-webrtc') return;
    this.setMode('ws-relay');
  }

  private setMode(next: PeerLinkMode): void {
    if (this.mode === next) return;
    this.mode = next;
    this.callbacks.onModeChange(next);
  }
}
