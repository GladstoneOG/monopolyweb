// src/components/menu/MenuScreen.tsx
import React, { useState } from 'react';
import type { AvatarConfig, Ruleset } from '../../engine/types';
import type { LobbySummary } from '../../net/roomSession';
import { AvatarCreator } from '../shared/AvatarCreator';

interface MenuScreenProps {
  playerName: string;
  onPlayerNameChange: (name: string) => void;
  avatar: AvatarConfig;
  onAvatarChange: (avatar: AvatarConfig) => void;
  selectedRuleset: Ruleset;
  onRulesetChange: (ruleset: Ruleset) => void;
  isMuted: boolean;
  onToggleMute: () => void;
  onOpenThemes: () => void;
  lobbies: LobbySummary[];
  isLoadingLobbies: boolean;
  onRefreshLobbies: () => void;
  onHostGame: (password: string) => Promise<void>;
  onJoinLobby: (code: string, password?: string) => Promise<void>;
  busyMessage: string | null;
  errorMessage: string | null;
}

export const MenuScreen: React.FC<MenuScreenProps> = ({
  playerName,
  onPlayerNameChange,
  avatar,
  onAvatarChange,
  selectedRuleset,
  onRulesetChange,
  isMuted,
  onToggleMute,
  onOpenThemes,
  lobbies,
  isLoadingLobbies,
  onRefreshLobbies,
  onHostGame,
  onJoinLobby,
  busyMessage,
  errorMessage,
}) => {
  const [hostPassword, setHostPassword] = useState('');
  const [promptLobbyCode, setPromptLobbyCode] = useState<string | null>(null);
  const [joinPassword, setJoinPassword] = useState('');

  const handleHostSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (busyMessage) return;
    void onHostGame(hostPassword.trim());
  };

  const handleLobbyJoinClick = (lobby: LobbySummary) => {
    if (busyMessage) return;
    if (lobby.hasPassword) {
      if (promptLobbyCode === lobby.code) {
        void onJoinLobby(lobby.code, joinPassword.trim());
      } else {
        setPromptLobbyCode(lobby.code);
        setJoinPassword('');
      }
    } else {
      setPromptLobbyCode(null);
      void onJoinLobby(lobby.code);
    }
  };

  return (
    <div className="menu-shell">
      <div className="menu-utility-bar">
        <button type="button" className="btn-utility" onClick={onOpenThemes}>
          🎨 Themes
        </button>
        <button type="button" className="btn-utility" onClick={onToggleMute}>
          {isMuted ? '🔇 SFX Off' : '🔊 SFX On'}
        </button>
      </div>

      <div className="menu-card">
        <div className="menu-header">
          <div className="menu-title-plaque">MONOPOLY</div>
          <p className="menu-subtitle">
            Classic &amp; <strong>Get Rich!</strong> — Host-and-Peer on Cloudflare Workers
          </p>
        </div>

        <div className="menu-mode-selector">
          <button
            type="button"
            className={`mode-card ${selectedRuleset === 'Get Rich' ? 'active-getrich' : ''}`}
            onClick={() => onRulesetChange('Get Rich')}
          >
            <div className="mode-card-title">✨ Get Rich! Mode</div>
            <div className="mode-card-desc">
              Instant builds, Power Bar dice, Airport &amp; Festival, Casino coin flip,
              Angel &amp; Odd/Even cards, Force Acquisitions, Line &amp; Tourism instant wins.
            </div>
          </button>
          <button
            type="button"
            className={`mode-card ${selectedRuleset === 'Classic' ? 'active-classic' : ''}`}
            onClick={() => onRulesetChange('Classic')}
          >
            <div className="mode-card-title">🎩 Classic Monopoly</div>
            <div className="mode-card-desc">
              Traditional color-set monopolies, even building, property auctions,
              Income &amp; Luxury Taxes, Free Parking, and Go To Jail.
            </div>
          </button>
        </div>

        <div className="menu-profile-section">
          <div className="name-input-group">
            <label htmlFor="player-name-input">Tycoon Name</label>
            <input
              id="player-name-input"
              type="text"
              value={playerName}
              maxLength={18}
              onChange={(e) => onPlayerNameChange(e.target.value)}
              placeholder="Enter your name"
            />
          </div>
          <AvatarCreator config={avatar} onChange={onAvatarChange} />
        </div>

        {errorMessage && <div className="menu-alert error">⚠️ {errorMessage}</div>}
        {busyMessage && <div className="menu-alert info">⏳ {busyMessage}</div>}

        {/* Host Game + Optional Password */}
        <form className="host-game-bar" onSubmit={handleHostSubmit}>
          <input
            type="password"
            value={hostPassword}
            maxLength={24}
            onChange={(e) => setHostPassword(e.target.value)}
            placeholder="Optional room password (leave blank for public)"
            aria-label="Optional room password"
            className="host-password-input"
          />
          <button
            type="submit"
            className="btn-primary host-game-btn"
            disabled={Boolean(busyMessage)}
          >
            🌐 Host Game
          </button>
        </form>

        {/* Live Lobbies Browser */}
        <div className="lobby-browser-section">
          <div className="lobby-browser-header">
            <div className="lobby-browser-title">
              <span>🏠 Open Lobbies</span>
              <span className="lobby-count-pill">{lobbies.length}</span>
            </div>
            <button
              type="button"
              className="btn-utility lobby-refresh-btn"
              disabled={isLoadingLobbies}
              onClick={onRefreshLobbies}
            >
              {isLoadingLobbies ? '🔄 Refreshing...' : '↻ Refresh'}
            </button>
          </div>

          <div className="lobby-browser-list">
            {lobbies.length === 0 ? (
              <div className="lobby-browser-empty">
                No active lobbies right now — click <strong>Host Game</strong> above to create one (you can add bots inside the lobby)!
              </div>
            ) : (
              lobbies.map((lobby) => {
                const isFull = lobby.playerCount >= lobby.maxPlayers;
                const isInGame = lobby.status === 'playing';
                const canJoin = !isFull && !isInGame && !busyMessage;
                const showingPw = promptLobbyCode === lobby.code;

                return (
                  <div key={lobby.code} className="lobby-browser-row">
                    <div className="lobby-row-main">
                      <div className="lobby-row-info">
                        <div className="lobby-row-top">
                          <strong className="lobby-host-name">{lobby.hostName}&apos;s Room</strong>
                          <span className={`lobby-rule-pill ${lobby.ruleset === 'Get Rich' ? 'getrich' : 'classic'}`}>
                            {lobby.ruleset === 'Get Rich' ? '✨ Get Rich!' : '🎩 Classic'}
                          </span>
                          {lobby.hasPassword && (
                            <span className="lobby-lock-pill" title="Password required">
                              🔒 Private
                            </span>
                          )}
                        </div>
                        <div className="lobby-row-meta">
                          <span>👥 {lobby.playerCount} / {lobby.maxPlayers}</span>
                          <span className={`lobby-status-dot ${isInGame ? 'playing' : 'open'}`}>
                            {isInGame ? '● In Game' : isFull ? '● Full' : '● Open'}
                          </span>
                          <span className="lobby-code-subtle">#{lobby.code}</span>
                        </div>
                      </div>

                      <button
                        type="button"
                        className="btn-primary lobby-join-btn"
                        disabled={!canJoin}
                        onClick={() => handleLobbyJoinClick(lobby)}
                      >
                        {isInGame
                          ? 'In Game'
                          : isFull
                          ? 'Full'
                          : lobby.hasPassword
                          ? '🔒 Join'
                          : 'Join'}
                      </button>
                    </div>

                    {showingPw && (
                      <form
                        className="lobby-pw-prompt"
                        onSubmit={(e) => {
                          e.preventDefault();
                          if (!joinPassword.trim() || busyMessage) return;
                          void onJoinLobby(lobby.code, joinPassword.trim());
                        }}
                      >
                        <input
                          type="password"
                          autoFocus
                          value={joinPassword}
                          onChange={(e) => setJoinPassword(e.target.value)}
                          placeholder="Enter room password..."
                        />
                        <button
                          type="submit"
                          className="btn-primary mini"
                          disabled={!joinPassword.trim() || Boolean(busyMessage)}
                        >
                          Enter
                        </button>
                        <button
                          type="button"
                          className="btn-utility mini"
                          onClick={() => setPromptLobbyCode(null)}
                        >
                          Cancel
                        </button>
                      </form>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
