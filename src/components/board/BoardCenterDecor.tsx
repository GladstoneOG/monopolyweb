// src/components/board/BoardCenterDecor.tsx
import React from 'react';
import type { Ruleset } from '../../engine/types';

export interface FlyingCardAnim {
  x: number;
  y: number;
  z: number;
  rot: number;
  scale: number;
  type: 'chance' | 'chest';
}

interface BoardCenterDecorProps {
  ruleset: Ruleset;
  turnCount: number;
  turnLimit: number;
  isDimmed: boolean;
  flyingCard: FlyingCardAnim | null;
}

export const BoardCenterDecor: React.FC<BoardCenterDecorProps> = React.memo(
  ({ ruleset, turnCount, turnLimit, isDimmed, flyingCard }) => {
    return (
      <>
        <div className="monopoly-board-center">
          {isDimmed && <div className="board-center-dim" />}

          {/* Ambient Skyline Backdrop */}
          <div className="board-center-scrolling-city">
            <div className="scrolling-city-diagonal-wrapper">
              <div className="background-sun-container">
                <svg className="spinning-sun-svg" viewBox="0 0 100 100" aria-hidden="true">
                  <g fill="#fde047" opacity="0.85">
                    <path d="M 50 10 L 54 36 L 46 36 Z" />
                    <path d="M 50 90 L 54 64 L 46 64 Z" />
                    <path d="M 10 50 L 36 54 L 36 46 Z" />
                    <path d="M 90 50 L 64 54 L 64 46 Z" />
                    <path d="M 22 22 L 40 38 L 36 42 Z" />
                    <path d="M 78 78 L 60 62 L 64 58 Z" />
                    <path d="M 78 22 L 62 40 L 58 36 Z" />
                    <path d="M 22 78 L 38 60 L 42 64 Z" />
                  </g>
                  <circle cx="50" cy="50" r="18" fill="url(#monoSunGrad)" />
                  <defs>
                    <radialGradient id="monoSunGrad" cx="50%" cy="50%" r="50%">
                      <stop offset="0%" stopColor="#ffffff" />
                      <stop offset="50%" stopColor="#fef08a" />
                      <stop offset="100%" stopColor="#eab308" />
                    </radialGradient>
                  </defs>
                </svg>
              </div>

              <div className="scrolling-city-ribbon">
                {[0, 1].map((idx) => (
                  <svg
                    key={idx}
                    className="city-svg-ribbon"
                    viewBox="0 0 1000 120"
                    fill="none"
                    preserveAspectRatio="none"
                    aria-hidden="true"
                  >
                    <path
                      d="M0 120 H1000 V80 H950 V95 H920 V85 H880 V90 H840 V75 H810 V95 H780 V70 H740 V85 H710 V60 H670 V85 H630 V80 H600 V95 H570 V85 H530 V90 H490 V75 H460 V95 H430 V70 H390 V85 H360 V60 H320 V85 H280 V80 H250 V95 H220 V85 H180 V90 H140 V75 H110 V95 H80 V70 H40 V85 H10 V60 Z"
                      fill="#cbd5e1"
                      opacity="0.4"
                    />
                    <path
                      d="M0 120 H1000 V95 H970 V105 H930 V100 H900 V105 H860 V90 H820 V105 H790 V95 H750 V102 H720 V90 H680 V105 H640 V95 H610 V105 H570 V100 H540 V105 H500 V90 H460 V105 H430 V95 H390 V102 H360 V90 H320 V105 H280 V95 H251 V105 H211 V100 H181 V105 H141 V90 H101 V105 H71 V95 H31 V102 H1 V90 Z"
                      fill="#94a3b8"
                      opacity="0.6"
                    />
                  </svg>
                ))}
              </div>
            </div>
          </div>

          <div className="monopoly-logo">
            {ruleset === 'Get Rich' ? 'GET RICH!' : 'MONOPOLY'}
          </div>

          <div className={`board-turn-pill ${turnLimit > 0 ? 'limited' : ''}`}>
            {turnLimit > 0
              ? `⏱️ Turn ${turnCount} / ${turnLimit}`
              : `🎲 Turn ${turnCount}`}
          </div>

          {/* 3D Physical Chance Deck */}
          <div className="monopoly-deck-slot chance">
            {Array.from({ length: 7 }).map((_, i) => (
              <div
                key={i}
                className="physical-deck-card chance-card-back"
                style={{
                  transform: `translate3d(0, 0, ${i * 2.4}px) rotateZ(${-45 + (i % 2 === 0 ? 0.5 : -0.5)}deg)`,
                }}
              >
                <div className="card-back-design">
                  <span>❓</span>
                  <span className="card-back-text">CHANCE</span>
                </div>
              </div>
            ))}
          </div>

          {/* 3D Physical Community Chest Deck */}
          <div className="monopoly-deck-slot chest">
            {Array.from({ length: 7 }).map((_, i) => (
              <div
                key={i}
                className="physical-deck-card chest-card-back"
                style={{
                  transform: `translate3d(0, 0, ${i * 2.4}px) rotateZ(${135 + (i % 2 === 0 ? 0.5 : -0.5)}deg)`,
                }}
              >
                <div className="card-back-design">
                  <span>🧰</span>
                  <span className="card-back-text">CHEST</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {flyingCard && (
          <div
            className={`flying-3d-card ${flyingCard.type}-card`}
            style={{
              left: `calc(50% + ${flyingCard.x}px)`,
              top: `calc(50% + ${flyingCard.y}px)`,
              transform: `translate(-50%, -50%) translateZ(${flyingCard.z}px) rotateZ(${flyingCard.rot}deg) scale(${flyingCard.scale}) rotateX(20deg)`,
            }}
          >
            <div className="card-back-design">
              <span>{flyingCard.type === 'chance' ? '❓' : '🧰'}</span>
              <span className="card-back-text">
                {flyingCard.type === 'chance' ? 'CHANCE' : 'COMMUNITY CHEST'}
              </span>
            </div>
          </div>
        )}
      </>
    );
  }
);
