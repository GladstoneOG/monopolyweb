// src/components/modals/PlayerDetailModal.tsx
import React from 'react';
import { calculateTileRent, getPropertyRentSchedule, ownsMonopoly } from '../../engine/rent';
import type { MonopolyPhase, PlayerState, Ruleset, TileState } from '../../engine/types';
import { getPlayerColor } from '../../utils/boardGeometry';
import { AvatarSVG } from '../shared/AvatarCreator';

interface PlayerDetailModalProps {
  player: PlayerState | null;
  players: readonly PlayerState[];
  board: readonly TileState[];
  dice: [number, number];
  myPlayerId: string;
  activePlayerId: string | null;
  phase: MonopolyPhase;
  ruleset: Ruleset;
  onClose: () => void;
  onStartTrade: (targetId: string) => void;
}

export const PlayerDetailModal: React.FC<PlayerDetailModalProps> = React.memo(
  ({
    player,
    players,
    board,
    dice,
    myPlayerId,
    activePlayerId,
    phase,
    ruleset,
    onClose,
    onStartTrade,
  }) => {
    if (!player) return null;

    const color = getPlayerColor(players, player.id);
    const owned = board.filter((t) => t.owner === player.id);
    const canProposeTrade =
      player.id !== myPlayerId &&
      !player.bankrupt &&
      activePlayerId === myPlayerId &&
      ['roll', 'end_turn', 'action'].includes(phase);

    return (
      <div className="modal-backdrop" onClick={onClose}>
        <div
          className="player-detail-modal"
          style={{ borderColor: color }}
          onClick={(e) => e.stopPropagation()}
        >
          <button type="button" className="player-detail-close" onClick={onClose}>
            ✕
          </button>

          <div className="player-detail-header" style={{ background: `${color}22` }}>
            <AvatarSVG config={player.avatar} size={54} />
            <div>
              <h3>{player.name}</h3>
              <span className="player-detail-role">
                {player.isBot
                  ? '🤖 BOT TYCOON'
                  : player.id === myPlayerId
                  ? '👤 YOU'
                  : '🎮 PLAYER'}
              </span>
            </div>
          </div>

          <div className="player-detail-body">
            <div className="player-detail-stats">
              <div className="stat-box">
                <span>💵 CASH</span>
                <strong className="cash">${player.money.toLocaleString()}</strong>
              </div>
              <div className="stat-box">
                <span>🏆 NET WORTH</span>
                <strong className="worth">${player.netWorth.toLocaleString()}</strong>
              </div>
            </div>

            <div className="detail-section">
              <h4>🔓 SPECIAL CARDS</h4>
              <div className="detail-cards-row">
                {player.getOutOfJailCards > 0 && (
                  <span className="card-badge jail">🎟️ Jail Free ×{player.getOutOfJailCards}</span>
                )}
                {ruleset === 'Get Rich' && player.oddEvenCards > 0 && (
                  <span className="card-badge oddeven">🎯 Odd/Even ×{player.oddEvenCards}</span>
                )}
                {ruleset === 'Get Rich' && player.angelCards > 0 && (
                  <span className="card-badge angel">😇 Angel ×{player.angelCards}</span>
                )}
                {player.getOutOfJailCards === 0 &&
                  (ruleset !== 'Get Rich' ||
                    (player.oddEvenCards === 0 && player.angelCards === 0)) && (
                    <span className="muted-note">No special cards held</span>
                  )}
              </div>
            </div>

            <div className="detail-section">
              <h4>🏠 OWNED PROPERTIES ({owned.length})</h4>
              <div className="detail-props-scroll">
                {owned.length === 0 ? (
                  <span className="muted-note">None owned yet</span>
                ) : (
                  owned.map((tile) => {
                    const rent = calculateTileRent(tile, board, dice[0] + dice[1]);
                    const isMono =
                      tile.type === 'property' && ownsMonopoly(board, tile.color, player.id);
                    const schedule =
                      tile.type === 'property' ? getPropertyRentSchedule(tile) : null;
                    return (
                      <div key={tile.index} className="detail-prop-row">
                        <div className="detail-prop-left">
                          {tile.color ? (
                            <span className={`dot tile-group-${tile.color}`} />
                          ) : (
                            <span>{tile.type === 'railroad' ? '🚂' : '🌴'}</span>
                          )}
                          <strong>{tile.name}</strong>
                          {isMono && <span className="mono-chip">👑</span>}
                          {tile.houses > 0 && (
                            <span className="house-chip">
                              {tile.houses === 5 ? '🏨' : `🏠×${tile.houses}`}
                            </span>
                          )}
                        </div>
                        <div className="detail-prop-right">
                          {tile.mortgaged ? (
                            <span className="mortgaged-pill">MORTGAGED</span>
                          ) : (
                            <span>
                              Rent <strong>${rent}</strong>
                              {schedule && tile.houses === 5 && ` (Hotel $${schedule.hotel})`}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {canProposeTrade && (
              <button
                type="button"
                className="btn-primary detail-trade-btn"
                onClick={() => onStartTrade(player.id)}
              >
                🤝 Propose Trade Deal
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }
);
