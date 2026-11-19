// src/components/modals/TradeModals.tsx
import React from 'react';
import { calculateForceAcquireWorth, calculateTileRent } from '../../engine/rent';
import type {
  MonopolyActionType,
  PlayerState,
  Ruleset,
  TileState,
  TradeOffer,
} from '../../engine/types';
import { sfx } from '../../utils/audio';
import { AvatarSVG } from '../shared/AvatarCreator';

export interface TradeDraftState {
  targetId: string;
  offeredProperties: number[];
  offeredMoney: number;
  offeredJailCards: number;
  demandedProperties: number[];
  demandedMoney: number;
  demandedJailCards: number;
}

interface TradeEditorModalProps {
  draft: TradeDraftState;
  onUpdateDraft: (updater: (prev: TradeDraftState) => TradeDraftState) => void;
  me: PlayerState;
  target: PlayerState;
  board: readonly TileState[];
  ruleset: Ruleset;
  isCounterOffer: boolean;
  onPickFromBoard: (side: 'me' | 'them') => void;
  onSend: () => void;
  onCancel: () => void;
}

export function isTileTradable(
  tile: TileState,
  board: readonly TileState[],
  ruleset: Ruleset
): boolean {
  if (tile.type !== 'property' && tile.type !== 'railroad' && tile.type !== 'utility') {
    return false;
  }
  if (ruleset === 'Get Rich') return true;
  if (tile.type !== 'property' || !tile.color) return true;
  return !board.some((t) => t.type === 'property' && t.color === tile.color && t.houses > 0);
}

export const TradeEditorModal: React.FC<TradeEditorModalProps> = React.memo(
  ({
    draft,
    onUpdateDraft,
    me,
    target,
    board,
    ruleset,
    isCounterOffer,
    onPickFromBoard,
    onSend,
    onCancel,
  }) => {
    const myProps = board.filter((t) => t.owner === me.id);
    const targetProps = board.filter((t) => t.owner === target.id);

    const offeredWorth = draft.offeredProperties.reduce(
      (sum, idx) => sum + (board[idx] ? calculateForceAcquireWorth(board[idx]) : 0),
      0
    );
    const demandedWorth = draft.demandedProperties.reduce(
      (sum, idx) => sum + (board[idx] ? calculateForceAcquireWorth(board[idx]) : 0),
      0
    );
    const totalOffered = offeredWorth + draft.offeredMoney + draft.offeredJailCards * 50;
    const totalDemanded = demandedWorth + draft.demandedMoney + draft.demandedJailCards * 50;
    const diff = totalOffered - totalDemanded;

    const autoBalance = () => {
      const propDiff =
        demandedWorth +
        draft.demandedJailCards * 50 -
        (offeredWorth + draft.offeredJailCards * 50);
      if (propDiff > 0) {
        onUpdateDraft((d) => ({
          ...d,
          offeredMoney: Math.min(me.money, propDiff),
          demandedMoney: 0,
        }));
      } else if (propDiff < 0) {
        onUpdateDraft((d) => ({
          ...d,
          offeredMoney: 0,
          demandedMoney: Math.min(target.money, -propDiff),
        }));
      } else {
        onUpdateDraft((d) => ({ ...d, offeredMoney: 0, demandedMoney: 0 }));
      }
      sfx.playMoney();
    };

    const toggleProp = (side: 'me' | 'them', idx: number, checked: boolean) => {
      onUpdateDraft((d) => {
        const key = side === 'me' ? 'offeredProperties' : 'demandedProperties';
        const next = checked
          ? [...new Set([...d[key], idx])]
          : d[key].filter((x) => x !== idx);
        return { ...d, [key]: next };
      });
    };

    return (
      <div className="modal-backdrop" onClick={onCancel}>
        <div className="trade-editor-modal" onClick={(e) => e.stopPropagation()}>
          <div className="modal-top-bar">
            <h3>{isCounterOffer ? '🔄 Counter-Offer Trade' : '🤝 Propose Trade Deal'}</h3>
            <button type="button" className="icon-close-btn small" onClick={onCancel}>
              ✕
            </button>
          </div>

          <div className="trade-columns">
            {/* Offered side */}
            <div className="trade-col">
              <div className="trade-col-header offer">
                <AvatarSVG config={me.avatar} size={22} />
                <span>YOUR OFFER</span>
              </div>

              <label className="trade-field-label">
                CASH (Max ${me.money})
                <input
                  type="number"
                  min={0}
                  max={me.money}
                  value={draft.offeredMoney}
                  onChange={(e) =>
                    onUpdateDraft((d) => ({
                      ...d,
                      offeredMoney: Math.min(
                        me.money,
                        Math.max(0, Number.parseInt(e.target.value, 10) || 0)
                      ),
                    }))
                  }
                />
              </label>

              {me.getOutOfJailCards > 0 && (
                <label className="trade-field-label">
                  JAIL CARDS (Max {me.getOutOfJailCards})
                  <input
                    type="number"
                    min={0}
                    max={me.getOutOfJailCards}
                    value={draft.offeredJailCards}
                    onChange={(e) =>
                      onUpdateDraft((d) => ({
                        ...d,
                        offeredJailCards: Math.min(
                          me.getOutOfJailCards,
                          Math.max(0, Number.parseInt(e.target.value, 10) || 0)
                        ),
                      }))
                    }
                  />
                </label>
              )}

              <div className="trade-props-header">
                <span>PROPERTIES</span>
                <button
                  type="button"
                  className="btn-gold mini"
                  onClick={() => onPickFromBoard('me')}
                >
                  🗺️ Pick on Board
                </button>
              </div>

              <div className="trade-props-list">
                {myProps.length === 0 ? (
                  <span className="muted-note">No properties owned</span>
                ) : (
                  myProps.map((tile) => {
                    const tradable = isTileTradable(tile, board, ruleset);
                    const rent = calculateTileRent(tile, board, 7);
                    return (
                      <label
                        key={tile.index}
                        className={`trade-prop-item ${!tradable ? 'disabled' : ''}`}
                      >
                        <input
                          type="checkbox"
                          disabled={!tradable}
                          checked={draft.offeredProperties.includes(tile.index)}
                          onChange={(e) => toggleProp('me', tile.index, e.target.checked)}
                        />
                        <div className="trade-prop-meta">
                          <div className="trade-prop-title">
                            {tile.color && <span className={`dot tile-group-${tile.color}`} />}
                            <strong>{tile.name}</strong>
                            {tile.houses > 0 && (
                              <span className="house-chip">
                                {tile.houses === 5 ? '🏨' : `🏠×${tile.houses}`}
                              </span>
                            )}
                          </div>
                          <span className="trade-prop-sub">
                            Worth ${calculateForceAcquireWorth(tile)} · Rent ${rent}
                          </span>
                        </div>
                      </label>
                    );
                  })
                )}
              </div>
            </div>

            {/* Demanded side */}
            <div className="trade-col">
              <div className="trade-col-header demand">
                <AvatarSVG config={target.avatar} size={22} />
                <span>REQUEST FROM {target.name.toUpperCase()}</span>
              </div>

              <label className="trade-field-label">
                CASH (Max ${target.money})
                <input
                  type="number"
                  min={0}
                  max={target.money}
                  value={draft.demandedMoney}
                  onChange={(e) =>
                    onUpdateDraft((d) => ({
                      ...d,
                      demandedMoney: Math.min(
                        target.money,
                        Math.max(0, Number.parseInt(e.target.value, 10) || 0)
                      ),
                    }))
                  }
                />
              </label>

              {target.getOutOfJailCards > 0 && (
                <label className="trade-field-label">
                  JAIL CARDS (Max {target.getOutOfJailCards})
                  <input
                    type="number"
                    min={0}
                    max={target.getOutOfJailCards}
                    value={draft.demandedJailCards}
                    onChange={(e) =>
                      onUpdateDraft((d) => ({
                        ...d,
                        demandedJailCards: Math.min(
                          target.getOutOfJailCards,
                          Math.max(0, Number.parseInt(e.target.value, 10) || 0)
                        ),
                      }))
                    }
                  />
                </label>
              )}

              <div className="trade-props-header">
                <span>PROPERTIES</span>
                <button
                  type="button"
                  className="btn-gold mini"
                  onClick={() => onPickFromBoard('them')}
                >
                  🗺️ Pick on Board
                </button>
              </div>

              <div className="trade-props-list">
                {targetProps.length === 0 ? (
                  <span className="muted-note">No properties owned</span>
                ) : (
                  targetProps.map((tile) => {
                    const tradable = isTileTradable(tile, board, ruleset);
                    const rent = calculateTileRent(tile, board, 7);
                    return (
                      <label
                        key={tile.index}
                        className={`trade-prop-item ${!tradable ? 'disabled' : ''}`}
                      >
                        <input
                          type="checkbox"
                          disabled={!tradable}
                          checked={draft.demandedProperties.includes(tile.index)}
                          onChange={(e) => toggleProp('them', tile.index, e.target.checked)}
                        />
                        <div className="trade-prop-meta">
                          <div className="trade-prop-title">
                            {tile.color && <span className={`dot tile-group-${tile.color}`} />}
                            <strong>{tile.name}</strong>
                            {tile.houses > 0 && (
                              <span className="house-chip">
                                {tile.houses === 5 ? '🏨' : `🏠×${tile.houses}`}
                              </span>
                            )}
                          </div>
                          <span className="trade-prop-sub">
                            Worth ${calculateForceAcquireWorth(tile)} · Rent ${rent}
                          </span>
                        </div>
                      </label>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          <div className="trade-balance-box">
            <div className="trade-balance-totals">
              <span>Offer Total: <strong>${totalOffered}</strong></span>
              <span>Request Total: <strong>${totalDemanded}</strong></span>
            </div>
            <div className="trade-balance-bottom">
              <span className={diff === 0 ? 'balanced' : diff > 0 ? 'overpay' : 'underpay'}>
                {diff === 0
                  ? '⚖️ Balanced Trade'
                  : diff > 0
                  ? `📈 You offer +$${diff} more`
                  : `📉 You request +$${-diff} more`}
              </span>
              <button type="button" className="btn-primary mini" onClick={autoBalance}>
                ⚖️ Auto-Balance Cash
              </button>
            </div>
          </div>

          <div className="trade-footer-actions">
            <button type="button" className="btn-primary" onClick={onSend}>
              📤 Send Offer
            </button>
            <button type="button" className="btn-secondary" onClick={onCancel}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }
);

interface IncomingTradeModalProps {
  trade: TradeOffer;
  sender: PlayerState;
  board: readonly TileState[];
  onAction: (action: MonopolyActionType) => void;
  onCounterOffer: () => void;
  onViewBoard: () => void;
}

export const IncomingTradeModal: React.FC<IncomingTradeModalProps> = React.memo(
  ({ trade, sender, board, onAction, onCounterOffer, onViewBoard }) => {
    return (
      <div className="modal-backdrop">
        <div className="incoming-trade-card">
          <h3>🤝 INCOMING TRADE OFFER</h3>
          <p className="trade-intro">
            <strong>{sender.name}</strong> proposed a trade:
          </p>

          <div className="trade-incoming-grid">
            <div className="trade-side-box">
              <h4 className="offer">THEY OFFER</h4>
              {trade.senderMoney > 0 && <div>💵 Cash: <strong>${trade.senderMoney}</strong></div>}
              {trade.senderJailCards > 0 && (
                <div>🎟️ Jail Cards: <strong>{trade.senderJailCards}</strong></div>
              )}
              {trade.senderProperties.map((idx) => {
                const tile = board[idx];
                if (!tile) return null;
                return (
                  <div key={idx} className="trade-summary-prop">
                    {tile.color && <span className={`dot tile-group-${tile.color}`} />}
                    <span>
                      {tile.name} (${calculateForceAcquireWorth(tile)})
                    </span>
                  </div>
                );
              })}
              {trade.senderMoney === 0 &&
                trade.senderJailCards === 0 &&
                trade.senderProperties.length === 0 && (
                  <span className="muted-note">Nothing</span>
                )}
            </div>

            <div className="trade-side-box">
              <h4 className="demand">THEY DEMAND</h4>
              {trade.receiverMoney > 0 && <div>💵 Cash: <strong>${trade.receiverMoney}</strong></div>}
              {trade.receiverJailCards > 0 && (
                <div>🎟️ Jail Cards: <strong>{trade.receiverJailCards}</strong></div>
              )}
              {trade.receiverProperties.map((idx) => {
                const tile = board[idx];
                if (!tile) return null;
                return (
                  <div key={idx} className="trade-summary-prop">
                    {tile.color && <span className={`dot tile-group-${tile.color}`} />}
                    <span>
                      {tile.name} (${calculateForceAcquireWorth(tile)})
                    </span>
                  </div>
                );
              })}
              {trade.receiverMoney === 0 &&
                trade.receiverJailCards === 0 &&
                trade.receiverProperties.length === 0 && (
                  <span className="muted-note">Nothing</span>
                )}
            </div>
          </div>

          <div className="incoming-trade-actions">
            <button type="button" className="btn-primary" onClick={() => onAction('trade-accept')}>
              ✓ Accept
            </button>
            <button type="button" className="btn-blue" onClick={onCounterOffer}>
              🔄 Counter
            </button>
            <button type="button" className="btn-gold" onClick={onViewBoard}>
              👁️ View Board
            </button>
            <button type="button" className="btn-secondary" onClick={() => onAction('trade-decline')}>
              ✕ Decline
            </button>
          </div>
        </div>
      </div>
    );
  }
);
