// src/components/board/FlyingBillsLayer.tsx
import React from 'react';

export interface FlyingBillParticle {
  id: string;
  val: number;
  startX: number;
  startY: number;
  startZ: number;
  endX: number;
  endY: number;
  endZ: number;
  rotStart: number;
  rotEnd: number;
  delay: number;
}

interface FlyingBillsLayerProps {
  bills: readonly FlyingBillParticle[];
}

export const FlyingBillsLayer: React.FC<FlyingBillsLayerProps> = React.memo(({ bills }) => {
  if (bills.length === 0) return null;

  return (
    <>
      {bills.map((bill) => (
        <div
          key={bill.id}
          className={`flying-bill table-bill val-${bill.val}`}
          style={{
            ['--start-x' as string]: `${bill.startX}px`,
            ['--start-y' as string]: `${bill.startY}px`,
            ['--start-z' as string]: `${bill.startZ}px`,
            ['--end-x' as string]: `${bill.endX}px`,
            ['--end-y' as string]: `${bill.endY}px`,
            ['--end-z' as string]: `${bill.endZ}px`,
            ['--rot-z-start' as string]: `${bill.rotStart}deg`,
            ['--rot-z-end' as string]: `${bill.rotEnd}deg`,
            animationDelay: `${bill.delay}ms`,
          }}
        >
          <div className="table-bill-inner">
            <div className="table-bill-ellipse">
              <span className="table-bill-center-val">M</span>
            </div>
            <span className="table-bill-corner tl">{bill.val}</span>
            <span className="table-bill-corner br">{bill.val}</span>
          </div>
        </div>
      ))}
    </>
  );
});
