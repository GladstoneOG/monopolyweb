// src/components/board/PlayerTokensLayer.tsx
import React from 'react';
import type { PlayerState } from '../../engine/types';
import { getPlayerColor, getTileLocalCoords } from '../../utils/boardGeometry';
import { AvatarSVG } from '../shared/AvatarCreator';

interface PlayerTokensLayerProps {
  players: readonly PlayerState[];
  visualPositions: Record<string, number>;
  movingSteps: Record<string, number>;
  activePlayerId: string | null;
  hidden: boolean;
}

export const PlayerTokensLayer: React.FC<PlayerTokensLayerProps> = React.memo(
  ({ players, visualPositions, movingSteps, activePlayerId, hidden }) => {
    if (hidden) return null;

    const activeList = players.filter((p) => !p.bankrupt);

    return (
      <>
        {activeList.map((p) => {
          const tilePos = visualPositions[p.id] ?? p.position;
          const sameSpace = activeList.filter(
            (other) => (visualPositions[other.id] ?? other.position) === tilePos
          );
          const idxOnSpace = sameSpace.indexOf(p);
          const totalOnSpace = sameSpace.length;

          const coords = getTileLocalCoords(tilePos);
          let dx = 0;
          let dy = 0;
          if (totalOnSpace > 1) {
            const angle = (idxOnSpace / totalOnSpace) * Math.PI * 2;
            dx = Math.cos(angle) * 13;
            dy = Math.sin(angle) * 13;
          }

          const steps = movingSteps[p.id] ?? 0;
          const isHopping = steps > 0;
          const color = getPlayerColor(players, p.id);

          return (
            <div
              key={p.id}
              className={`monopoly-player-token ${isHopping ? 'hopping' : ''}`}
              style={{
                left: `calc(50% + ${coords.x + dx}px)`,
                top: `calc(50% + ${coords.y + dy}px)`,
              }}
            >
              <div className="token-inner">
                {p.id === activePlayerId && (
                  <div
                    className={`board-turn-arrow ${isHopping ? 'higher' : ''}`}
                    style={{ ['--player-color' as string]: color }}
                  >
                    ▼
                  </div>
                )}

                {p.status && (
                  <div className={`player-status-badge ${p.status}`}>
                    {p.status === 'managing' ? '🛠️ Managing...' : '🤝 Trading...'}
                  </div>
                )}

                {steps > 0 && <div className="token-countdown-badge">{steps}</div>}

                <div
                  className="token-pedestal"
                  style={{
                    background: color,
                    boxShadow: `0 2px 4px rgba(0,0,0,0.45), 0 0 10px ${color}`,
                  }}
                />

                <div
                  className="token-avatar-wrapper"
                  style={{
                    borderColor: color,
                    boxShadow: `0 4px 10px rgba(0,0,0,0.4), 0 0 10px ${color}aa`,
                  }}
                >
                  <AvatarSVG config={p.avatar} size={36} />
                </div>
              </div>
            </div>
          );
        })}
      </>
    );
  }
);
