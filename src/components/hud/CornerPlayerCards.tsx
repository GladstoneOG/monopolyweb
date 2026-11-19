// src/components/hud/CornerPlayerCards.tsx
import React, { useMemo } from 'react';
import type { PlayerState, Ruleset } from '../../engine/types';
import { getPlayerColor } from '../../utils/boardGeometry';
import { AvatarSVG } from '../shared/AvatarCreator';
import { AnimatedCashBadge } from './AnimatedCashBadge';

interface CornerPlayerCardsProps {
  players: readonly PlayerState[];
  turnIndex: number;
  myPlayerId: string;
  ruleset: Ruleset;
  isFrozen: boolean;
  onSelectPlayer: (playerId: string) => void;
}

export const CornerPlayerCards: React.FC<CornerPlayerCardsProps> = React.memo(
  ({ players, turnIndex, myPlayerId, ruleset, isFrozen, onSelectPlayer }) => {
    const ranks = useMemo(() => {
      const sorted = [...players].sort((a, b) => {
        if (a.bankrupt && !b.bankrupt) return 1;
        if (!a.bankrupt && b.bankrupt) return -1;
        return b.netWorth - a.netWorth;
      });
      const map: Record<string, number> = {};
      let r = 1;
      for (const p of sorted) {
        map[p.id] = p.bankrupt ? players.length : r++;
      }
      return map;
    }, [players]);

    const cornerClasses = ['top-right', 'bottom-right', 'bottom-left', 'top-left'];

    return (
      <div className="monopoly-corner-cards">
        {players.map((p, idx) => {
          const color = getPlayerColor(players, p.id);
          const isActive = idx === turnIndex;
          const rank = ranks[p.id] ?? idx + 1;
          const rankText =
            rank === 1 ? '🥇 1st' : rank === 2 ? '2nd' : rank === 3 ? '3rd' : '4th';

          return (
            <div
              key={p.id}
              className={`corner-card ${cornerClasses[idx % 4]} ${
                isActive ? 'active-turn' : ''
              } ${p.bankrupt ? 'bankrupt-player' : ''}`}
              style={{ borderLeft: `6px solid ${color}` }}
              onClick={() => onSelectPlayer(p.id)}
            >
              <div className={`corner-rank-badge rank-${rank}`}>{rankText}</div>

              <div
                className="corner-avatar-wrapper"
                style={{
                  borderColor: color,
                  boxShadow: `0 3px 8px rgba(0,0,0,0.16), 0 0 8px ${color}66`,
                }}
              >
                <AvatarSVG config={p.avatar} size={32} />
              </div>

              <div className="corner-card-details">
                <div className="corner-card-name">
                  <span>
                    {p.name} {p.id === myPlayerId ? '(You)' : ''}
                  </span>
                  {p.status === 'managing' && (
                    <span className="corner-status-pill managing">🛠️ Managing</span>
                  )}
                  {p.status === 'trading' && (
                    <span className="corner-status-pill trading">🤝 Trading</span>
                  )}
                  {p.disconnected && (
                    <span className="corner-status-pill offline">📡 Offline</span>
                  )}
                </div>

                <AnimatedCashBadge money={p.money} isFrozen={isFrozen} />

                <div className="corner-card-worth">
                  Worth: ${p.netWorth.toLocaleString()}
                </div>

                <div className="corner-card-badges">
                  {p.inJail && <span className="jail-badge">🚨 JAIL</span>}
                  {p.getOutOfJailCards > 0 && (
                    <span className="card-badge jail">🔓 x{p.getOutOfJailCards}</span>
                  )}
                  {ruleset === 'Get Rich' && p.oddEvenCards > 0 && (
                    <span className="card-badge oddeven">🎯 x{p.oddEvenCards}</span>
                  )}
                  {ruleset === 'Get Rich' && p.angelCards > 0 && (
                    <span className="card-badge angel">😇 x{p.angelCards}</span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  }
);
