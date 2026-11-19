// src/components/modals/DiceRollModal.tsx
import React, { useEffect, useRef, useState } from 'react';
import { sfx } from '../../utils/audio';

interface DiceRollModalProps {
  rollId: string | null;
  die1: number;
  die2: number;
  activePlayerColor: string;
  activePlayerName: string;
  onAnimationChange: (isRolling: boolean) => void;
}

const DOT_MAP: Record<number, Array<[number, number]>> = {
  1: [[2, 2]],
  2: [[1, 1], [3, 3]],
  3: [[1, 1], [2, 2], [3, 3]],
  4: [[1, 1], [3, 1], [1, 3], [3, 3]],
  5: [[1, 1], [3, 1], [2, 2], [1, 3], [3, 3]],
  6: [[1, 1], [1, 2], [1, 3], [3, 1], [3, 2], [3, 3]],
};

const DieFace: React.FC<{ value: number; rolling: boolean; tint: string }> = ({
  value,
  rolling,
  tint,
}) => {
  const dots = DOT_MAP[value] ?? DOT_MAP[1];
  return (
    <div
      className={`die-2d ${rolling ? 'rolling-2d' : 'settled-2d'}`}
      style={{ ['--die-tint' as string]: tint }}
    >
      {dots.map(([col, row], i) => (
        <div key={i} className="dot-2d" style={{ gridColumn: col, gridRow: row }} />
      ))}
    </div>
  );
};

/**
 * Self-contained dice roll animation modal.
 * Strictly guarded by lastPlayedRollIdRef so unrelated room state updates
 * (buy, build, trade, status, end-turn) NEVER re-open the dice popup!
 */
export const DiceRollModal: React.FC<DiceRollModalProps> = React.memo(
  ({ rollId, die1, die2, activePlayerColor, activePlayerName, onAnimationChange }) => {
    const [visible, setVisible] = useState(false);
    const [phase, setPhase] = useState<'rolling' | 'settled'>('rolling');
    const [displayDice, setDisplayDice] = useState<[number, number]>([1, 1]);

    const lastPlayedRollIdRef = useRef<string | null>(null);
    const onAnimRef = useRef(onAnimationChange);
    onAnimRef.current = onAnimationChange;

    const latestDiceRef = useRef<[number, number]>([die1, die2]);
    latestDiceRef.current = [die1, die2];

    useEffect(() => {
      if (!rollId) {
        lastPlayedRollIdRef.current = null;
        setVisible(false);
        onAnimRef.current(false);
        return;
      }

      // Already played animation for this exact rollId -> ignore subsequent state updates!
      if (rollId === lastPlayedRollIdRef.current) {
        return;
      }
      lastPlayedRollIdRef.current = rollId;

      const settled: [number, number] = [latestDiceRef.current[0], latestDiceRef.current[1]];
      setVisible(true);
      setPhase('rolling');
      onAnimRef.current(true);
      sfx.playDiceRoll();

      const shuffleInterval = setInterval(() => {
        setDisplayDice([
          Math.floor(Math.random() * 6) + 1,
          Math.floor(Math.random() * 6) + 1,
        ]);
      }, 65);

      const settleTimer = setTimeout(() => {
        clearInterval(shuffleInterval);
        setDisplayDice(settled);
        setPhase('settled');
        sfx.playDiceLand();
      }, 1000);

      const closeTimer = setTimeout(() => {
        setVisible(false);
        onAnimRef.current(false);
      }, 2150);

      return () => {
        clearInterval(shuffleInterval);
        clearTimeout(settleTimer);
        clearTimeout(closeTimer);
        onAnimRef.current(false);
      };
    }, [rollId]);

    if (!visible) return null;

    const sum = displayDice[0] + displayDice[1];
    const isDoubles = displayDice[0] === displayDice[1];

    return (
      <div className="dice-modal-backdrop">
        <div className="dice-modal-content">
          <div className="dice-modal-subtitle">{activePlayerName}</div>
          <h3 className="dice-modal-title">
            {phase === 'rolling' ? 'ROLLING DICE...' : 'DICE ROLLED!'}
          </h3>

          <div className="dice-modal-container">
            <DieFace value={displayDice[0]} rolling={phase === 'rolling'} tint={activePlayerColor} />
            <DieFace value={displayDice[1]} rolling={phase === 'rolling'} tint={activePlayerColor} />
          </div>

          {phase === 'settled' && (
            <div className="dice-modal-result-container">
              <div className="dice-modal-total">🎲 {sum}</div>
              {isDoubles && <div className="dice-modal-doubles">🔥 DOUBLES!</div>}
            </div>
          )}
        </div>
      </div>
    );
  }
);
