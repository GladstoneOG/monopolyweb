// src/components/board/TableMoneyStacks.tsx
import React from 'react';
import type { PlayerState } from '../../engine/types';
import { getPlayerColor } from '../../utils/boardGeometry';

interface TableMoneyStacksProps {
  players: readonly PlayerState[];
}

export const TableMoneyStacks: React.FC<TableMoneyStacksProps> = React.memo(({ players }) => {
  return (
    <>
      {players.map((p, idx) => {
        if (p.bankrupt) return null;

        // Place each player's cash stack cleanly outside the 4 sides of the 638x620 board
        let stackStyle: React.CSSProperties = {};
        if (idx === 0) {
          stackStyle = { top: '-118px', left: '50%', transform: 'translateX(-50%)' };
        } else if (idx === 1) {
          stackStyle = { top: '50%', right: '-212px', transform: 'translateY(-50%) rotateZ(90deg)' };
        } else if (idx === 2) {
          stackStyle = { bottom: '-118px', left: '50%', transform: 'translateX(-50%)' };
        } else if (idx === 3) {
          stackStyle = { top: '50%', left: '-212px', transform: 'translateY(-50%) rotateZ(-90deg)' };
        }

        let temp = Math.max(0, p.money);
        const stacks: Array<{ val: number; count: number }> = [];
        for (const denom of [500, 100, 50, 10]) {
          const c = Math.floor(temp / denom);
          temp %= denom;
          if (c > 0) stacks.push({ val: denom, count: Math.min(6, c) });
        }
        if (stacks.length === 0 && p.money > 0) {
          stacks.push({ val: 10, count: 1 });
        }

        const color = getPlayerColor(players, p.id);
        // Exact inverse of parent board (rotateX 42, rotateZ 45) + container rotateZ (0 / 90 / 0 / -90)
        const labelRotZ = idx === 1 ? -135 : idx === 3 ? 45 : -45;
        const displayName = p.name.length > 14 ? `${p.name.slice(0, 13)}…` : p.name;

        return (
          <div
            key={`stack_${p.id}`}
            className="table-money-stack-container"
            style={{ ...stackStyle, ['--owner-color' as string]: color }}
          >
            <div className="table-money-row">
              {stacks.map((s) => (
                <div key={s.val} className="table-money-stack">
                  {Array.from({ length: s.count }).map((_, bIdx) => (
                    <div
                      key={bIdx}
                      className={`table-bill val-${s.val}`}
                      style={{
                        transform: `translate3d(0, 0, ${bIdx * 2.5}px) rotateZ(${
                          bIdx % 2 === 0 ? 3 : -3
                        }deg)`,
                      }}
                    >
                      <div className="table-bill-inner">
                        <div className="table-bill-ellipse">
                          <span className="table-bill-center-val">M</span>
                        </div>
                        <span className="table-bill-corner tl">{s.val}</span>
                        <span className="table-bill-corner br">{s.val}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ))}

              {(p.getOutOfJailCards > 0 || p.oddEvenCards > 0 || p.angelCards > 0) && (
                <div className="table-3d-jailcard-stack">
                  {p.getOutOfJailCards > 0 && (
                    <div className="table-3d-card jail-free-card">
                      <div className="card-face-mini">Jail<br />Free</div>
                    </div>
                  )}
                  {p.oddEvenCards > 0 && (
                    <div className="table-3d-card odd-even-card">
                      <div className="card-face-mini">Odd<br />Even</div>
                    </div>
                  )}
                  {p.angelCards > 0 && (
                    <div className="table-3d-card angel-card">
                      <div className="card-face-mini">Angel</div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Upright screen-parallel billboard plaque (never squished or foreshortened) */}
            <div
              className="table-stack-label-anchor"
              style={{
                transform: `translate3d(-50%, 0, 44px) rotateZ(${labelRotZ}deg) rotateX(-42deg)`,
              }}
            >
              <div className="table-stack-label" style={{ borderColor: color }}>
                <span className="table-player-dot" style={{ background: color }} />
                <span className="table-player-name">{displayName}</span>
                <span className="table-player-cash">${p.money.toLocaleString()}</span>
              </div>
            </div>
          </div>
        );
      })}
    </>
  );
});
