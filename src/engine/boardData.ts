// src/engine/boardData.ts
import type { PropertyColor, TileDefinition, TileState } from './types';

export const PROPERTY_COLORS: readonly PropertyColor[] = [
  'brown',
  'lightblue',
  'pink',
  'orange',
  'red',
  'yellow',
  'green',
  'darkblue',
] as const;

export const BOARD_LINES = {
  bottom: [1, 3, 5, 6, 8, 9],
  left: [11, 12, 13, 14, 15, 16, 18, 19],
  top: [21, 23, 24, 25, 26, 27, 28, 29],
  right: [31, 32, 34, 35, 37, 39],
} as const;

export const TOURISM_INDICES = [5, 12, 15, 25, 28, 35] as const;
export const RAILROAD_INDICES = [5, 15, 25, 35] as const;
export const UTILITY_INDICES = [12, 28] as const;

/**
 * Tile 20 = Free Parking (Classic) / Airport (Get Rich)
 * Tile 30 = Go To Jail (Classic) / Festival (Get Rich)
 */
export const AIRPORT_TILE_INDEX = 20;
export const FESTIVAL_TILE_INDEX = 30;
export const JAIL_TILE_INDEX = 10;

export const BOARD_TILES: readonly TileDefinition[] = [
  { index: 0, name: 'GO', type: 'go' },
  { index: 1, name: 'Bandung', type: 'property', color: 'brown', price: 60, rent: [2, 4, 10, 30, 90, 160, 250], housePrice: 50, mortgageValue: 30 },
  { index: 2, name: 'Community Chest', type: 'chest' },
  { index: 3, name: 'Jakarta', type: 'property', color: 'brown', price: 60, rent: [4, 8, 20, 60, 180, 320, 450], housePrice: 50, mortgageValue: 30 },
  { index: 4, name: 'Income Tax', type: 'tax', price: 200 },
  { index: 5, name: 'Orient Express', type: 'railroad', price: 200, rent: [25, 50, 100, 200], mortgageValue: 100 },
  { index: 6, name: 'Zaragoza', type: 'property', color: 'lightblue', price: 100, rent: [6, 12, 30, 90, 270, 400, 550], housePrice: 50, mortgageValue: 50 },
  { index: 7, name: 'Chance', type: 'chance' },
  { index: 8, name: 'Valencia', type: 'property', color: 'lightblue', price: 100, rent: [6, 12, 30, 90, 270, 400, 550], housePrice: 50, mortgageValue: 50 },
  { index: 9, name: 'Barcelona', type: 'property', color: 'lightblue', price: 120, rent: [8, 16, 40, 100, 300, 450, 600], housePrice: 50, mortgageValue: 60 },
  { index: 10, name: 'Jail / Just Visiting', type: 'jail' },
  { index: 11, name: 'Adelaide', type: 'property', color: 'pink', price: 140, rent: [10, 20, 50, 150, 450, 625, 750], housePrice: 100, mortgageValue: 70 },
  { index: 12, name: 'Bali', type: 'utility', price: 150, rent: [4, 10], mortgageValue: 75 },
  { index: 13, name: 'Melbourne', type: 'property', color: 'pink', price: 140, rent: [10, 20, 50, 150, 450, 625, 750], housePrice: 100, mortgageValue: 70 },
  { index: 14, name: 'Sydney', type: 'property', color: 'pink', price: 160, rent: [12, 24, 60, 180, 500, 700, 900], housePrice: 100, mortgageValue: 80 },
  { index: 15, name: 'Trans-Siberian Railway', type: 'railroad', price: 200, rent: [25, 50, 100, 200], mortgageValue: 100 },
  { index: 16, name: 'Cologne', type: 'property', color: 'orange', price: 180, rent: [14, 28, 70, 200, 550, 750, 950], housePrice: 100, mortgageValue: 90 },
  { index: 17, name: 'Community Chest', type: 'chest' },
  { index: 18, name: 'Frankfurt', type: 'property', color: 'orange', price: 180, rent: [14, 28, 70, 200, 550, 750, 950], housePrice: 100, mortgageValue: 90 },
  { index: 19, name: 'Berlin', type: 'property', color: 'orange', price: 200, rent: [16, 32, 80, 220, 600, 800, 1000], housePrice: 100, mortgageValue: 100 },
  { index: 20, name: 'Free Parking', type: 'parking' },
  { index: 21, name: 'Chengdu', type: 'property', color: 'red', price: 220, rent: [18, 36, 90, 250, 700, 875, 1050], housePrice: 150, mortgageValue: 110 },
  { index: 22, name: 'Chance', type: 'chance' },
  { index: 23, name: 'Beijing', type: 'property', color: 'red', price: 220, rent: [18, 36, 90, 250, 700, 875, 1050], housePrice: 150, mortgageValue: 110 },
  { index: 24, name: 'Shanghai', type: 'property', color: 'red', price: 240, rent: [20, 40, 100, 300, 750, 925, 1100], housePrice: 150, mortgageValue: 120 },
  { index: 25, name: 'Eurostar', type: 'railroad', price: 200, rent: [25, 50, 100, 200], mortgageValue: 100 },
  { index: 26, name: 'Naples', type: 'property', color: 'yellow', price: 260, rent: [22, 44, 110, 330, 800, 975, 1150], housePrice: 150, mortgageValue: 130 },
  { index: 27, name: 'Florence', type: 'property', color: 'yellow', price: 260, rent: [22, 44, 110, 330, 800, 975, 1150], housePrice: 150, mortgageValue: 130 },
  { index: 28, name: 'Hawaii', type: 'utility', price: 150, rent: [4, 10], mortgageValue: 75 },
  { index: 29, name: 'Rome', type: 'property', color: 'yellow', price: 280, rent: [24, 48, 120, 360, 850, 1025, 1200], housePrice: 150, mortgageValue: 140 },
  { index: 30, name: 'Go To Jail', type: 'gotojail' },
  { index: 31, name: 'Fukuoka', type: 'property', color: 'green', price: 300, rent: [26, 52, 130, 390, 900, 1100, 1275], housePrice: 200, mortgageValue: 150 },
  { index: 32, name: 'Osaka', type: 'property', color: 'green', price: 300, rent: [26, 52, 130, 390, 900, 1100, 1275], housePrice: 200, mortgageValue: 150 },
  { index: 33, name: 'Community Chest', type: 'chest' },
  { index: 34, name: 'Tokyo', type: 'property', color: 'green', price: 320, rent: [28, 56, 150, 450, 1000, 1200, 1400], housePrice: 200, mortgageValue: 160 },
  { index: 35, name: 'Shinkansen', type: 'railroad', price: 200, rent: [25, 50, 100, 200], mortgageValue: 100 },
  { index: 36, name: 'Chance', type: 'chance' },
  { index: 37, name: 'Los Angeles', type: 'property', color: 'darkblue', price: 350, rent: [35, 70, 175, 500, 1100, 1300, 1500], housePrice: 200, mortgageValue: 175 },
  { index: 38, name: 'Luxury Tax', type: 'tax', price: 100 },
  { index: 39, name: 'New York City', type: 'property', color: 'darkblue', price: 400, rent: [50, 100, 200, 600, 1400, 1700, 2000], housePrice: 200, mortgageValue: 200 },
];

export function createInitialBoard(): TileState[] {
  return BOARD_TILES.map((t) => ({
    ...t,
    rent: t.rent ? [...t.rent] : undefined,
    owner: null,
    houses: 0,
    mortgaged: false,
    festivalTurns: 0,
    festivalJustActivated: false,
  }));
}

export function getDisplayTileName(tile: Pick<TileState, 'name' | 'type'>, isGetRich: boolean): string {
  if (!isGetRich) return tile.name;
  if (tile.type === 'parking') return 'Airport';
  if (tile.type === 'gotojail') return 'Festival';
  if (tile.type === 'tax') return 'Casino';
  return tile.name;
}
