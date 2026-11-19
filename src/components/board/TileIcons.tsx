// src/components/board/TileIcons.tsx
import React from 'react';
import type { Ruleset, TileState } from '../../engine/types';

interface SpecialTileContentProps {
  tile: TileState;
  ruleset: Ruleset;
}

export const SpecialTileContent: React.FC<SpecialTileContentProps> = React.memo(
  ({ tile, ruleset }) => {
    const isGetRich = ruleset === 'Get Rich';

    if (tile.type === 'go') {
      return (
        <div className="special-tile-content">
          <svg className="tile-svg-icon go-icon" viewBox="0 0 40 40" aria-hidden="true">
            <circle cx="20" cy="20" r="17" fill="#ef4444" stroke="#0f172a" strokeWidth="2.5" />
            <path d="M12 20h14m0 0l-5-5m5 5l-5 5" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          </svg>
          <span className="special-title dark">GO</span>
          <span className="special-sub">+$200{isGetRich ? ' · BUILD' : ''}</span>
        </div>
      );
    }

    if (tile.type === 'jail') {
      return (
        <div className="special-tile-content">
          <svg className="tile-svg-icon" viewBox="0 0 40 40" aria-hidden="true">
            <rect x="6" y="7" width="28" height="26" rx="4" fill="#f97316" stroke="#0f172a" strokeWidth="2.5" />
            <path d="M14 7v26M20 7v26M26 7v26M6 16h28" stroke="#0f172a" strokeWidth="2.5" />
          </svg>
          <span className="special-title dark">JAIL</span>
          <span className="special-sub">JUST VISITING</span>
        </div>
      );
    }

    // Tile 20: Free Parking (Classic) / Airport (Get Rich)
    if (tile.type === 'parking') {
      if (isGetRich) {
        return (
          <div className="special-tile-content">
            <svg className="tile-svg-icon" viewBox="0 0 40 40" aria-hidden="true">
              <circle cx="20" cy="20" r="17" fill="#0284c7" stroke="#0c4a6e" strokeWidth="2" />
              <path d="M10 24l8-4-2-9 3-2 6 8 7-3c1.5-.6 2.8.8 2 2.2l-5 5 2 9-3 1.5-5-7-8 4-3 3-2-1 2-4-4-2 2-1.7z" fill="#ffffff" />
            </svg>
            <span className="special-title sky">AIRPORT</span>
            <span className="special-sub">$100 TO FLY</span>
          </div>
        );
      }
      return (
        <div className="special-tile-content">
          <svg className="tile-svg-icon" viewBox="0 0 40 40" aria-hidden="true">
            <rect x="6" y="16" width="28" height="12" rx="4" fill="#ef4444" stroke="#0f172a" strokeWidth="2" />
            <path d="M11 16l4-7h10l4 7" fill="#fca5a5" stroke="#0f172a" strokeWidth="2" />
            <circle cx="13" cy="28" r="3.5" fill="#0f172a" />
            <circle cx="27" cy="28" r="3.5" fill="#0f172a" />
          </svg>
          <span className="special-title dark">FREE</span>
          <span className="special-sub">PARKING</span>
        </div>
      );
    }

    // Tile 30: Go To Jail (Classic) / Festival (Get Rich)
    if (tile.type === 'gotojail') {
      if (isGetRich) {
        return (
          <div className="special-tile-content">
            <svg className="tile-svg-icon" viewBox="0 0 40 40" aria-hidden="true">
              <circle cx="20" cy="20" r="17" fill="#f59e0b" stroke="#92400e" strokeWidth="2" />
              <path d="M10 26l3-11 7 5 7-5 3 11H10z" fill="#fef08a" stroke="#78350f" strokeWidth="2" strokeLinejoin="round" />
              <circle cx="20" cy="11" r="2.2" fill="#ffffff" />
            </svg>
            <span className="special-title amber">FESTIVAL</span>
            <span className="special-sub">x2 RENT · 3T</span>
          </div>
        );
      }
      return (
        <div className="special-tile-content">
          <svg className="tile-svg-icon" viewBox="0 0 40 40" aria-hidden="true">
            <circle cx="20" cy="20" r="17" fill="#dc2626" stroke="#0f172a" strokeWidth="2" />
            <path d="M13 13l14 14M27 13L13 27" stroke="#ffffff" strokeWidth="3.5" strokeLinecap="round" />
          </svg>
          <span className="special-title danger">GO TO</span>
          <span className="special-title danger">JAIL</span>
        </div>
      );
    }

    if (tile.type === 'chance') {
      return (
        <div className="special-tile-content">
          <svg className="tile-svg-icon premium-emoji-shake" viewBox="0 0 40 40" aria-hidden="true">
            <rect x="6" y="6" width="28" height="28" rx="6" fill="#fef2f2" stroke="#ef4444" strokeWidth="2.5" />
            <text x="20" y="29" textAnchor="middle" fontSize="24" fontWeight="900" fill="#ef4444">?</text>
          </svg>
          <span className="special-title danger">CHANCE</span>
        </div>
      );
    }

    if (tile.type === 'chest') {
      return (
        <div className="special-tile-content">
          <svg className="tile-svg-icon premium-emoji-shake" viewBox="0 0 40 40" aria-hidden="true">
            <rect x="6" y="13" width="28" height="19" rx="3" fill="#3b82f6" stroke="#1e3a8a" strokeWidth="2" />
            <path d="M6 19h28" stroke="#fbbf24" strokeWidth="2.5" />
            <rect x="17" y="16" width="6" height="6" rx="1" fill="#fbbf24" stroke="#1e3a8a" strokeWidth="1.5" />
          </svg>
          <span className="special-title blue">CHEST</span>
        </div>
      );
    }

    if (tile.type === 'railroad') {
      return (
        <div className="special-tile-content">
          <svg className="tile-svg-icon" viewBox="0 0 40 40" aria-hidden="true">
            <rect x="9" y="10" width="22" height="19" rx="5" fill="#334155" stroke="#0f172a" strokeWidth="2" />
            <rect x="13" y="13" width="14" height="7" rx="2" fill="#93c5fd" />
            <circle cx="15" cy="24" r="2" fill="#fbbf24" />
            <circle cx="25" cy="24" r="2" fill="#fbbf24" />
            <path d="M12 31l-3 4M28 31l3 4" stroke="#0f172a" strokeWidth="2.5" strokeLinecap="round" />
          </svg>
          <span className="special-city">{tile.name}</span>
          {!tile.owner && tile.price && <span className="tile-price">${tile.price}</span>}
        </div>
      );
    }

    if (tile.type === 'utility') {
      const isBali = tile.name.toLowerCase().includes('bali');
      return (
        <div className="special-tile-content">
          <svg className="tile-svg-icon" viewBox="0 0 40 40" aria-hidden="true">
            <circle cx="20" cy="20" r="16" fill={isBali ? '#dcfce7' : '#e0f2fe'} stroke={isBali ? '#16a34a' : '#0284c7'} strokeWidth="2" />
            {isBali ? (
              <>
                <path d="M20 31V18" stroke="#92400e" strokeWidth="3" strokeLinecap="round" />
                <path d="M20 18c-5-5-10-3-11 0 4-1 7 0 11 0zm0 0c5-5 10-3 11 0-4-1-7 0-11 0zm0 0c-2-6 2-10 5-10-2 3-3 6-5 10z" fill="#16a34a" />
              </>
            ) : (
              <path d="M9 24c3-4 6-4 9 0s6 4 9 0 4-3 4-3v6H9v-3z" fill="#0284c7" />
            )}
          </svg>
          <span className="special-city">{tile.name}</span>
          {!tile.owner && tile.price && <span className="tile-price">${tile.price}</span>}
        </div>
      );
    }

    if (tile.type === 'tax') {
      if (isGetRich) {
        return (
          <div className="special-tile-content">
            <svg className="tile-svg-icon" viewBox="0 0 40 40" aria-hidden="true">
              <circle cx="20" cy="20" r="16" fill="#7c3aed" stroke="#fbbf24" strokeWidth="2.5" strokeDasharray="5 3" />
              <circle cx="20" cy="20" r="9" fill="#fbbf24" />
              <text x="20" y="24" textAnchor="middle" fontSize="11" fontWeight="900" fill="#1e1b4b">$</text>
            </svg>
            <span className="special-title gold">CASINO</span>
            <span className="special-sub gold-sub">COIN FLIP</span>
          </div>
        );
      }
      return (
        <div className="special-tile-content">
          <svg className="tile-svg-icon" viewBox="0 0 40 40" aria-hidden="true">
            <polygon points="20,6 34,20 20,34 6,20" fill="#fee2e2" stroke="#ef4444" strokeWidth="2.5" />
            <text x="20" y="25" textAnchor="middle" fontSize="14" fontWeight="900" fill="#dc2626">$</text>
          </svg>
          <span className="special-city danger">{tile.name}</span>
          <span className="special-sub danger">Pay ${tile.price}</span>
        </div>
      );
    }

    return null;
  }
);
