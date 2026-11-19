// src/components/modals/DeedModal.tsx
import React from 'react';
import {
  calculateTileRent,
  getPropertyRentSchedule,
  ownsMonopoly,
} from '../../engine/rent';
import type { PlayerState, TileState } from '../../engine/types';

interface DeedModalProps {
  tile: TileState | null;
  board: readonly TileState[];
  players: readonly PlayerState[];
  dice: [number, number];
  myPlayerId: string;
  isMyTurn: boolean;
  onClose: () => void;
  onProposeTrade: (ownerId: string, tileIndex: number) => void;
}

export const DeedModal: React.FC<DeedModalProps> = React.memo(
  ({ tile, board, players, dice, myPlayerId, isMyTurn, onClose, onProposeTrade }) => {
    if (!tile) return null;

    const isProp = tile.type === 'property';
    const isRail = tile.type === 'railroad';
    const isUtil = tile.type === 'utility';
    const diceSum = dice[0] + dice[1];
    const currentRent = calculateTileRent(tile, board, diceSum);
    const schedule = isProp ? getPropertyRentSchedule(tile) : null;
    const isMono = isProp && tile.owner ? ownsMonopoly(board, tile.color, tile.owner) : false;
    const owner = tile.owner ? players.find((p) => p.id === tile.owner) : null;

    return (
      <div className="modal-backdrop" onClick={onClose}>
        <div className="deed-card-modal" onClick={(e) => e.stopPropagation()}>
          <div className="deed-card-layout">
            {/* Left column: Classic Title Deed */}
            <div className="deed-left-col">
              {isProp && (
                <div className="deed-header">
                  <div className={`deed-header-color tile-group-${tile.color}`} />
                  <span className="deed-title">{tile.name}</span>
                </div>
              )}
              {isRail && (
                <div className="deed-header special">
                  <span className="deed-special-emoji">🚂</span>
                  <div className="deed-title">{tile.name}</div>
                </div>
              )}
              {isUtil && (
                <div className="deed-header special">
                  <span className="deed-special-emoji">
                    {tile.name.toLowerCase().includes('bali') ? '🌴' : '🌊'}
                  </span>
                  <div className="deed-title">{tile.name}</div>
                </div>
              )}

              <div className="deed-rents">
                {isProp && schedule && (
                  <>
                    <div className={tile.owner && !tile.mortgaged && tile.houses === 0 && !isMono ? 'active-row' : ''}>
                      <span>Base Rent</span>
                      <strong>${schedule.base}</strong>
                    </div>
                    <div className={tile.owner && !tile.mortgaged && tile.houses === 0 && isMono ? 'active-row' : ''}>
                      <span>With Monopoly</span>
                      <strong>${schedule.monopoly}</strong>
                    </div>
                    {schedule.houses.map((val, idx) => (
                      <div
                        key={idx}
                        className={tile.owner && !tile.mortgaged && tile.houses === idx + 1 ? 'active-row' : ''}
                      >
                        <span>With {idx + 1} House{idx > 0 ? 's' : ''}</span>
                        <strong>${val}</strong>
                      </div>
                    ))}
                    <div className={tile.owner && !tile.mortgaged && tile.houses === 5 ? 'active-row' : ''}>
                      <span>With Hotel</span>
                      <strong>${schedule.hotel}</strong>
                    </div>
                    <div className="deed-divider" />
                    <div>
                      <span>Purchase Price</span>
                      <strong>${tile.price}</strong>
                    </div>
                    <div>
                      <span>House Cost</span>
                      <strong>${tile.housePrice}</strong>
                    </div>
                    <div>
                      <span>Mortgage Value</span>
                      <strong>${tile.mortgageValue}</strong>
                    </div>
                  </>
                )}

                {isRail && (
                  <>
                    <div><span>1 Railroad</span><strong>$25</strong></div>
                    <div><span>2 Railroads</span><strong>$50</strong></div>
                    <div><span>3 Railroads</span><strong>$100</strong></div>
                    <div><span>4 Railroads</span><strong>$200</strong></div>
                    <div className="deed-divider" />
                    <div><span>Purchase Price</span><strong>${tile.price}</strong></div>
                    <div><span>Mortgage Value</span><strong>${tile.mortgageValue}</strong></div>
                  </>
                )}

                {isUtil && (
                  <>
                    <p className="deed-note">1 Tourist Spot owned: 4× dice sum.</p>
                    <p className="deed-note">2 Tourist Spots owned: 10× dice sum.</p>
                    <div className="deed-divider" />
                    <div><span>Purchase Price</span><strong>${tile.price}</strong></div>
                    <div><span>Mortgage Value</span><strong>${tile.mortgageValue}</strong></div>
                  </>
                )}
              </div>
            </div>

            {/* Right column: Live Status */}
            <div className="deed-right-col">
              <div>
                <h3 className="deed-status-heading">Live Status</h3>
                <div className="deed-status-box">
                  <span className="deed-status-label">Owner</span>
                  <strong>
                    {owner ? `👤 ${owner.name}` : 'Unowned (Available)'}
                  </strong>
                  {tile.mortgaged && <span className="mortgaged-pill">MORTGAGED</span>}
                </div>

                {tile.owner && (
                  <div className={`deed-rent-banner ${tile.mortgaged ? 'mortgaged' : ''}`}>
                    <span>Active Rent</span>
                    <strong>${currentRent}</strong>
                  </div>
                )}

                {tile.festivalTurns > 0 && !tile.mortgaged && (
                  <div className="deed-festival-note">
                    👑 Festival Boost Active: Rent ×2 ({tile.festivalTurns} turns left)
                  </div>
                )}
              </div>

              <div className="deed-actions">
                {owner && owner.id !== myPlayerId && (
                  <button
                    type="button"
                    className="btn-gold"
                    disabled={!isMyTurn}
                    onClick={() => onProposeTrade(owner.id, tile.index)}
                  >
                    {isMyTurn ? '🤝 Propose Trade' : '🤝 Trade (Your Turn Only)'}
                  </button>
                )}
                <button type="button" className="btn-primary" onClick={onClose}>
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
);
