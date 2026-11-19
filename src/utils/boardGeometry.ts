// src/utils/boardGeometry.ts
import type { PlayerState } from '../engine/types';

export function getTileGridCoords(index: number): { row: number; col: number } {
  if (index >= 0 && index <= 10) {
    // Bottom row (Right to Left): 0 = col 11, 10 = col 1
    return { row: 11, col: 11 - index };
  }
  if (index > 10 && index <= 20) {
    // Left col (Bottom to Top): 11 = row 10, 20 = row 1
    return { row: 11 - (index - 10), col: 1 };
  }
  if (index > 20 && index <= 30) {
    // Top row (Left to Right): 21 = col 2, 30 = col 11
    return { row: 1, col: 1 + (index - 20) };
  }
  // Right col (Top to Bottom): 31 = row 2, 39 = row 10
  return { row: 1 + (index - 30), col: 11 };
}

export function getTileSideClass(index: number): 'bottom-row' | 'left-col' | 'top-row' | 'right-col' {
  if (index >= 0 && index <= 10) return 'bottom-row';
  if (index > 10 && index <= 20) return 'left-col';
  if (index > 20 && index <= 30) return 'top-row';
  return 'right-col';
}

/**
 * Local board coordinates (X, Y) relative to board center (0, 0).
 * Board dimensions: 638px x 620px (85px corners, 52px side col tracks, 50px side row tracks).
 */
export function getTileLocalCoords(index: number): { x: number; y: number } {
  const { row, col } = getTileGridCoords(index);
  const centerCol = (c: number) => {
    if (c === 1) return 42.5;
    if (c >= 2 && c <= 10) return 111 + (c - 2) * 52;
    return 595.5;
  };
  const centerRow = (r: number) => {
    if (r === 1) return 42.5;
    if (r >= 2 && r <= 10) return 110 + (r - 2) * 50;
    return 577.5;
  };
  return {
    x: centerCol(col) - 319,
    y: centerRow(row) - 310,
  };
}

export function getPlayerStackCoords(playerIdx: number): { x: number; y: number; z: number } {
  if (playerIdx === 0) return { x: 319, y: -110, z: 0 };
  if (playerIdx === 1) return { x: 820, y: 310, z: 0 };
  if (playerIdx === 2) return { x: 319, y: 730, z: 0 };
  if (playerIdx === 3) return { x: -180, y: 310, z: 0 };
  return { x: 319, y: 310, z: 0 };
}

const PLAYER_COLORS = ['#3b82f6', '#10b981', '#ef4444', '#eab308'] as const;
const PLAYER_TINTS = [
  'rgba(59, 130, 246, 0.16)',
  'rgba(16, 185, 129, 0.16)',
  'rgba(239, 68, 68, 0.16)',
  'rgba(234, 179, 8, 0.16)',
] as const;

export function getPlayerColor(players: readonly PlayerState[], ownerId: string | null): string {
  if (!ownerId) return '#cbd5e1';
  const idx = players.findIndex((p) => p.id === ownerId);
  return PLAYER_COLORS[idx] ?? '#8b5cf6';
}

export function getPlayerColorTint(
  players: readonly PlayerState[],
  ownerId: string | null
): string | undefined {
  if (!ownerId) return undefined;
  const idx = players.findIndex((p) => p.id === ownerId);
  return PLAYER_TINTS[idx] ?? 'rgba(139, 92, 246, 0.16)';
}
