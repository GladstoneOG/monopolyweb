// src/components/board/BoardTile.tsx
import React from 'react';
import type { Ruleset, TileState } from '../../engine/types';
import { getTileGridCoords, getTileSideClass } from '../../utils/boardGeometry';
import { SpecialTileContent } from './TileIcons';

export interface FloatingTileText {
  id: string;
  tileIndex: number;
  text: string;
  type:
    | 'bought'
    | 'rent'
    | 'built'
    | 'sold'
    | 'mortgaged'
    | 'jailed'
    | 'monopoly'
    | 'salary'
    | 'traded'
    | 'acquired'
    | 'festival'
    | 'airport';
}

export interface TilePointerMarker {
  playerId: string;
  color: string;
}

export interface TileHighlightState {
  mode: 'none' | 'selectable' | 'selected' | 'dimmed' | 'trade-get' | 'trade-give';
  badge?: string;
  accentColor?: string;
}

interface BoardTileProps {
  tile: TileState;
  ruleset: Ruleset;
  ownerColor: string;
  ownerTint?: string;
  monopolyGlowColor: string | null;
  isHighlightedActive: boolean;
  highlight: TileHighlightState;
  pointers: TilePointerMarker[];
  floatingTexts: FloatingTileText[];
  showJailBars: boolean;
  onTileClick: (tileIndex: number) => void;
}

export const BoardTile: React.FC<BoardTileProps> = React.memo(
  ({
    tile,
    ruleset,
    ownerColor,
    ownerTint,
    monopolyGlowColor,
    isHighlightedActive,
    highlight,
    pointers,
    floatingTexts,
    showJailBars,
    onTileClick,
  }) => {
    const { row, col } = getTileGridCoords(tile.index);
    const sideClass = getTileSideClass(tile.index);
    const isCorner =
      tile.type === 'go' ||
      tile.type === 'jail' ||
      tile.type === 'parking' ||
      tile.type === 'gotojail';
    const isHorizontal = sideClass === 'bottom-row' || sideClass === 'top-row';
    const isProp = tile.type === 'property';
    const isGetRich = ruleset === 'Get Rich';

    // Bug Fix #8: Matching corner gradients for Get Rich (Tile 20 Airport = sky blue, Tile 30 Festival = amber gold)
    let cornerGetRichStyle: React.CSSProperties = {};
    if (isGetRich) {
      if (tile.type === 'parking') {
        cornerGetRichStyle = {
          background: 'linear-gradient(135deg, #e0f2fe 0%, #bae6fd 100%)',
          border: '2.5px solid #0284c7',
        };
      } else if (tile.type === 'gotojail') {
        cornerGetRichStyle = {
          background: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)',
          border: '2.5px solid #d97706',
        };
      } else if (tile.type === 'tax') {
        cornerGetRichStyle = {
          background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)',
          border: '2px solid #fbbf24',
        };
      }
    }

    let highlightStyle: React.CSSProperties = {};
    if (highlight.mode === 'selected') {
      const c = highlight.accentColor ?? '#10b981';
      highlightStyle = {
        border: `3.5px solid ${c}`,
        boxShadow: `inset 0 0 14px ${c}aa, 0 0 12px ${c}aa`,
        zIndex: 95,
        transform: 'translateZ(3px)',
        cursor: 'pointer',
      };
    } else if (highlight.mode === 'selectable') {
      const c = highlight.accentColor ?? '#3b82f6';
      highlightStyle = {
        border: `3px solid ${c}`,
        boxShadow: `inset 0 0 8px ${c}66, 0 0 8px ${c}66`,
        zIndex: 94,
        transform: 'translateZ(2px)',
        cursor: 'pointer',
      };
    } else if (highlight.mode === 'trade-get') {
      highlightStyle = {
        border: '3.5px solid #10b981',
        boxShadow: 'inset 0 0 16px rgba(16,185,129,0.7), 0 0 12px rgba(16,185,129,0.8)',
        zIndex: 95,
        transform: 'translateZ(3px)',
      };
    } else if (highlight.mode === 'trade-give') {
      highlightStyle = {
        border: '3.5px solid #ef4444',
        boxShadow: 'inset 0 0 16px rgba(239,68,68,0.7), 0 0 12px rgba(239,68,68,0.8)',
        zIndex: 95,
        transform: 'translateZ(3px)',
      };
    } else if (highlight.mode === 'dimmed') {
      highlightStyle = {
        opacity: 0.45,
        pointerEvents: 'none',
      };
    }

    const tileStyle: React.CSSProperties = {
      gridRow: row,
      gridColumn: col,
      ['--monopoly-glow-color' as string]: monopolyGlowColor ?? '#cbd5e1',
      ['--tile-owner-tint' as string]: ownerTint,
      border: tile.owner ? `3px solid ${ownerColor}` : undefined,
      ...cornerGetRichStyle,
      ...highlightStyle,
    };

    const classNames = [
      'monopoly-tile',
      isCorner ? 'corner-tile' : 'side-tile',
      isProp ? 'property-tile' : '',
      sideClass,
      isHorizontal ? 'horizontal-tile' : 'vertical-tile',
      tile.index === 10 ? 'jail-space' : '',
      `tile-${tile.type}`,
      isHighlightedActive ? 'highlighted' : '',
      monopolyGlowColor ? 'monopoly-glow' : '',
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <div
        className={classNames}
        style={tileStyle}
        onClick={() => onTileClick(tile.index)}
      >
        {highlight.badge && (
          <div
            className="tile-selection-badge"
            style={{
              background:
                highlight.mode === 'selected' || highlight.mode === 'trade-get'
                  ? highlight.accentColor ?? '#10b981'
                  : highlight.mode === 'trade-give'
                  ? '#ef4444'
                  : highlight.accentColor ?? '#3b82f6',
            }}
          >
            {highlight.badge}
          </div>
        )}

        {/* Property Color Header Bar */}
        {isProp && tile.color && (
          <div className={`color-bar tile-group-${tile.color}`}>
            {monopolyGlowColor && !tile.mortgaged && (
              <span className="monopoly-crown-tag">👑 x2</span>
            )}
          </div>
        )}

        {/* Festival Boost Badge */}
        {tile.festivalTurns > 0 && !tile.mortgaged && (
          <div className="festival-boost-badge">👑 x2 ({tile.festivalTurns}T)</div>
        )}

        {/* Tile Text / Vector Content */}
        <div className="tile-info-container">
          {isProp ? (
            <>
              <div className="tile-name">{tile.name}</div>
              {!tile.owner && tile.price && (
                <span className="tile-price">${tile.price}</span>
              )}
            </>
          ) : (
            <SpecialTileContent tile={tile} ruleset={ruleset} />
          )}
        </div>

        {/* Jail Bars Slam Animation */}
        {tile.index === 10 && showJailBars && (
          <div className="jail-bars-animation-container">
            <div className="jail-bar-gate">
              <div className="jail-bar-rail top" />
              <div className="jail-bar" />
              <div className="jail-bar" />
              <div className="jail-bar" />
              <div className="jail-bar" />
              <div className="jail-bar-rail bottom" />
            </div>
            <div className="jailed-text-popup">Jailed!</div>
          </div>
        )}

        {/* 3D Houses & Gold Hotel Models */}
        {tile.houses > 0 && !tile.mortgaged && (
          <div className={`tile-buildings-container ${tile.houses === 4 ? 'grid-layout' : ''}`}>
            {tile.houses === 5 ? (
              <div
                className="cube-3d hotel"
                style={{ ['--building-color' as string]: ownerColor }}
              >
                <div className="cube-face face-bottom" />
                <div className="cube-face face-front" />
                <div className="cube-face face-back" />
                <div className="cube-face face-left" />
                <div className="cube-face face-right" />
                <div className="cube-face face-top" />
              </div>
            ) : (
              Array.from({ length: tile.houses }).map((_, hIdx) => (
                <div
                  key={hIdx}
                  className="cube-3d house"
                  style={{ ['--building-color' as string]: ownerColor }}
                >
                  <div className="cube-face face-bottom" />
                  <div className="cube-face face-front" />
                  <div className="cube-face face-back" />
                  <div className="cube-face face-left" />
                  <div className="cube-face face-right" />
                  <div className="cube-face face-top" />
                </div>
              ))
            )}
          </div>
        )}

        {tile.mortgaged && <div className="tile-mortgaged-badge">MORTGAGED</div>}

        {/* Outer edge directional pointers for players on this space */}
        {pointers.map((pt, pIdx) => {
          const offset = (pIdx - (pointers.length - 1) / 2) * 12;
          let style: React.CSSProperties;
          if (tile.index === 0 || (sideClass === 'bottom-row' && tile.index !== 10)) {
            style = {
              bottom: '-14px',
              left: `calc(50% + ${offset}px)`,
              transform: 'rotate(180deg) translateZ(3px)',
            };
          } else if (tile.index === 10 || (sideClass === 'left-col' && tile.index !== 20)) {
            style = {
              left: '-14px',
              top: `calc(50% + ${offset}px)`,
              transform: 'rotate(-90deg) translateZ(3px)',
            };
          } else if (tile.index === 20 || (sideClass === 'top-row' && tile.index !== 30)) {
            style = {
              top: '-14px',
              left: `calc(50% + ${offset}px)`,
              transform: 'translateZ(3px)',
            };
          } else {
            style = {
              right: '-14px',
              top: `calc(50% + ${offset}px)`,
              transform: 'rotate(90deg) translateZ(3px)',
            };
          }
          return (
            <div
              key={pt.playerId}
              className="tile-player-pointer"
              style={{ ...style, borderTopColor: pt.color }}
            />
          );
        })}

        {/* Floating action popups */}
        {floatingTexts.map((ft) => (
          <div key={ft.id} className="tile-action-popup-wrapper">
            <div className={`tile-action-popup ${ft.type}`}>{ft.text}</div>
          </div>
        ))}
      </div>
    );
  }
);
