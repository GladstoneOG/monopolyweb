// src/components/modals/CasinoCoinModal.tsx
import React, { useEffect, useRef } from 'react';
import type { CasinoState, MonopolyActionType, PlayerState } from '../../engine/types';
import { sfx } from '../../utils/audio';

interface CasinoCoinModalProps {
  casinoState: CasinoState | null;
  players: readonly PlayerState[];
  myPlayerId: string;
  isAnimatingBoard: boolean;
  onAction: (action: MonopolyActionType) => void;
}

export const CasinoCoinModal: React.FC<CasinoCoinModalProps> = React.memo(
  ({ casinoState, players, myPlayerId, isAnimatingBoard, onAction }) => {
    const prevStatusRef = useRef<string | null>(null);

    useEffect(() => {
      if (!casinoState) {
        prevStatusRef.current = null;
        return;
      }
      if (casinoState.status !== prevStatusRef.current) {
        if (casinoState.status === 'flipping') sfx.playCoinFlip();
        else if (casinoState.status === 'won' || casinoState.status === 'jackpot') sfx.playJackpot();
        else if (casinoState.status === 'lost') sfx.playBankruptcy();
        prevStatusRef.current = casinoState.status;
      }
    }, [casinoState]);

    if (isAnimatingBoard || !casinoState) return null;

    const flippingPlayer = players.find((p) => p.id === casinoState.playerId);
    const isMe = casinoState.playerId === myPlayerId;
    const isPending = casinoState.status === 'pending_flip';
    const isFlipping = casinoState.status === 'flipping';
    const isWon = casinoState.status === 'won';
    const isJackpot = casinoState.status === 'jackpot';
    const isLost = casinoState.status === 'lost';

    const coinFinalRotation = casinoState.result === 'lose' ? '1980deg' : '1800deg';

    return (
      <div className="casino-modal-overlay">
        {(isWon || isJackpot) && <div className="confetti-shimmer" />}
        <div className="casino-card">
          <div className="casino-title">🎰 GET RICH CASINO 🎰</div>
          <div className="casino-subtitle">
            <strong>{flippingPlayer?.name ?? 'Player'}</strong> is testing their fortune!
          </div>

          <div className="casino-round-badge">
            Round {casinoState.round} of 3 — Stake: <strong>${casinoState.payout}</strong>
          </div>

          <div className="coin-container">
            <div
              className={`coin-3d ${isFlipping ? 'flipping' : ''} ${
                isWon || isJackpot ? 'won-state' : ''
              } ${isLost ? 'lost-state' : ''}`}
              style={{ ['--coin-final-rotation' as string]: coinFinalRotation }}
            >
              <div className="coin-side coin-front">
                <span className="coin-crown">👑</span>
                <span className="coin-label win">WIN</span>
              </div>
              <div className="coin-side coin-back">
                <span className="coin-crown">💀</span>
                <span className="coin-label lose">LOSE</span>
              </div>
            </div>
          </div>

          <div className="casino-actions-box">
            {isPending &&
              (isMe ? (
                <button
                  type="button"
                  className="btn-gold roll-glow-animation casino-main-btn"
                  onClick={() => onAction('casino-flip')}
                >
                  🪙 Flip the Coin!
                </button>
              ) : (
                <div className="casino-waiting">
                  Waiting for {flippingPlayer?.name ?? 'player'} to flip...
                </div>
              ))}

            {isFlipping && <div className="casino-flipping-text">🪙 Coin in the air...</div>}

            {isWon && (
              <>
                <div className="win-text-effect">
                  🎉 WIN! +${casinoState.payout} ready to collect!
                </div>
                {isMe ? (
                  <div className="casino-btn-row">
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={() => onAction('casino-collect')}
                    >
                      💰 Collect ${casinoState.payout}
                    </button>
                    {casinoState.round < 3 && (
                      <button
                        type="button"
                        className="btn-purple"
                        onClick={() => onAction('casino-push')}
                      >
                        🎲 Push Luck! (Round {casinoState.round + 1}: ${casinoState.payout * 2})
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="casino-waiting">
                    {flippingPlayer?.name} is deciding whether to collect or push...
                  </div>
                )}
              </>
            )}

            {isJackpot && (
              <div className="win-text-effect jackpot">
                🏆 JACKPOT! Won +${casinoState.payout}! 🏆
              </div>
            )}

            {isLost && (
              <div className="lose-shake-effect">
                💀 LOSE! Lost -${casinoState.payout}! 💀
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }
);
