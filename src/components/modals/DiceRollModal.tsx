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

/**
 * Maps face value (1..6) to exact 3D cube rotation that brings that face to the front.
 */
const FACE_ROTATIONS: Record<number, { x: number; y: number }> = {
  1: { x: 0, y: 0 },
  2: { x: -90, y: 0 },
  3: { x: 0, y: -90 },
  4: { x: 0, y: 90 },
  5: { x: 90, y: 0 },
  6: { x: 180, y: 0 },
};

const DieFacePips: React.FC<{ value: number }> = React.memo(({ value }) => {
  const dots = DOT_MAP[value] ?? DOT_MAP[1];
  return (
    <div className="die-pips-grid">
      {dots.map(([col, row], i) => (
        <span
          key={i}
          className={`die-pip ${value === 1 ? 'pip-red' : ''}`}
          style={{ gridColumn: col, gridRow: row }}
        />
      ))}
    </div>
  );
});

interface Die3DCubeProps {
  targetValue: number;
  rollKey: string;
  spinSeed: number;
  variant: 'left' | 'right';
  accentColor: string;
}

const Die3DCube: React.FC<Die3DCubeProps> = React.memo(
  ({ targetValue, rollKey, spinSeed, variant, accentColor }) => {
    const face = FACE_ROTATIONS[targetValue] ?? FACE_ROTATIONS[1];
    // Add 2–3 full multi-axis revolutions + slight natural resting tilt
    const extraX = (variant === 'left' ? 720 : 1080) + (spinSeed % 2) * 360;
    const extraY = (variant === 'left' ? 1080 : 720) + ((spinSeed >> 1) % 2) * 360;
    const restZ = variant === 'left' ? -6 + (spinSeed % 7) : 6 - (spinSeed % 7);

    const endX = face.x + extraX;
    const endY = face.y + extraY;

    return (
      <div
        key={rollKey}
        className={`die-3d-slot die-slot-${variant}`}
        style={{ ['--die-accent' as string]: accentColor }}
      >
        <div className={`die-3d-arc die-arc-${variant}`}>
          <div
            className="die-3d-cube"
            style={{
              ['--die-end-x' as string]: `${endX}deg`,
              ['--die-end-y' as string]: `${endY}deg`,
              ['--die-end-z' as string]: `${restZ}deg`,
              ['--die-start-x' as string]: `${variant === 'left' ? -140 : 160}deg`,
              ['--die-start-y' as string]: `${variant === 'left' ? 120 : -180}deg`,
            }}
          >
            <div className="die-3d-face face-1"><DieFacePips value={1} /></div>
            <div className="die-3d-face face-6"><DieFacePips value={6} /></div>
            <div className="die-3d-face face-3"><DieFacePips value={3} /></div>
            <div className="die-3d-face face-4"><DieFacePips value={4} /></div>
            <div className="die-3d-face face-2"><DieFacePips value={2} /></div>
            <div className="die-3d-face face-5"><DieFacePips value={5} /></div>
          </div>
        </div>
        <div className={`die-3d-shadow die-shadow-${variant}`} />
      </div>
    );
  }
);

/**
 * Self-contained 3D physics-tumble dice modal.
 * Guarded strictly by lastPlayedRollIdRef so unrelated state updates never re-trigger it.
 */
export const DiceRollModal: React.FC<DiceRollModalProps> = React.memo(
  ({ rollId, die1, die2, activePlayerColor, activePlayerName, onAnimationChange }) => {
    const [visible, setVisible] = useState(false);
    const [settled, setSettled] = useState(false);
    const [activeRoll, setActiveRoll] = useState<{
      id: string;
      d1: number;
      d2: number;
      seed: number;
    } | null>(null);

    const lastPlayedRollIdRef = useRef<string | null>(null);
    const onAnimRef = useRef(onAnimationChange);
    onAnimRef.current = onAnimationChange;

    const latestDiceRef = useRef<[number, number]>([die1, die2]);
    latestDiceRef.current = [die1, die2];

    useEffect(() => {
      if (!rollId) {
        lastPlayedRollIdRef.current = null;
        setVisible(false);
        setSettled(false);
        onAnimRef.current(false);
        return;
      }

      if (rollId === lastPlayedRollIdRef.current) return;
      lastPlayedRollIdRef.current = rollId;

      const [d1, d2] = latestDiceRef.current;
      const seed = Math.floor(Math.random() * 100);
      setActiveRoll({ id: rollId, d1, d2, seed });
      setVisible(true);
      setSettled(false);
      onAnimRef.current(true);
      sfx.playDiceRoll();

      const bounce1Timer = setTimeout(() => {
        sfx.playDiceLand();
      }, 780);

      const settleTimer = setTimeout(() => {
        setSettled(true);
        sfx.playTick();
      }, 1150);

      const closeTimer = setTimeout(() => {
        setVisible(false);
        onAnimRef.current(false);
      }, 2150);

      return () => {
        clearTimeout(bounce1Timer);
        clearTimeout(settleTimer);
        clearTimeout(closeTimer);
        onAnimRef.current(false);
      };
    }, [rollId]);

    if (!visible || !activeRoll) return null;

    const sum = activeRoll.d1 + activeRoll.d2;
    const isDoubles = activeRoll.d1 === activeRoll.d2;

    return (
      <div className="dice-modal-backdrop">
        <div
          className="dice-modal-content"
          style={{ ['--die-accent' as string]: activePlayerColor }}
        >
          <div className="dice-modal-subtitle">{activePlayerName}</div>
          <h3 className="dice-modal-title">
            {settled ? 'DICE ROLLED!' : 'ROLLING DICE...'}
          </h3>

          <div className="dice-3d-stage">
            <Die3DCube
              targetValue={activeRoll.d1}
              rollKey={`${activeRoll.id}_1`}
              spinSeed={activeRoll.seed}
              variant="left"
              accentColor={activePlayerColor}
            />
            <Die3DCube
              targetValue={activeRoll.d2}
              rollKey={`${activeRoll.id}_2`}
              spinSeed={activeRoll.seed + 3}
              variant="right"
              accentColor={activePlayerColor}
            />
          </div>

          <div className={`dice-modal-result-container ${settled ? 'revealed' : ''}`}>
            <div className="dice-modal-total">🎲 {sum}</div>
            {isDoubles && <div className="dice-modal-doubles">🔥 DOUBLES!</div>}
          </div>
        </div>
      </div>
    );
  }
);
