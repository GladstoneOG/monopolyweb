// src/components/menu/MenuScreen.tsx
import React, { useState } from 'react';
import type { AvatarConfig, Ruleset } from '../../engine/types';
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
  onPlaySolo: () => void;
  onCreateOnline: () => Promise<void>;
  onJoinOnline: (code: string) => Promise<void>;
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
  onPlaySolo,
  onCreateOnline,
  onJoinOnline,
  busyMessage,
  errorMessage,
}) => {
  const [joinCode, setJoinCode] = useState('');

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinCode.trim() || busyMessage) return;
    void onJoinOnline(joinCode.trim().toUpperCase());
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

        <div className="menu-actions-grid">
          <button
            type="button"
            className="btn-gold menu-big-btn"
            disabled={Boolean(busyMessage)}
            onClick={onPlaySolo}
          >
            🤖 Play vs Bots (Solo)
          </button>
          <button
            type="button"
            className="btn-primary menu-big-btn"
            disabled={Boolean(busyMessage)}
            onClick={() => void onCreateOnline()}
          >
            🌐 Host Online Room (P2P)
          </button>
        </div>

        <form className="room-join-panel" onSubmit={handleJoin}>
          <input
            type="text"
            value={joinCode}
            maxLength={4}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
            placeholder="4-CHAR CODE"
            aria-label="Room Code"
          />
          <button
            type="submit"
            className="btn-secondary"
            disabled={joinCode.length !== 4 || Boolean(busyMessage)}
          >
            Join Room
          </button>
        </form>
      </div>
    </div>
  );
};
