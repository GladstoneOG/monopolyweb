// src/engine/winConditions.ts
import { BOARD_LINES, TOURISM_INDICES } from './boardData';
import type { PlayerState, RoomState, TileState } from './types';

export function computeNetWorth(player: PlayerState, board: readonly TileState[]): number {
  let value = player.money;
  for (const tile of board) {
    if (tile.owner === player.id) {
      if (tile.mortgaged) {
        value += tile.mortgageValue ?? 0;
      } else {
        value += tile.price ?? 0;
        if (tile.houses > 0) {
          value += tile.houses * (tile.housePrice ?? 0);
        }
      }
    }
  }
  return value;
}

export function refreshAllNetWorths(players: PlayerState[], board: readonly TileState[]): void {
  for (const p of players) {
    p.netWorth = computeNetWorth(p, board);
  }
}

export interface SpecialWinMatch {
  winnerId: string;
  reason: string;
  winType: 'tourism' | 'line';
}

export function detectGetRichSpecialWin(state: RoomState): SpecialWinMatch | null {
  if (state.rules.ruleset !== 'Get Rich') return null;

  const activePlayers = state.players.filter((p) => !p.bankrupt);
  for (const player of activePlayers) {
    const ownsAllTourism = TOURISM_INDICES.every(
      (idx) => state.board[idx]?.owner === player.id
    );
    if (ownsAllTourism) {
      return {
        winnerId: player.id,
        reason: 'Tourism Win (owns all 6 Railway & Tourist spots)',
        winType: 'tourism',
      };
    }

    const lineEntries: Array<[string, readonly number[]]> = [
      ['Bottom', BOARD_LINES.bottom],
      ['Left', BOARD_LINES.left],
      ['Top', BOARD_LINES.top],
      ['Right', BOARD_LINES.right],
    ];

    for (const [label, indices] of lineEntries) {
      if (indices.every((idx) => state.board[idx]?.owner === player.id)) {
        return {
          winnerId: player.id,
          reason: `Line Win (owns all properties on the ${label} side)`,
          winType: 'line',
        };
      }
    }
  }

  return null;
}

export interface PlayerVictoryProgress {
  playerId: string;
  tourismOwned: number;
  tourismTotal: number;
  bestLineName: 'Bottom' | 'Left' | 'Top' | 'Right';
  bestLineOwned: number;
  bestLineTotal: number;
  isCloseToWin: boolean;
}

export function getVictoryProgress(
  players: readonly PlayerState[],
  board: readonly TileState[]
): PlayerVictoryProgress[] {
  const lineDefs: Array<['Bottom' | 'Left' | 'Top' | 'Right', readonly number[]]> = [
    ['Bottom', BOARD_LINES.bottom],
    ['Left', BOARD_LINES.left],
    ['Top', BOARD_LINES.top],
    ['Right', BOARD_LINES.right],
  ];

  return players
    .filter((p) => !p.bankrupt)
    .map((p) => {
      const tourismOwned = TOURISM_INDICES.filter((idx) => board[idx]?.owner === p.id).length;
      const tourismTotal = TOURISM_INDICES.length;

      let bestLineName: 'Bottom' | 'Left' | 'Top' | 'Right' = 'Bottom';
      let bestLineOwned = 0;
      let bestLineTotal: number = BOARD_LINES.bottom.length;
      let bestRatio = -1;

      for (const [name, indices] of lineDefs) {
        const owned = indices.filter((idx) => board[idx]?.owner === p.id).length;
        const ratio = owned / indices.length;
        if (ratio > bestRatio || (ratio === bestRatio && indices.length - owned < bestLineTotal - bestLineOwned)) {
          bestRatio = ratio;
          bestLineName = name;
          bestLineOwned = owned;
          bestLineTotal = indices.length;
        }
      }

      const isCloseToWin =
        tourismTotal - tourismOwned <= 2 || bestLineTotal - bestLineOwned <= 2;

      return {
        playerId: p.id,
        tourismOwned,
        tourismTotal,
        bestLineName,
        bestLineOwned,
        bestLineTotal,
        isCloseToWin,
      };
    });
}
