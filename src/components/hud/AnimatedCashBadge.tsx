// src/components/hud/AnimatedCashBadge.tsx
import React, { useEffect, useRef, useState } from 'react';

interface AnimatedCashBadgeProps {
  money: number;
  isFrozen?: boolean;
}

/**
 * Isolated rAF cash counter: animates money changes without re-rendering parent board.
 */
export const AnimatedCashBadge: React.FC<AnimatedCashBadgeProps> = React.memo(
  ({ money, isFrozen = false }) => {
    const [displayVal, setDisplayVal] = useState(money);
    const [delta, setDelta] = useState<number | null>(null);
    const prevMoneyRef = useRef(money);
    const rafRef = useRef<number | null>(null);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
      if (isFrozen) return;
      const prev = prevMoneyRef.current;
      if (prev === money) return;

      const diff = money - prev;
      prevMoneyRef.current = money;
      setDelta(diff);

      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (timerRef.current) clearTimeout(timerRef.current);

      const startVal = prev;
      const endVal = money;
      const duration = 650;

      timerRef.current = setTimeout(() => {
        const startTime = performance.now();
        const step = (now: number) => {
          const t = Math.min((now - startTime) / duration, 1);
          const eased = t * (2 - t);
          setDisplayVal(Math.round(startVal + (endVal - startVal) * eased));
          if (t < 1) {
            rafRef.current = requestAnimationFrame(step);
          } else {
            setDisplayVal(endVal);
            setDelta(null);
          }
        };
        rafRef.current = requestAnimationFrame(step);
      }, 280);

      return () => {
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        if (timerRef.current) clearTimeout(timerRef.current);
      };
    }, [money, isFrozen]);

    return (
      <div className="corner-card-money">
        <span>${displayVal.toLocaleString()}</span>
        {delta !== null && (
          <span className={`corner-change-number ${delta >= 0 ? 'positive' : 'negative'}`}>
            {delta >= 0 ? '+' : '-'}${Math.abs(delta)}
          </span>
        )}
      </div>
    );
  }
);
