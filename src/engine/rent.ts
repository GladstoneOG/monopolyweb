// src/engine/rent.ts
import type { PropertyColor, TileState } from './types';

export function countPropertiesInColor(board: readonly TileState[], color: PropertyColor): number {
  return board.filter((t) => t.type === 'property' && t.color === color).length;
}

export function ownsMonopoly(
  board: readonly TileState[],
  color: PropertyColor | undefined,
  playerId: string | null
): boolean {
  if (!color || !playerId) return false;
  const group = board.filter((t) => t.type === 'property' && t.color === color);
  return group.length > 0 && group.every((t) => t.owner === playerId);
}

/**
 * Bug Fix #1: Correct property rent indexing!
 * tile.rent has 7 entries: [base, monopoly0H, 1H, 2H, 3H, 4H, hotel].
 * - houses === 0: monopoly ? rent[1] : rent[0]
 * - houses === 1..5: rent[houses + 1]  (1H -> rent[2], ..., Hotel (5) -> rent[6])
 */
export function getPropertyRentSchedule(tile: Pick<TileState, 'rent'>): {
  base: number;
  monopoly: number;
  houses: [number, number, number, number];
  hotel: number;
} {
  const r = tile.rent ?? [0, 0, 0, 0, 0, 0, 0];
  return {
    base: r[0] ?? 0,
    monopoly: r[1] ?? (r[0] ?? 0) * 2,
    houses: [r[2] ?? 0, r[3] ?? 0, r[4] ?? 0, r[5] ?? 0],
    hotel: r[6] ?? 0,
  };
}

export function calculateTileRent(
  tile: TileState,
  board: readonly TileState[],
  diceSum: number,
  chanceDoubleMultiplier = false
): number {
  if (!tile.owner || tile.mortgaged) return 0;

  let base = 0;

  if (tile.type === 'property' && tile.rent) {
    const schedule = getPropertyRentSchedule(tile);
    if (tile.houses === 0) {
      const isMono = ownsMonopoly(board, tile.color, tile.owner);
      base = isMono ? schedule.monopoly : schedule.base;
    } else if (tile.houses >= 1 && tile.houses <= 4) {
      base = schedule.houses[tile.houses - 1];
    } else {
      base = schedule.hotel;
    }
  } else if (tile.type === 'railroad' && tile.rent) {
    const count = board.filter((t) => t.type === 'railroad' && t.owner === tile.owner).length;
    const baseRent = tile.rent[Math.max(0, Math.min(count - 1, 3))] ?? 25;
    base = chanceDoubleMultiplier ? baseRent * 2 : baseRent;
  } else if (tile.type === 'utility') {
    const count = board.filter((t) => t.type === 'utility' && t.owner === tile.owner).length;
    const mult = chanceDoubleMultiplier ? 10 : count === 2 ? 10 : 4;
    base = diceSum * mult;
  }

  if (tile.festivalTurns > 0) {
    base *= 2;
  }

  return base;
}

export function calculateForceAcquireWorth(tile: TileState): number {
  return (tile.price ?? 0) + tile.houses * (tile.housePrice ?? 0);
}
