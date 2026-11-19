// src/components/hud/GetRichVictoryTracker.tsx
import React, { useMemo } from 'react';
import { getVictoryProgress } from '../../engine/winConditions';
import type { PlayerState, TileState } from '../../engine/types';
import { getPlayerColor } from '../../utils/boardGeometry';

interface GetRichVictoryTrackerProps {
  players: readonly PlayerState[];
  board: readonly TileState[];
}

export const GetRichVictoryTracker: React.FC<GetRichVictoryTrackerProps> = React.memo(
  ({ players, board }) => {
    const threats = useMemo(() => {
      return getVictoryProgress(players, board).filter((p) => p.isCloseToWin);
    }, [players, board]);

    if (threats.length === 0) return null;

    return (
      <div className="victory-tracker-bar">
        <span className="victory-tracker-title">⚡ WIN WATCH</span>
        <div className="victory-tracker-pills">
          {threats.map((t) => {
            const player = players.find((p) => p.id === t.playerId);
            if (!player) return null;
            const color = getPlayerColor(players, player.id);
            const tourismClose = t.tourismTotal - t.tourismOwned <= 2;
            const lineClose = t.bestLineTotal - t.bestLineOwned <= 2;
            return (
              <div
                key={t.playerId}
                className="victory-tracker-pill"
                style={{ borderColor: color }}
              >
                <span className="vt-dot" style={{ background: color }} />
                <strong>{player.name}:</strong>
                {tourismClose && (
                  <span className="vt-metric">
                    🚂 Tourism {t.tourismOwned}/{t.tourismTotal}
                  </span>
                )}
                {lineClose && (
                  <span className="vt-metric">
                    📏 {t.bestLineName} {t.bestLineOwned}/{t.bestLineTotal}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }
);
