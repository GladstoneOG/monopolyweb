// src/components/modals/PhaseDecisionModals.tsx
import React from 'react';
import type {
  CardDefinition,
  DebtState,
  GameLifecycle,
  MonopolyActionType,
  MonopolyPhase,
  PendingForceAcquire,
  PendingRent,
  PlayerState,
  Ruleset,
  TileState,
} from '../../engine/types';
import { sfx } from '../../utils/audio';

interface PhaseDecisionModalsProps {
  gameState: GameLifecycle;
  phase: MonopolyPhase;
  ruleset: Ruleset;
  myPlayerId: string;
  isHost: boolean;
  isAnimating: boolean;
  players: readonly PlayerState[];
  activePlayer: PlayerState | null;
  board: readonly TileState[];
  currentCard: CardDefinition | null;
  cardType: 'chance' | 'chest' | null;
  activeDebt: DebtState | null;
  pendingRent: PendingRent | null;
  pendingForceAcquire: PendingForceAcquire | null;
  landedBuildMaxHouses: number;
  winReason: string | null;
  onAction: (action: MonopolyActionType, payload?: unknown) => void;
  onOpenBuildManager: () => void;
  onRestartGame: () => void;
  onReturnToLobby: () => void;
  onLeaveRoom: () => void;
}

export const PhaseDecisionModals: React.FC<PhaseDecisionModalsProps> = React.memo(
  ({
    gameState,
    phase,
    ruleset,
    myPlayerId,
    isHost,
    isAnimating,
    players,
    activePlayer,
    board,
    currentCard,
    cardType,
    activeDebt,
    pendingRent,
    pendingForceAcquire,
    landedBuildMaxHouses,
    winReason,
    onAction,
    onOpenBuildManager,
    onRestartGame,
    onReturnToLobby,
    onLeaveRoom,
  }) => {
    const isMyTurn = activePlayer?.id === myPlayerId;
    const landedTile = activePlayer ? board[activePlayer.position] : null;

    return (
      <>
        {/* 1. Buy / Pass Unowned Property */}
        {!isAnimating &&
          phase === 'action' &&
          isMyTurn &&
          activePlayer &&
          landedTile &&
          landedTile.owner === null &&
          landedTile.price && (
            <div className="drawn-card-popup action-buy">
              {landedTile.color && (
                <div className={`popup-color-banner tile-group-${landedTile.color}`} />
              )}
              <div className="card-title-text">{landedTile.name}</div>
              <div className="popup-price-big">${landedTile.price}</div>
              <div className="popup-sub-note">
                Your Cash: <strong>${activePlayer.money.toLocaleString()}</strong>
              </div>
              <div className="popup-btn-row">
                <button
                  type="button"
                  className="btn-primary"
                  disabled={activePlayer.money < landedTile.price}
                  onClick={() => onAction('buy-property')}
                >
                  Buy (${landedTile.price})
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => onAction('pass-property')}
                >
                  {ruleset === 'Classic' ? 'Auction' : 'Pass'}
                </button>
              </div>
            </div>
          )}

        {/* 2. Chance / Community Chest Card */}
        {!isAnimating && phase === 'card_drawn' && currentCard && (
          <div className={`drawn-card-popup ${cardType === 'chest' ? 'chest' : 'chance'}`}>
            <div className="card-header-icon">{cardType === 'chest' ? '🧰' : '❓'}</div>
            <div className="card-title-text">
              {cardType === 'chest' ? 'Community Chest' : 'Chance'}
            </div>
            <div className="card-body-text">&ldquo;{currentCard.text}&rdquo;</div>
            {isMyTurn ? (
              <button
                type="button"
                className="btn-primary popup-full-btn"
                onClick={() => onAction('ok-card')}
              >
                OK
              </button>
            ) : (
              <div className="popup-waiting">
                Waiting for {activePlayer?.name} to acknowledge...
              </div>
            )}
          </div>
        )}

        {/* 3. Debt / Bankruptcy */}
        {!isAnimating && phase === 'bankrupt_decision' && isMyTurn && activePlayer && activeDebt && (
          <div className="drawn-card-popup danger">
            <div className="card-header-icon">🚨</div>
            <div className="card-title-text">Insufficient Funds</div>
            <div className="popup-sub-note">
              You owe{' '}
              <strong>
                {activeDebt.to === 'bank'
                  ? 'the Bank'
                  : players.find((p) => p.id === activeDebt.to)?.name ?? 'Opponent'}
              </strong>
              :
            </div>
            <div className="popup-price-big danger">${activeDebt.amountValue}</div>
            <div className="popup-sub-note">
              Cash: <strong>${activePlayer.money}</strong> — raise{' '}
              <strong>${Math.max(0, activeDebt.amountValue - activePlayer.money)}</strong> more.
            </div>
            <div className="popup-btn-col">
              <button type="button" className="btn-primary" onClick={onOpenBuildManager}>
                🛠️ Sell Houses / Mortgage Property
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  onAction('declare-bankruptcy');
                  sfx.playBankruptcy();
                }}
              >
                💀 Declare Bankruptcy
              </button>
            </div>
          </div>
        )}

        {/* 4. Get Rich: Festival Selector Top Banner */}
        {!isAnimating && phase === 'festival_selection' && isMyTurn && (
          <div className="floating-selector-banner amber">
            <div className="fsb-title">🎉 FESTIVAL BOOSTER (TILE 30)</div>
            <div className="fsb-desc">
              Click any of your unmortgaged properties on the board to{' '}
              <strong>double its rent for 3 full turns</strong>!
            </div>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => onAction('festival-skip')}
            >
              Skip Festival Boost
            </button>
          </div>
        )}
        {!isAnimating && phase === 'festival_selection' && !isMyTurn && (
          <div className="drawn-card-popup amber">
            <div className="card-header-icon">🎉</div>
            <div className="card-title-text">Festival!</div>
            <div className="popup-waiting">
              {activePlayer?.name} is picking a property to double rent...
            </div>
          </div>
        )}

        {/* 5. Get Rich: Airport Selector Top Banner */}
        {!isAnimating && phase === 'airport_selection' && isMyTurn && activePlayer && (
          <div className="floating-selector-banner sky">
            <div className="fsb-title">✈️ AIRPORT FLIGHT SELECTOR (TILE 20)</div>
            <div className="fsb-desc">
              Click any tile on the board to fly there immediately for <strong>$100</strong>!
              (Cash: ${activePlayer.money.toLocaleString()})
            </div>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => onAction('airport-skip')}
            >
              Skip Flight (Stay Here)
            </button>
          </div>
        )}
        {!isAnimating && phase === 'airport_selection' && !isMyTurn && (
          <div className="drawn-card-popup sky">
            <div className="card-header-icon">✈️</div>
            <div className="card-title-text">Airport!</div>
            <div className="popup-waiting">
              {activePlayer?.name} is choosing a flight destination...
            </div>
          </div>
        )}

        {/* 6. Get Rich: Angel Card — Skip Rent */}
        {!isAnimating && phase === 'use_angel_rent' && isMyTurn && pendingRent && (
          <div className="drawn-card-popup purple">
            <div className="card-header-icon">😇</div>
            <div className="card-title-text">Use Angel Card?</div>
            <div className="popup-sub-note">
              Skip paying <strong>${pendingRent.amount}</strong> rent entirely?
            </div>
            <div className="popup-btn-row">
              <button
                type="button"
                className="btn-purple"
                onClick={() => onAction('use-angel-rent')}
              >
                😇 Use Angel Card
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => onAction('decline-angel-rent')}
              >
                Pay ${pendingRent.amount}
              </button>
            </div>
          </div>
        )}

        {/* 7. Get Rich: Angel Card — Block Force Acquisition (shown to OWNER!) */}
        {!isAnimating &&
          phase === 'use_angel_force' &&
          pendingForceAcquire &&
          (() => {
            const tile = board[pendingForceAcquire.tileIndex];
            if (!tile) return null;
            const isOwner = tile.owner === myPlayerId;
            const acquirerName =
              players.find((p) => p.id === pendingForceAcquire.byId)?.name ?? 'Opponent';
            const ownerName =
              players.find((p) => p.id === tile.owner)?.name ?? 'Owner';

            if (isOwner) {
              return (
                <div className="drawn-card-popup purple">
                  <div className="card-header-icon">😇</div>
                  <div className="card-title-text">Defend Property?</div>
                  <div className="popup-sub-note">
                    <strong>{acquirerName}</strong> can force-acquire{' '}
                    <strong>{tile.name}</strong> for{' '}
                    <strong>${pendingForceAcquire.worth}</strong>!
                  </div>
                  <div className="popup-btn-row">
                    <button
                      type="button"
                      className="btn-purple"
                      onClick={() => onAction('use-angel-force')}
                    >
                      😇 Block with Angel
                    </button>
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => onAction('decline-angel-force')}
                    >
                      Allow
                    </button>
                  </div>
                </div>
              );
            }
            return (
              <div className="drawn-card-popup purple">
                <div className="card-header-icon">😇</div>
                <div className="card-title-text">Angel Defense</div>
                <div className="popup-waiting">
                  Waiting for <strong>{ownerName}</strong> to decide on blocking acquisition...
                </div>
              </div>
            );
          })()}

        {/* 8. Get Rich: Force Acquire Decision */}
        {!isAnimating &&
          phase === 'force_acquire_decision' &&
          pendingForceAcquire &&
          (() => {
            const tile = board[pendingForceAcquire.tileIndex];
            if (!tile) return null;
            const isAcquirer = pendingForceAcquire.byId === myPlayerId;
            const prevOwner = players.find((p) => p.id === tile.owner)?.name ?? 'Owner';
            if (isAcquirer) {
              return (
                <div className="drawn-card-popup danger">
                  <div className="card-header-icon">💼</div>
                  <div className="card-title-text">Force Acquire?</div>
                  <div className="popup-sub-note">
                    Buy <strong>{tile.name}</strong> from <strong>{prevOwner}</strong>?
                  </div>
                  <div className="popup-price-big danger">${pendingForceAcquire.worth}</div>
                  <div className="popup-btn-row">
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => onAction('force-acquire')}
                    >
                      💼 Acquire!
                    </button>
                    <button
                      type="button"
                      className="btn-blue"
                      onClick={() => onAction('decline-force-acquire')}
                    >
                      Pass
                    </button>
                  </div>
                </div>
              );
            }
            return (
              <div className="drawn-card-popup danger">
                <div className="card-header-icon">💼</div>
                <div className="card-title-text">Force Acquire</div>
                <div className="popup-waiting">
                  {activePlayer?.name} is deciding whether to acquire {tile.name}...
                </div>
              </div>
            );
          })()}

        {/* 9. Get Rich: Landed Instant Build */}
        {phase === 'landed_build' && isMyTurn && activePlayer && landedTile?.type === 'property' && (
          <div className="drawn-card-popup sky">
            <div className="card-header-icon">🏗️</div>
            <div className="card-title-text">Build Instantly!</div>
            <div className="popup-sub-note">
              <strong>{landedTile.name}</strong> · Current:{' '}
              {landedTile.houses === 5 ? '🏨 Hotel' : `${landedTile.houses} House(s)`} · Unit: $
              {landedTile.housePrice}
            </div>

            <div className="landed-build-list">
              {[1, 2, 3, 4, 5].map((target) => {
                const isHotel = target === 5;
                const already = landedTile.houses >= target;
                const allowed = target <= landedBuildMaxHouses;
                const countNeeded = target - landedTile.houses;
                const cost = countNeeded * (landedTile.housePrice ?? 0);
                const canClick =
                  !isAnimating &&
                  !already &&
                  allowed &&
                  activePlayer.money >= cost &&
                  (!isHotel || (landedTile.houses === 4 && landedBuildMaxHouses === 5));

                const reason = already
                  ? 'Built'
                  : !allowed
                  ? 'Land again for Hotel'
                  : activePlayer.money < cost
                  ? `Need $${cost}`
                  : isHotel && landedTile.houses < 4
                  ? 'Needs 4H first'
                  : '';

                return (
                  <button
                    key={target}
                    type="button"
                    disabled={!canClick}
                    className={`landed-build-option ${isHotel ? 'hotel' : ''}`}
                    onClick={() => {
                      onAction('landed-build', {
                        tileIndex: landedTile.index,
                        count: countNeeded,
                      });
                      sfx.playUpgrade();
                    }}
                  >
                    <span>{isHotel ? '🏨 Hotel' : `🏠 ${target} House${target > 1 ? 's' : ''}`}</span>
                    <strong>{canClick ? `+$${cost}` : reason}</strong>
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              className="btn-secondary popup-full-btn"
              disabled={isAnimating}
              onClick={() => onAction('landed-build-done')}
            >
              Done Building
            </button>
          </div>
        )}

        {/* 10. Get Rich: Exact GO Landing Free Build Select */}
        {!isAnimating &&
          phase === 'go_build_select' &&
          isMyTurn &&
          activePlayer &&
          (() => {
            const buildable = board.filter(
              (t) =>
                t.type === 'property' &&
                t.owner === myPlayerId &&
                t.houses < 5 &&
                !t.mortgaged
            );
            return (
              <div className="modal-backdrop">
                <div className="go-bonus-card">
                  <h3>🎯 EXACT GO LANDING BONUS</h3>
                  <p>Build 1 upgrade on any owned property (standard house price)!</p>
                  <div className="go-bonus-list">
                    {buildable.map((prop) => {
                      const cost = prop.housePrice ?? 50;
                      const afford = activePlayer.money >= cost;
                      return (
                        <div key={prop.index} className="go-bonus-row">
                          <div>
                            <strong>{prop.name}</strong>
                            <span>
                              {prop.houses} Houses · Cost ${cost}
                            </span>
                          </div>
                          <button
                            type="button"
                            className="btn-primary mini"
                            disabled={!afford}
                            onClick={() => {
                              onAction('go-build', prop.index);
                              sfx.playUpgrade();
                            }}
                          >
                            {prop.houses === 4 ? '🏨 Hotel' : '🧱 +1 House'}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                  <button
                    type="button"
                    className="btn-secondary popup-full-btn"
                    onClick={() => onAction('go-build-skip')}
                  >
                    Skip Bonus
                  </button>
                </div>
              </div>
            );
          })()}

        {/* 11. Game Over Podium */}
        {gameState === 'gameover' && (
          <div className="modal-backdrop gameover">
            <div className="gameover-podium-card">
              <h2>🏆 GAME OVER</h2>
              {winReason && <div className="gameover-reason">{winReason}</div>}

              <div className="gameover-rankings">
                {[...players]
                  .sort((a, b) => (a.finishRank ?? 99) - (b.finishRank ?? 99))
                  .map((p) => (
                    <div
                      key={p.id}
                      className={`podium-row ${p.finishRank === 1 ? 'winner' : ''}`}
                    >
                      <span className="podium-rank">
                        {p.finishRank === 1
                          ? '🥇'
                          : p.finishRank === 2
                          ? '🥈'
                          : p.finishRank === 3
                          ? '🥉'
                          : `#${p.finishRank}`}
                      </span>
                      <div className="podium-info">
                        <strong>{p.name}</strong>
                        <span>
                          Cash ${p.money.toLocaleString()} · Net Worth $
                          {p.netWorth.toLocaleString()}
                        </span>
                      </div>
                      {p.bankrupt && <span className="bankrupt-pill">Bankrupt</span>}
                    </div>
                  ))}
              </div>

              <div className="gameover-actions">
                {isHost && (
                  <>
                    <button type="button" className="btn-primary" onClick={onRestartGame}>
                      🎲 Play Again
                    </button>
                    <button type="button" className="btn-blue" onClick={onReturnToLobby}>
                      ⚙️ Back to Lobby
                    </button>
                  </>
                )}
                <button type="button" className="btn-secondary" onClick={onLeaveRoom}>
                  Exit to Menu
                </button>
              </div>
            </div>
          </div>
        )}
      </>
    );
  }
);
