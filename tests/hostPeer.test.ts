// tests/hostPeer.test.ts
import { describe, expect, it } from 'vitest';
import { createLobbyRoom, cloneState } from '../src/engine';
import { HostController } from '../src/net/hostController';
import { PeerClient } from '../src/net/peerClient';
import type { HostToPeerMessage, PeerToHostMessage } from '../src/net/protocol';
import { DEFAULT_AVATAR } from '../src/components/shared/AvatarCreator';

describe('Host-and-Peer Controller, Authorization & Host Migration', () => {
  it('syncs lobby join, rejects spoofed peer actions, and preserves monotonic stateVersion', () => {
    const initialRoom = createLobbyRoom({
      code: 'ABCD',
      host: { id: 'host_1', sessionId: 's_host', name: 'Host', avatar: DEFAULT_AVATAR },
      rules: { ruleset: 'Get Rich', startingCash: 1500, turnLimit: 0 },
    });

    const peerInbox: HostToPeerMessage[] = [];
    const peerToHostQueue: Array<{ from: string; msg: PeerToHostMessage }> = [];

    const host = new HostController({
      initialRoom,
      hostPeerId: 'host_1',
      botDelayMs: 10,
      effectDelayScale: 0,
      transport: {
        sendToPeer: (_id, msg) => peerInbox.push(msg),
        broadcast: (msg) => peerInbox.push(msg),
      },
      callbacks: {
        onStateChange: () => {},
        onChatMessage: () => {},
      },
    });

    const peer = new PeerClient(
      {
        sendToHost: (msg) => peerToHostQueue.push({ from: 'peer_2', msg }),
      },
      {
        onStateChange: () => {},
        onChatMessage: () => {},
      }
    );

    const pump = () => {
      while (peerToHostQueue.length > 0) {
        const item = peerToHostQueue.shift()!;
        host.handlePeerMessage(item.from, item.msg);
      }
      while (peerInbox.length > 0) {
        peer.handleHostMessage(peerInbox.shift()!);
      }
    };

    // 1. Peer says hello and toggles ready
    peer.sendHello('s_peer2', 'Bob', DEFAULT_AVATAR);
    pump();
    expect(peer.getMigrationSnapshot().room?.players.length).toBe(2);

    peer.toggleReady();
    pump();
    expect(peer.getMigrationSnapshot().room?.players[1].isReady).toBe(true);

    // 2. Host starts game
    host.startGame();
    pump();
    const versionAfterStart = peer.getMigrationSnapshot().stateVersion;
    expect(peer.getMigrationSnapshot().room?.gameState).toBe('playing');

    // 3. Peer attempts to roll on Host's turn (turnIndex === 0) -> MUST be rejected!
    peer.sendGameAction('roll-dice', { power: 50 });
    pump();
    expect(peer.getMigrationSnapshot().stateVersion).toBe(versionAfterStart);
    expect(peer.getMigrationSnapshot().room?.phase).toBe('roll');

    // 4. Stale state-sync packets with older stateVersion are ignored by PeerClient
    const staleRoom = cloneState(peer.getMigrationSnapshot().room!);
    staleRoom.turnCount = 999;
    peer.handleHostMessage({
      type: 'state-sync',
      stateVersion: 1,
      room: staleRoom,
    });
    expect(peer.getMigrationSnapshot().room?.turnCount).toBe(0);

    host.dispose();
  });

  it('migrates seamlessly when Host drops and Peer promotes to new Host', () => {
    const initialRoom = createLobbyRoom({
      code: 'MIGR',
      host: { id: 'host_1', sessionId: 's_host', name: 'Alice', avatar: DEFAULT_AVATAR },
      rules: { ruleset: 'Get Rich', startingCash: 2000, turnLimit: 0 },
    });

    const delivered: HostToPeerMessage[] = [];
    const oldHost = new HostController({
      initialRoom,
      hostPeerId: 'host_1',
      effectDelayScale: 0,
      transport: {
        sendToPeer: (_id, msg) => delivered.push(msg),
        broadcast: (msg) => delivered.push(msg),
      },
      callbacks: {
        onStateChange: () => {},
        onChatMessage: () => {},
      },
    });

    const peer = new PeerClient(
      { sendToHost: () => {} },
      { onStateChange: () => {}, onChatMessage: () => {} }
    );

    // Peer joins, host starts, host buys a property (via direct dev state setup)
    oldHost.handlePeerMessage('peer_2', {
      type: 'hello',
      sessionId: 's_bob',
      name: 'Bob',
      avatar: DEFAULT_AVATAR,
    });
    oldHost.handlePeerMessage('peer_2', { type: 'toggle-ready' });
    oldHost.startGame();
    oldHost.dispatchLocalAction('dev-command', { commandStr: 'setmoney Bob 4200' });

    while (delivered.length > 0) {
      peer.handleHostMessage(delivered.shift()!);
    }

    // Old host abruptly closes!
    oldHost.dispose();

    // Peer extracts hot-standby snapshot and promotes to new HostController
    const snap = peer.getMigrationSnapshot();
    expect(snap.room).not.toBeNull();
    expect(snap.room?.players[1].money).toBe(4200);

    const migratedRoom = cloneState(snap.room!);
    migratedRoom.players[0].isHost = false;
    migratedRoom.players[0].disconnected = true;
    migratedRoom.players[1].isHost = true;
    migratedRoom.turnIndex = 1; // Bob's turn

    const newHost = new HostController({
      initialRoom: migratedRoom,
      hostPeerId: 'peer_2',
      initialStateVersion: snap.stateVersion,
      initialChatHistory: snap.chatHistory,
      effectDelayScale: 0,
      transport: {
        sendToPeer: () => {},
        broadcast: () => {},
      },
      callbacks: {
        onStateChange: () => {},
        onChatMessage: () => {},
      },
    });

    // New host (Bob) rolls dice cleanly from migrated state!
    newHost.dispatchLocalAction('roll-dice', { power: 50 });
    expect(newHost.getStateVersion()).toBeGreaterThan(snap.stateVersion);
    expect(newHost.getRoom().phase).toBe('rolling_animation');
    newHost.dispose();
  });

  it('restores reconnecting peer by sessionId and remaps owned properties', () => {
    const initialRoom = createLobbyRoom({
      code: 'RECN',
      host: { id: 'host_1', sessionId: 's_host', name: 'Alice', avatar: DEFAULT_AVATAR },
    });

    const host = new HostController({
      initialRoom,
      hostPeerId: 'host_1',
      transport: { sendToPeer: () => {}, broadcast: () => {} },
      callbacks: { onStateChange: () => {}, onChatMessage: () => {} },
    });

    host.handlePeerMessage('peer_old', {
      type: 'hello',
      sessionId: 's_bob',
      name: 'Bob',
      avatar: DEFAULT_AVATAR,
    });
    host.handlePeerMessage('peer_old', { type: 'toggle-ready' });
    host.startGame();

    // Assign ownership of Bandung (1) to peer_old
    host.getRoom().board[1].owner = 'peer_old';

    // Peer disconnects mid-game
    host.handlePeerDisconnected('peer_old');
    expect(host.getRoom().players[1].disconnected).toBe(true);

    // Peer reconnects with a fresh peerId ('peer_new') but SAME sessionId ('s_bob')
    host.handlePeerMessage('peer_new', {
      type: 'hello',
      sessionId: 's_bob',
      name: 'Bob',
      avatar: DEFAULT_AVATAR,
    });

    expect(host.getRoom().players[1].id).toBe('peer_new');
    expect(host.getRoom().players[1].disconnected).toBe(false);
    expect(host.getRoom().board[1].owner).toBe('peer_new');
    host.dispose();
  });
});
