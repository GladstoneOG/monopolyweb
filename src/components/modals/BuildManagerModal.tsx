// src/components/modals/BuildManagerModal.tsx
import React, { useMemo } from 'react';
import { ownsMonopoly } from '../../engine/rent';
import type {
  MonopolyActionType,
  PlayerState,
  Ruleset,
  TileState,
} from '../../engine/types';
import { sfx } from '../../utils/audio';

interface BuildManagerModalProps {
  isOpen: boolean;
  board: readonly TileState[];
  me: PlayerState | null;
  isMyTurn: boolean;
  ruleset: Ruleset;
  onAction: (action: MonopolyActionType, payload?: unknown) => void;
  onClose: () => void;
}

export const BuildManagerModal: React.FC<BuildManagerModalProps> = React.memo(
  ({ isOpen, board, me, isMyTurn, ruleset, onAction, onClose }) => {
    const grouped = useMemo(() => {
      if (!me) return [];
      const groups: Record<string, TileState[]> = {
        brown: [],
        lightblue: [],
        pink: [],
        orange: [],
        red: [],
        yellow: [],
        green: [],
        darkblue: [],
        railroad: [],
        utility: [],
      };
      for (const tile of board) {
        if (tile.owner !== me.id) continue;
        if (tile.type === 'property' && tile.color) groups[tile.color].push(tile);
        else if (tile.type === 'railroad') groups.railroad.push(tile);
        else if (tile.type === 'utility') groups.utility.push(tile);
      }
      return Object.entries(groups).filter(([, list]) => list.length > 0);
    }, [board, me]);

    if (!isOpen || !me) return null;

    const isGetRich = ruleset === 'Get Rich';

    return (
      <div className="modal-backdrop" onClick={onClose}>
        <div className="build-manager-modal" onClick={(e) => e.stopPropagation()}>
          <div className="modal-top-bar">
            <h3>🏘️ Property Portfolio &amp; Build Manager</h3>
            <button type="button" className="icon-close-btn small" onClick={onClose}>
              ✕
            </button>
          </div>

          <div className="monopoly-build-sections-container">
            {grouped.length === 0 ? (
              <div className="build-empty-state">
                No owned properties yet. Buy land when you land on it!
              </div>
            ) : (
              grouped.map(([groupKey, list]) => {
                const isColor = groupKey !== 'railroad' && groupKey !== 'utility';
                const isMono =
                  isColor && ownsMonopoly(board, list[0].color, me.id);

                return (
                  <div key={groupKey} className="build-group-section">
                    <div className="build-group-header">
                      {isColor && (
                        <span className={`build-group-color-dot tile-group-${groupKey}`} />
                      )}
                      <span className="build-group-title">
                        {isColor ? `${groupKey} Group` : `${groupKey}s`}
                      </span>
                      {isMono && <span className="build-group-badge">👑 Monopoly</span>}
                    </div>

                    <div className="build-properties-list">
                      {list.map((tile) => {
                        const isProp = tile.type === 'property';
                        const unmortgageCost = Math.floor((tile.mortgageValue ?? 0) * 1.1);
                        const sellRefund = Math.floor((tile.housePrice ?? 0) / 2);

                        return (
                          <div
                            key={tile.index}
                            className={`build-property-row ${
                              tile.index === me.position ? 'current-tile-highlight' : ''
                            }`}
                          >
                            <div className="build-prop-info">
                              <span className="build-prop-name">{tile.name}</span>
                              <span className="build-prop-status">
                                {tile.mortgaged
                                  ? 'Mortgaged'
                                  : tile.houses === 5
                                  ? '🏨 Hotel'
                                  : tile.houses === 0
                                  ? 'Vacant Land'
                                  : `🏠 ${tile.houses} House${tile.houses > 1 ? 's' : ''}`}
                              </span>
                            </div>

                            <div className="build-prop-actions">
                              {isProp && !tile.mortgaged && !isGetRich && (
                                <button
                                  type="button"
                                  className="build-action-btn build-add"
                                  disabled={
                                    !isMyTurn ||
                                    !isMono ||
                                    tile.houses >= 5 ||
                                    me.money < (tile.housePrice ?? 0)
                                  }
                                  onClick={() => {
                                    onAction('build-house', tile.index);
                                    sfx.playUpgrade();
                                  }}
                                >
                                  🏗️ Build (${tile.housePrice})
                                </button>
                              )}

                              {tile.mortgaged ? (
                                <button
                                  type="button"
                                  className="build-action-btn build-unmortgage"
                                  disabled={!isMyTurn || me.money < unmortgageCost}
                                  onClick={() => {
                                    onAction('unmortgage-property', tile.index);
                                    sfx.playMoney();
                                  }}
                                >
                                  🏦 Unmortgage (${unmortgageCost})
                                </button>
                              ) : isProp && tile.houses > 0 ? (
                                <button
                                  type="button"
                                  className="build-action-btn build-sell"
                                  disabled={!isMyTurn}
                                  onClick={() => {
                                    onAction('sell-house', tile.index);
                                    sfx.playMoney();
                                  }}
                                >
                                  📉 Sell (+${sellRefund})
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  className="build-action-btn build-mortgage"
                                  disabled={!isMyTurn}
                                  onClick={() => {
                                    onAction('mortgage-property', tile.index);
                                    sfx.playMoney();
                                  }}
                                >
                                  💰 Mortgage (+${tile.mortgageValue})
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <button type="button" className="btn-primary build-manager-done-btn" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    );
  }
);
