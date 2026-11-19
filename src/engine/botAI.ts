// src/engine/botAI.ts
import { AIRPORT_TILE_INDEX, BOARD_LINES, PROPERTY_COLORS } from './boardData';
import { calculateForceAcquireWorth, calculateTileRent, ownsMonopoly } from './rent';
import type {
  MonopolyActionType,
  PlayerState,
  RoomState,
  TileState,
  TradeOffer,
} from './types';

export interface BotDecision {
  actorId: string;
  action: MonopolyActionType;
  payload?: unknown;
}

/**
 * Determines if a Bot currently needs to act (covering active turn, auction bidding,
 * Angel Card force-acquire defense, and incoming trade evaluation).
 */
export function getNextBotAction(state: RoomState): BotDecision | null {
  if (state.gameState !== 'playing') return null;
  if (state.phase === 'rolling_animation' || state.phase === 'casino_result_hold') {
    return null;
  }

  // 1. Incoming pending trade directed to a bot
  if (state.activeTrade && state.activeTrade.status === 'pending') {
    const receiver = state.players.find((p) => p.id === state.activeTrade!.receiverId);
    if (receiver?.isBot && !receiver.bankrupt) {
      const accept = evaluateBotTrade(receiver, state.board, state.activeTrade);
      return {
        actorId: receiver.id,
        action: accept ? 'trade-accept' : 'trade-decline',
      };
    }
    return null; // Wait for human trade decision
  }

  // 2. Angel Card force-acquire defense by a non-turn bot owner
  if (state.phase === 'use_angel_force' && state.pendingForceAcquire) {
    const tile = state.board[state.pendingForceAcquire.tileIndex];
    const owner = tile?.owner ? state.players.find((p) => p.id === tile.owner) : null;
    if (owner?.isBot && !owner.bankrupt) {
      return {
        actorId: owner.id,
        action: owner.angelCards > 0 ? 'use-angel-force' : 'decline-angel-force',
      };
    }
    return null;
  }

  // 3. Auction bidder turn
  if (state.phase === 'auction' && state.auctionState) {
    const bidderId = state.auctionState.bidders[state.auctionState.activeBidderIndex];
    const bidder = state.players.find((p) => p.id === bidderId);
    if (!bidder?.isBot || bidder.bankrupt) return null;
    const dec = decideAuctionAction(bidder, state);
    return { actorId: bidder.id, ...dec };
  }

  // 4. Active turn player is a bot
  const active = state.players[state.turnIndex];
  if (!active?.isBot || active.bankrupt) return null;

  const isGetRich = state.rules.ruleset === 'Get Rich';
  const landedTile = state.board[active.position];

  switch (state.phase) {
    case 'roll': {
      if (active.inJail) {
        if (active.getOutOfJailCards > 0) return { actorId: active.id, action: 'use-jail-card' };
        if (active.money > 450) return { actorId: active.id, action: 'pay-jail-fine' };
        return { actorId: active.id, action: 'roll-jail-doubles' };
      }

      if (isGetRich) {
        const { power, oddEvenChoice } = chooseGetRichRollStrategy(active, state.board);
        return {
          actorId: active.id,
          action: 'roll-dice',
          payload: { power, oddEvenChoice },
        };
      }
      return { actorId: active.id, action: 'roll-dice' };
    }

    case 'action': {
      if (landedTile && landedTile.owner === null && landedTile.price) {
        if (active.money - landedTile.price >= 120) {
          return { actorId: active.id, action: 'buy-property' };
        }
      }
      return { actorId: active.id, action: 'pass-property' };
    }

    case 'card_drawn':
      return { actorId: active.id, action: 'ok-card' };

    case 'casino_flip':
      return { actorId: active.id, action: 'casino-flip' };

    case 'casino_collect_or_push': {
      const round = state.casinoState?.round ?? 1;
      if (round === 1 && active.money >= 600) {
        return { actorId: active.id, action: 'casino-push' };
      }
      return { actorId: active.id, action: 'casino-collect' };
    }

    case 'go_build_select': {
      const buildable = state.board
        .filter(
          (t) =>
            t.owner === active.id &&
            t.type === 'property' &&
            !t.mortgaged &&
            t.houses < 5 &&
            active.money >= (t.housePrice ?? 50) + 100
        )
        .sort((a, b) => (b.price ?? 0) - (a.price ?? 0));
      if (buildable.length > 0) {
        return { actorId: active.id, action: 'go-build', payload: buildable[0].index };
      }
      return { actorId: active.id, action: 'go-build-skip' };
    }

    case 'festival_selection': {
      const owned = state.board.filter(
        (t) =>
          (t.type === 'property' || t.type === 'railroad' || t.type === 'utility') &&
          t.owner === active.id &&
          !t.mortgaged
      );
      if (owned.length > 0) {
        owned.sort(
          (a, b) =>
            calculateTileRent(b, state.board, 7) - calculateTileRent(a, state.board, 7)
        );
        return { actorId: active.id, action: 'festival-select', payload: owned[0].index };
      }
      return { actorId: active.id, action: 'festival-skip' };
    }

    case 'airport_selection': {
      if (active.money >= 100) {
        const unowned = state.board
          .filter(
            (t) =>
              t.index !== AIRPORT_TILE_INDEX &&
              t.owner === null &&
              t.price &&
              t.price <= active.money - 150
          )
          .sort((a, b) => (b.price ?? 0) - (a.price ?? 0));
        if (unowned.length > 0) {
          return {
            actorId: active.id,
            action: 'airport-fly',
            payload: { targetIndex: unowned[0].index },
          };
        }
        // Otherwise fly to own upgradable street if rich
        const ownUpgradable = state.board
          .filter(
            (t) =>
              t.type === 'property' &&
              t.owner === active.id &&
              !t.mortgaged &&
              t.houses < 5 &&
              active.money >= 100 + (t.housePrice ?? 50) + 150
          )
          .sort((a, b) => (b.price ?? 0) - (a.price ?? 0));
        if (ownUpgradable.length > 0) {
          return {
            actorId: active.id,
            action: 'airport-fly',
            payload: { targetIndex: ownUpgradable[0].index },
          };
        }
      }
      return { actorId: active.id, action: 'airport-skip' };
    }

    case 'use_angel_rent': {
      const rent = state.pendingRent?.amount ?? 0;
      if (active.angelCards > 0 && (rent >= 120 || active.money - rent < 250)) {
        return { actorId: active.id, action: 'use-angel-rent' };
      }
      return { actorId: active.id, action: 'decline-angel-rent' };
    }

    case 'force_acquire_decision': {
      const fa = state.pendingForceAcquire;
      if (fa && active.money - fa.worth >= 150) {
        return { actorId: active.id, action: 'force-acquire' };
      }
      return { actorId: active.id, action: 'decline-force-acquire' };
    }

    case 'landed_build': {
      if (landedTile && landedTile.owner === active.id && landedTile.type === 'property') {
        const maxH = state.landedBuildMaxHouses;
        const canAdd = maxH - landedTile.houses;
        const unitCost = landedTile.housePrice ?? 50;
        const affordable = Math.floor((active.money - 200) / unitCost);
        const count = Math.min(canAdd, affordable);
        if (count > 0) {
          return {
            actorId: active.id,
            action: 'landed-build',
            payload: { tileIndex: landedTile.index, count },
          };
        }
      }
      return { actorId: active.id, action: 'landed-build-done' };
    }

    case 'bankrupt_decision': {
      return { actorId: active.id, ...decideDebtLiquidation(active, state) };
    }

    case 'end_turn': {
      if (!isGetRich) {
        const buildTarget = findClassicBuildTarget(active, state.board);
        if (buildTarget !== null) {
          return { actorId: active.id, action: 'build-house', payload: buildTarget };
        }
      }
      return { actorId: active.id, action: 'end-turn' };
    }

    default:
      return null;
  }
}

/**
 * Bug Fix #13: Always sell from the HIGHEST-built property in a color group first
 * so Classic mode's even-selling rule NEVER deadlocks the bot!
 */
function decideDebtLiquidation(
  bot: PlayerState,
  state: RoomState
): { action: MonopolyActionType; payload?: unknown } {
  const isGetRich = state.rules.ruleset === 'Get Rich';
  const owned = state.board.filter((t) => t.owner === bot.id);

  const withHouses = owned
    .filter((t) => t.type === 'property' && t.houses > 0)
    .sort((a, b) => b.houses - a.houses || (a.housePrice ?? 0) - (b.housePrice ?? 0));

  for (const tile of withHouses) {
    if (isGetRich) {
      return { action: 'sell-house', payload: tile.index };
    }
    const group = state.board.filter(
      (t) => t.type === 'property' && t.color === tile.color
    );
    if (group.every((t) => t.houses <= tile.houses)) {
      return { action: 'sell-house', payload: tile.index };
    }
  }

  const unmortgaged = owned
    .filter((t) => !t.mortgaged && t.mortgageValue)
    .sort((a, b) => (a.mortgageValue ?? 0) - (b.mortgageValue ?? 0));

  for (const tile of unmortgaged) {
    if (tile.type !== 'property') {
      return { action: 'mortgage-property', payload: tile.index };
    }
    if (isGetRich) {
      if (tile.houses === 0) {
        return { action: 'mortgage-property', payload: tile.index };
      }
    } else {
      const group = state.board.filter(
        (t) => t.type === 'property' && t.color === tile.color
      );
      if (group.every((t) => t.houses === 0)) {
        return { action: 'mortgage-property', payload: tile.index };
      }
    }
  }

  return { action: 'declare-bankruptcy' };
}

function findClassicBuildTarget(bot: PlayerState, board: readonly TileState[]): number | null {
  for (const color of PROPERTY_COLORS) {
    if (!ownsMonopoly(board, color, bot.id)) continue;
    const group = board.filter((t) => t.type === 'property' && t.color === color);
    if (group.some((t) => t.mortgaged)) continue;

    const sorted = [...group].sort((a, b) => a.houses - b.houses);
    const target = sorted[0];
    if (
      target &&
      target.houses < 5 &&
      bot.money - (target.housePrice ?? 0) >= 200
    ) {
      return target.index;
    }
  }
  return null;
}

function chooseGetRichRollStrategy(
  bot: PlayerState,
  board: readonly TileState[]
): { power: number; oddEvenChoice: 'odd' | 'even' | null } {
  const scoreRange = (min: number, max: number) => {
    let score = 0;
    for (let s = min; s <= max; s++) {
      const tile = board[(bot.position + s) % 40];
      if (!tile) continue;
      if (tile.owner === null && tile.price && tile.price <= bot.money - 100) {
        score += 3;
      } else if (tile.owner === bot.id && tile.type === 'property' && tile.houses < 5) {
        score += 2;
      } else if (tile.owner && tile.owner !== bot.id && !tile.mortgaged) {
        score -= 4;
      } else if (tile.type === 'parking' || tile.type === 'gotojail') {
        score += 2;
      }
    }
    return score;
  };

  const buckets: Array<{ power: number; score: number }> = [
    { power: 20, score: scoreRange(2, 4) },
    { power: 50, score: scoreRange(5, 8) },
    { power: 85, score: scoreRange(9, 12) },
  ];
  buckets.sort((a, b) => b.score - a.score);
  return { power: buckets[0].power, oddEvenChoice: null };
}

function decideAuctionAction(
  bot: PlayerState,
  state: RoomState
): { action: MonopolyActionType; payload?: unknown } {
  const auction = state.auctionState!;
  const tile = state.board[auction.tileIndex];
  if (!tile) return { action: 'auction-pass' };

  let maxValuation = tile.price ?? 100;
  if (tile.type === 'property' && tile.color) {
    const group = state.board.filter((t) => t.type === 'property' && t.color === tile.color);
    const selfCount = group.filter((t) => t.owner === bot.id).length;
    const otherOwned = group.filter((t) => t.owner !== null && t.owner !== bot.id);
    if (selfCount > 0) {
      maxValuation = Math.floor(maxValuation * (1.2 + selfCount * 0.2));
    } else if (otherOwned.length > 0 && new Set(otherOwned.map((t) => t.owner)).size === 1) {
      maxValuation = Math.floor(maxValuation * 1.15);
    }
  }

  const nextBid = Math.max(10, auction.highestBid + 10);
  if (nextBid <= maxValuation && bot.money - nextBid >= 60) {
    return { action: 'auction-bid', payload: { bid: nextBid } };
  }
  return { action: 'auction-pass' };
}

export function evaluateBotTrade(
  bot: PlayerState,
  board: readonly TileState[],
  offer: TradeOffer
): boolean {
  if (offer.receiverMoney > bot.money) return false;

  let givingValue = offer.receiverMoney + offer.receiverJailCards * 50;
  for (const idx of offer.receiverProperties) {
    const tile = board[idx];
    if (tile) givingValue += valuatePropertyForBot(bot, tile, board, true);
  }

  let receivingValue = offer.senderMoney + offer.senderJailCards * 50;
  for (const idx of offer.senderProperties) {
    const tile = board[idx];
    if (tile) receivingValue += valuatePropertyForBot(bot, tile, board, false);
  }

  if (givingValue <= 0) return receivingValue > 0;
  const ratio = receivingValue / givingValue;
  if (ratio < 0.85) return false;
  if (ratio >= 1.15) return true;
  return ratio >= 0.98;
}

function valuatePropertyForBot(
  bot: PlayerState,
  tile: TileState,
  board: readonly TileState[],
  isGiving: boolean
): number {
  const baseValue = calculateForceAcquireWorth(tile) || 100;
  const tourismOwned = board.filter(
    (t) => (t.type === 'railroad' || t.type === 'utility') && t.owner === bot.id
  ).length;

  let multiplier = 1.0;

  if (tile.type === 'railroad' || tile.type === 'utility') {
    multiplier = isGiving ? 1.5 + tourismOwned * 0.4 : 2.0 + tourismOwned * 0.5;
  } else if (tile.type === 'property' && tile.color) {
    const group = board.filter((t) => t.type === 'property' && t.color === tile.color);
    const owned = group.filter((t) => t.owner === bot.id).length;
    if (isGiving) {
      if (owned === group.length) multiplier = 3.5;
      else if (owned === group.length - 1) multiplier = 2.6;
      else if (owned > 1) multiplier = 1.7;
    } else {
      const nextOwned = owned + 1;
      if (nextOwned === group.length) multiplier = 4.0;
      else if (nextOwned === group.length - 1) multiplier = 2.8;
      else if (nextOwned > 1) multiplier = 1.9;
    }
  }

  const lines = [BOARD_LINES.bottom, BOARD_LINES.left, BOARD_LINES.top, BOARD_LINES.right];
  const line = lines.find((l) => (l as readonly number[]).includes(tile.index));
  if (line) {
    const ownedOnLine = line.filter((idx) => board[idx]?.owner === bot.id).length;
    if (ownedOnLine >= line.length - 2) {
      const lineMult = isGiving ? 2.5 + ownedOnLine * 0.45 : 3.0 + ownedOnLine * 0.55;
      multiplier = Math.max(multiplier, lineMult);
    }
  }

  return baseValue * multiplier;
}
