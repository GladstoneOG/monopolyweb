// src/components/hud/PowerBarRollButton.tsx
import React, { useCallback, useEffect, useRef, useState } from 'react';

interface PowerBarRollButtonProps {
  disabled: boolean;
  oddEvenCards: number;
  onRoll: (power: number, oddEvenChoice: 'odd' | 'even' | null) => void;
}

/**
 * High-FPS isolated Power Bar for Get Rich mode:
 * - Frame-rate independent using performance.now() delta time (~1.25s full sweep).
 * - Updates fill bar DOM width directly via ref for 0 parent re-renders while holding.
 */
export const PowerBarRollButton: React.FC<PowerBarRollButtonProps> = React.memo(
  ({ disabled, oddEvenCards, onRoll }) => {
    const [isPressing, setIsPressing] = useState(false);
    const [oddEvenChoice, setOddEvenChoice] = useState<'odd' | 'even' | null>(null);
    const [displayPower, setDisplayPower] = useState(0);

    const powerRef = useRef(0);
    const dirRef = useRef(1);
    const lastTimeRef = useRef(0);
    const rafRef = useRef<number | null>(null);
    const fillRef = useRef<HTMLDivElement | null>(null);

    const stopLoop = useCallback(() => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    }, []);

    useEffect(() => {
      if (!isPressing) {
        stopLoop();
        return;
      }

      lastTimeRef.current = performance.now();
      let lastUiSync = 0;

      const tick = (now: number) => {
        const dt = Math.min((now - lastTimeRef.current) / 1000, 0.08);
        lastTimeRef.current = now;

        // 135% per second -> smooth ~0.74s sweep from 0 to 100
        let next = powerRef.current + dirRef.current * 135 * dt;
        if (next >= 100) {
          next = 100;
          dirRef.current = -1;
        } else if (next <= 0) {
          next = 0;
          dirRef.current = 1;
        }
        powerRef.current = next;

        if (fillRef.current) {
          fillRef.current.style.width = `${next}%`;
          fillRef.current.style.background =
            next <= 33
              ? 'linear-gradient(90deg, #10b981, #059669)'
              : next <= 66
              ? 'linear-gradient(90deg, #f59e0b, #d97706)'
              : 'linear-gradient(90deg, #ef4444, #dc2626)';
        }

        // Throttle React label updates to ~20Hz while keeping bar at native 60/120/144Hz
        if (now - lastUiSync > 50) {
          lastUiSync = now;
          setDisplayPower(Math.round(next));
        }

        rafRef.current = requestAnimationFrame(tick);
      };

      rafRef.current = requestAnimationFrame(tick);
      return stopLoop;
    }, [isPressing, stopLoop]);

    const handleStart = (e: React.PointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      if (disabled) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      powerRef.current = 0;
      dirRef.current = 1;
      setDisplayPower(0);
      setIsPressing(true);
    };

    const handleRelease = (e: React.PointerEvent<HTMLButtonElement>) => {
      if (!isPressing) return;
      e.preventDefault();
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
      setIsPressing(false);
      stopLoop();
      const finalPower = Math.max(1, Math.round(powerRef.current));
      setDisplayPower(finalPower);
      onRoll(finalPower, oddEvenChoice);
      setOddEvenChoice(null);
    };

    const rangeLabel =
      displayPower <= 33
        ? 'Low: 2–4'
        : displayPower <= 66
        ? 'Mid: 5–8'
        : 'High: 9–12';

    return (
      <div className="power-roll-wrapper">
        {oddEvenCards > 0 && (
          <div className="odd-even-group">
            <span className="odd-even-caption">ODD/EVEN CARD</span>
            <div className="odd-even-btns">
              <button
                type="button"
                className={`btn-odd-even ${oddEvenChoice === 'odd' ? 'active' : ''}`}
                onClick={() => setOddEvenChoice((c) => (c === 'odd' ? null : 'odd'))}
              >
                Odd
              </button>
              <button
                type="button"
                className={`btn-odd-even ${oddEvenChoice === 'even' ? 'active' : ''}`}
                onClick={() => setOddEvenChoice((c) => (c === 'even' ? null : 'even'))}
              >
                Even
              </button>
            </div>
          </div>
        )}

        <div className="power-bar-stack">
          <button
            type="button"
            disabled={disabled}
            className={`btn-roll-red roll-glow-animation ${isPressing ? 'pressing' : ''}`}
            onPointerDown={handleStart}
            onPointerUp={handleRelease}
            onPointerCancel={handleRelease}
          >
            {isPressing ? '🔥 RELEASE!' : '🎲 Hold to Roll'}
          </button>

          <div className="power-bar-track">
            <div className="power-bar-ticks">
              <span style={{ left: '33%' }} />
              <span style={{ left: '66%' }} />
            </div>
            <div ref={fillRef} className="power-bar-fill" style={{ width: `${displayPower}%` }} />
          </div>
          <div className="power-bar-label">
            Power {displayPower}% ({rangeLabel})
          </div>
        </div>
      </div>
    );
  }
);
