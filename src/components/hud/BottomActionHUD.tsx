// src/components/hud/BottomActionHUD.tsx
import React from 'react';
import type { MonopolyActionType, MonopolyPhase, PlayerState, Ruleset } from '../../engine/types';
import { PowerBarRollButton } from './PowerBarRollButton';

interface BottomActionHUDProps {
  myPlayerId: string;
  activePlayer: PlayerState | null;
  phase: MonopolyPhase;
  ruleset: Ruleset;
  isAnimating: boolean;
  isDiceRolling: boolean;
  isHost: boolean;
  onAction: (action: MonopolyActionType, payload?: unknown) => void;
  onOpenManage: () => void;
  onOpenDevConsole: () => void;
}

export const BottomActionHUD: React.FC<BottomActionHUDProps> = React.memo(
  ({
    myPlayerId,
    activePlayer,
    phase,
    ruleset,
    isAnimating,
    isDiceRolling,
    isHost,
    onAction,
    onOpenManage,
    onOpenDevConsole,
  }) => {
    const isMyTurn = activePlayer?.id === myPlayerId;

    return (
      <div className="monopoly-unified-hud-bottom">
        <div className="hud-primary-slot">
          {isMyTurn && activePlayer ? (
            phase === 'roll' && !isDiceRolling && !isAnimating ? (
              activePlayer.inJail ? (
                <div className="hud-jail-actions">
                  <button
                    type="button"
                    className="btn-roll-red roll-glow-animation"
                    onClick={() => onAction('roll-jail-doubles')}
                  >
                    🎲 Roll Doubles
                  </button>
                  {activePlayer.money >= 50 && (
                    <button
                      type="button"
                      className="btn-blue"
                      onClick={() => onAction('pay-jail-fine')}
                    >
                      💵 Pay $50
                    </button>
                  )}
                  {activePlayer.getOutOfJailCards > 0 && (
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={() => onAction('use-jail-card')}
                    >
                      🔓 Use Card
                    </button>
                  )}
                </div>
              ) : ruleset === 'Get Rich' ? (
                <PowerBarRollButton
                  disabled={isDiceRolling || isAnimating}
                  oddEvenCards={activePlayer.oddEvenCards}
                  onRoll={(power, oddEvenChoice) =>
                    onAction('roll-dice', { power, oddEvenChoice })
                  }
                />
              ) : (
                <button
                  type="button"
                  className="btn-roll-red roll-glow-animation"
                  onClick={() => onAction('roll-dice')}
                >
                  🎲 Roll Dice
                </button>
              )
            ) : phase === 'end_turn' && !isAnimating ? (
              <button
                type="button"
                className="btn-blue hud-end-turn-btn"
                onClick={() => onAction('end-turn')}
              >
                ➡️ End Turn
              </button>
            ) : (
              <button type="button" className="btn-disabled-hud" disabled>
                ⏳ {isAnimating ? 'Animating...' : 'Resolve Action...'}
              </button>
            )
          ) : (
            <button type="button" className="btn-disabled-hud" disabled>
              ⏳ {activePlayer?.name ?? 'Player'}&apos;s Turn
            </button>
          )}
        </div>

        <button
          type="button"
          className="unified-hud-manage-btn"
          onClick={onOpenManage}
        >
          🏘️ Properties
        </button>

        {isHost && (
          <button
            type="button"
            className="unified-hud-dev-btn"
            title="Host Dev Console (~)"
            onClick={onOpenDevConsole}
          >
            🔧
          </button>
        )}
      </div>
    );
  }
);
