// src/components/lobby/LobbyScreen.tsx
import React, { useState } from 'react';
import type { GameRules, RoomState, Ruleset } from '../../engine/types';
import type { PeerLinkMode } from '../../net/protocol';
import { AvatarSVG } from '../shared/AvatarCreator';

interface LobbyScreenProps {
  room: RoomState;
  myPlayerId: string;
  isHost: boolean;
  isLocalOnly: boolean;
  connectionMode: PeerLinkMode;
  peerModes: Record<string, PeerLinkMode>;
  onUpdateRules: (partial: Partial<GameRules>) => void;
  onAddBot: () => void;
  onRemoveBot: (botId: string) => void;
  onKickPlayer: (playerId: string) => void;
  onToggleReady: () => void;
  onStartGame: () => void;
  onLeave: () => void;
  onToggleChat: () => void;
  onOpenThemes: () => void;
  unreadChat: number;
  errorMessage: string | null;
}

function renderLinkBadge(mode: PeerLinkMode): { label: string; cls: string } {
  switch (mode) {
    case 'local':
      return { label: '🤖 Offline Solo', cls: 'badge-local' };
    case 'p2p-webrtc':
      return { label: '⚡ P2P Direct', cls: 'badge-p2p' };
    case 'ws-relay':
      return { label: '☁️ CF Relay', cls: 'badge-relay' };
    case 'connecting':
      return { label: '🔄 Connecting...', cls: 'badge-connecting' };
    default:
      return { label: '⚠️ Disconnected', cls: 'badge-offline' };
  }
}

export const LobbyScreen: React.FC<LobbyScreenProps> = ({
  room,
  myPlayerId,
  isHost,
  isLocalOnly,
  connectionMode,
  peerModes,
  onUpdateRules,
  onAddBot,
  onRemoveBot,
  onKickPlayer,
  onToggleReady,
  onStartGame,
  onLeave,
  onToggleChat,
  onOpenThemes,
  unreadChat,
  errorMessage,
}) => {
  const [copied, setCopied] = useState(false);

  const me = room.players.find((p) => p.id === myPlayerId);
  const allHumansReady = room.players.every((p) => p.isHost || p.isBot || p.isReady);
  const canStart = isHost && room.players.length >= 2 && allHumansReady;
  const connBadge = renderLinkBadge(connectionMode);

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(room.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // ignore clipboard restrictions
    }
  };

  return (
    <div className="lobby-shell">
      <div className="lobby-card">
        <div className="lobby-header">
          <div>
            <h1 className="lobby-title">
              {room.rules.ruleset === 'Get Rich' ? '✨ GET RICH! Lobby' : '🎩 Classic Monopoly Lobby'}
            </h1>
            <div className="lobby-meta-row">
              {!isLocalOnly && (
                <button type="button" className="lobby-code-badge" onClick={copyCode}>
                  ROOM: <strong>{room.code}</strong> {copied ? '✓ Copied' : '📋'}
                </button>
              )}
              <span className={`conn-pill ${connBadge.cls}`}>{connBadge.label}</span>
            </div>
          </div>

          <div className="lobby-top-actions">
            <button type="button" className="btn-utility" onClick={onOpenThemes}>
              🎨 Themes
            </button>
            <button type="button" className="btn-utility" onClick={onToggleChat}>
              💬 Chat {unreadChat > 0 ? `(${unreadChat})` : ''}
            </button>
            <button type="button" className="btn-secondary" onClick={onLeave}>
              Leave
            </button>
          </div>
        </div>

        {errorMessage && <div className="menu-alert error">⚠️ {errorMessage}</div>}

        <div className="lobby-body-grid">
          {/* Players Roster */}
          <div className="lobby-section">
            <div className="lobby-section-header">
              <h2>Players ({room.players.length} / 4)</h2>
              {isHost && room.players.length < 4 && (
                <button type="button" className="btn-add-bot" onClick={onAddBot}>
                  + Add Bot
                </button>
              )}
            </div>

            <div className="lobby-players-list">
              {room.players.map((p, idx) => {
                const pMode = !p.isBot && p.id !== myPlayerId ? peerModes[p.id] : undefined;
                const slotColors = ['#3b82f6', '#10b981', '#ef4444', '#eab308'];
                return (
                  <div
                    key={p.id}
                    className={`lobby-player-card ${p.isHost ? 'host-border' : ''}`}
                    style={{ borderLeft: `5px solid ${slotColors[idx % 4]}` }}
                  >
                    <AvatarSVG config={p.avatar} size={44} />
                    <div className="lobby-player-info">
                      <div className="lobby-player-name">
                        {p.name} {p.id === myPlayerId ? '(You)' : ''}
                      </div>
                      <div className="lobby-player-tags">
                        {p.isHost && <span className="player-tag host">👑 Host</span>}
                        {p.isBot && <span className="player-tag bot">🤖 Bot</span>}
                        {!p.isHost && !p.isBot && (
                          <span className={`player-tag ${p.isReady ? 'ready' : 'waiting'}`}>
                            {p.isReady ? '✓ Ready' : 'Waiting...'}
                          </span>
                        )}
                        {pMode && (
                          <span className="player-tag link">
                            {pMode === 'p2p-webrtc'
                              ? '⚡ P2P'
                              : pMode === 'ws-relay'
                              ? '☁️ Relay'
                              : '🔄'}
                          </span>
                        )}
                      </div>
                    </div>

                    {isHost && p.id !== myPlayerId && (
                      <button
                        type="button"
                        className="lobby-remove-btn"
                        onClick={() => (p.isBot ? onRemoveBot(p.id) : onKickPlayer(p.id))}
                        title={p.isBot ? 'Remove Bot' : 'Kick Player'}
                      >
                        ✕
                      </button>
                    )}
                  </div>
                );
              })}

              {Array.from({ length: Math.max(0, 4 - room.players.length) }).map((_, i) => (
                <div key={`empty_${i}`} className="lobby-player-card empty-slot">
                  <span>Open Seat — share room code or add a bot</span>
                </div>
              ))}
            </div>
          </div>

          {/* Match Rules */}
          <div className="lobby-section">
            <div className="lobby-section-header">
              <h2>Match Settings</h2>
            </div>

            <div className="settings-list">
              <div className="settings-row">
                <label>Ruleset</label>
                {isHost ? (
                  <select
                    value={room.rules.ruleset}
                    onChange={(e) => onUpdateRules({ ruleset: e.target.value as Ruleset })}
                  >
                    <option value="Get Rich">Get Rich! (Special Rules)</option>
                    <option value="Classic">Classic Monopoly</option>
                  </select>
                ) : (
                  <strong>{room.rules.ruleset}</strong>
                )}
              </div>

              <div className="settings-row">
                <label>Starting Cash</label>
                {isHost ? (
                  <select
                    value={room.rules.startingCash}
                    onChange={(e) => onUpdateRules({ startingCash: Number(e.target.value) })}
                  >
                    <option value={1500}>$1,500</option>
                    <option value={2000}>$2,000</option>
                    <option value={2500}>$2,500</option>
                    <option value={3000}>$3,000</option>
                    <option value={5000}>$5,000</option>
                    <option value={10000}>$10,000</option>
                  </select>
                ) : (
                  <strong>${room.rules.startingCash.toLocaleString()}</strong>
                )}
              </div>

              <div className="settings-row">
                <label>Turn Limit</label>
                {isHost ? (
                  <select
                    value={room.rules.turnLimit}
                    onChange={(e) => onUpdateRules({ turnLimit: Number(e.target.value) })}
                  >
                    <option value={0}>Unlimited</option>
                    <option value={15}>15 Turns</option>
                    <option value={20}>20 Turns</option>
                    <option value={25}>25 Turns</option>
                    <option value={30}>30 Turns</option>
                    <option value={50}>50 Turns</option>
                  </select>
                ) : (
                  <strong>
                    {room.rules.turnLimit === 0 ? 'Unlimited' : `${room.rules.turnLimit} Turns`}
                  </strong>
                )}
              </div>
            </div>

            <div className="rules-summary-box">
              {room.rules.ruleset === 'Get Rich' ? (
                <ul>
                  <li>🏗️ Build up to 4 houses instantly on landing; land again for a Hotel.</li>
                  <li>✈️ <strong>Tile 20 = Airport</strong> ($100 fly anywhere) · 🎉 <strong>Tile 30 = Festival</strong> (x2 rent for 3 full turns).</li>
                  <li>🎰 <strong>Casinos</strong> replace taxes (3-round 3D coin flip: $200 / $400 / $800).</li>
                  <li>🎯 <strong>Power Bar</strong> dice + Odd/Even &amp; Angel cards + Exact GO build bonus.</li>
                  <li>🏆 Instant win via <strong>Tourism Win</strong> (all 6 rail/tourism) or <strong>Line Win</strong> (1 full side).</li>
                </ul>
              ) : (
                <ul>
                  <li>🏘️ Own full color groups to double base rent and build evenly up to Hotels.</li>
                  <li>🔨 Unbought properties go to live multi-player auction.</li>
                  <li>⚖️ Trade cash, deeds, and Get Out of Jail Free cards on your turn.</li>
                  <li>🏆 Bankrupt opponents or lead Net Worth when the turn limit ends.</li>
                </ul>
              )}
            </div>

            <div className="lobby-footer-action">
              {isHost ? (
                <button
                  type="button"
                  className="btn-primary lobby-start-btn"
                  disabled={!canStart}
                  onClick={onStartGame}
                >
                  {room.players.length < 2
                    ? 'Need 2+ Players to Start'
                    : !allHumansReady
                    ? 'Waiting for Players to Ready...'
                    : '🎲 Start Game'}
                </button>
              ) : (
                <button
                  type="button"
                  className={me?.isReady ? 'btn-secondary lobby-start-btn' : 'btn-primary lobby-start-btn'}
                  onClick={onToggleReady}
                >
                  {me?.isReady ? '✓ Ready (Click to Unready)' : '✋ Click When Ready'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
