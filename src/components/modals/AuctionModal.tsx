// src/components/modals/AuctionModal.tsx
import React from 'react';
import { getPropertyRentSchedule } from '../../engine/rent';
import type {
  AuctionState,
  MonopolyActionType,
  PlayerState,
  TileState,
} from '../../engine/types';
import { AvatarSVG } from '../shared/AvatarCreator';

interface AuctionModalProps {
  auctionState: AuctionState | null;
  board: readonly TileState[];
  players: readonly PlayerState[];
  myPlayerId: string;
  onAction: (action: MonopolyActionType, payload?: unknown) => void;
}

export const AuctionModal: React.FC<AuctionModalProps> = React.memo(
  ({ auctionState, board, players, myPlayerId, onAction }) => {
    if (!auctionState) return null;
    const tile = board[auctionState.tileIndex];
    if (!tile) return null;

    const activeBidderId = auctionState.bidders[auctionState.activeBidderIndex];
    const activeBidder = players.find((p) => p.id === activeBidderId);
    const isMyBid = activeBidderId === myPlayerId;
    const myPlayer = players.find((p) => p.id === myPlayerId);
    const highestBidderName = auctionState.highestBidder
      ? players.find((p) => p.id === auctionState.highestBidder)?.name ?? 'Unknown'
      : 'None';

    const bid10 = Math.max(10, auctionState.highestBid + 10);
    const bid50 = Math.max(10, auctionState.highestBid + 50);
    const schedule = tile.type === 'property' ? getPropertyRentSchedule(tile) : null;

    return (
      <div className="modal-backdrop">
        <div className="auction-modal-card">
          <div className="auction-header">
            <h2>🔨 PROPERTY AUCTION</h2>
            <p>Highest bidder claims the title deed!</p>
          </div>

          <div className="auction-summary">
            <div className="auction-tile-badge">
              {tile.color && (
                <div className={`auction-color-bar tile-group-${tile.color}`} />
              )}
              <strong>{tile.name}</strong>
              <span>List Price: ${tile.price}</span>
            </div>
            <div className="auction-bid-readout">
              <span className="auction-bid-label">CURRENT BID</span>
              <div className="auction-bid-value">${auctionState.highestBid}</div>
              <div className="auction-leader">
                Leader: <strong>{highestBidderName}</strong>
              </div>
            </div>
          </div>

          {schedule && (
            <div className="auction-rent-grid">
              <div><span>Base</span><strong>${schedule.base}</strong></div>
              <div><span>Mono</span><strong>${schedule.monopoly}</strong></div>
              <div><span>1H</span><strong>${schedule.houses[0]}</strong></div>
              <div><span>2H</span><strong>${schedule.houses[1]}</strong></div>
              <div><span>3H</span><strong>${schedule.houses[2]}</strong></div>
              <div><span>4H</span><strong>${schedule.houses[3]}</strong></div>
              <div className="hotel-cell"><span>🏨 Hotel</span><strong>${schedule.hotel}</strong></div>
            </div>
          )}

          <div className="auction-bidders-grid">
            {players
              .filter((p) => !p.bankrupt)
              .map((p) => {
                const stillIn = auctionState.bidders.includes(p.id);
                const isTurn = activeBidderId === p.id;
                return (
                  <div
                    key={p.id}
                    className={`auction-bidder-card ${isTurn ? 'active' : ''} ${
                      !stillIn ? 'folded' : ''
                    }`}
                  >
                    <div className="auction-bidder-top">
                      <AvatarSVG config={p.avatar} size={22} />
                      <span>{p.name}</span>
                    </div>
                    <div className="auction-bidder-cash">Cash: ${p.money}</div>
                    {!stillIn && <span className="folded-tag">Folded</span>}
                  </div>
                );
              })}
          </div>

          {isMyBid ? (
            <div className="auction-controls">
              <div className="auction-your-turn">👉 Your turn to bid or fold!</div>
              <div className="auction-bid-buttons">
                <button
                  type="button"
                  className="btn-primary"
                  disabled={!myPlayer || myPlayer.money < bid10}
                  onClick={() => onAction('auction-bid', { bid: bid10 })}
                >
                  Bid ${bid10}
                </button>
                <button
                  type="button"
                  className="btn-gold"
                  disabled={!myPlayer || myPlayer.money < bid50}
                  onClick={() => onAction('auction-bid', { bid: bid50 })}
                >
                  Bid ${bid50}
                </button>
              </div>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => onAction('auction-pass')}
              >
                Fold (Pass)
              </button>
            </div>
          ) : (
            <div className="auction-waiting">
              ⏳ Waiting for <strong>{activeBidder?.name ?? 'opponent'}</strong> to bid...
            </div>
          )}
        </div>
      </div>
    );
  }
);
