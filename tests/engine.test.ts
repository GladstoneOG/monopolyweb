// tests/engine.test.ts
import { describe, expect, it } from 'vitest';
import {
  AIRPORT_TILE_INDEX,
  applyMonopolyAction,
  calculateTileRent,
  createLobbyRoom,
  createPlayer,
  FESTIVAL_TILE_INDEX,
  getNextBotAction,
  getPropertyRentSchedule,
  resolveScheduledEffect,
  startGame,
  type RngSource,
  type RoomState,
} from '../src/engine';
import { DEFAULT_AVATAR } from '../src/components/shared/AvatarCreator';

function makeSeededRng(values: number[]): RngSource {
  let i = 0;
  return {
    next: () => {
      const v = values[i % values.length];
      i += 1;
      return v;
    },
  };
}

function makePlayingRoom(ruleset: 'Classic' | 'Get Rich' = 'Get Rich', startingCash = 1500): RoomState {
  const lobby = createLobbyRoom({
    code: 'TEST',
    host: { id: 'p1', name: 'Alice', avatar: DEFAULT_AVATAR },
    rules: { ruleset, startingCash, turnLimit: 0 },
  });
  lobby.players.push(
    createPlayer({
      id: 'p2',
      name: 'Bob',
      avatar: DEFAULT_AVATAR,
      isHost: false,
      startingCash,
    })
  );
  const started = startGame(lobby, makeSeededRng([0.3, 0.7, 0.1, 0.9]));
  return started.state;
}

describe('Monopoly & Get Rich Engine — Bug Fixes & Ruleset Verification', () => {
  it('Bug #1: calculates exact rent for base, monopoly, 1-4 houses, and hotel (rent[6])', () => {
    const room = makePlayingRoom('Classic');
    const nyc = room.board[39]; // New York City: [50, 100, 200, 600, 1400, 1700, 2000]
    const la = room.board[37];
    nyc.owner = 'p1';

    expect(getPropertyRentSchedule(nyc)).toEqual({
      base: 50,
      monopoly: 100,
      houses: [200, 600, 1400, 1700],
      hotel: 2000,
    });

    // Single unimproved
    expect(calculateTileRent(nyc, room.board, 7)).toBe(50);

    // Monopoly unimproved
    la.owner = 'p1';
    expect(calculateTileRent(nyc, room.board, 7)).toBe(100);

    // 1..4 houses & Hotel (5)
    nyc.houses = 1;
    expect(calculateTileRent(nyc, room.board, 7)).toBe(200);
    nyc.houses = 2;
    expect(calculateTileRent(nyc, room.board, 7)).toBe(600);
    nyc.houses = 3;
    expect(calculateTileRent(nyc, room.board, 7)).toBe(1400);
    nyc.houses = 4;
    expect(calculateTileRent(nyc, room.board, 7)).toBe(1700);
    nyc.houses = 5;
    expect(calculateTileRent(nyc, room.board, 7)).toBe(2000);

    // Festival x2 multiplier
    nyc.festivalTurns = 3;
    expect(calculateTileRent(nyc, room.board, 7)).toBe(4000);
  });

  it('Bug #2: allows non-turn property OWNER to use/decline Angel Card against Force Acquisition', () => {
    const room = makePlayingRoom('Get Rich', 2000);
    // p2 owns Bandung (index 1, price 60) and holds an Angel Card
    room.board[1].owner = 'p2';
    room.players[1].angelCards = 1;
    room.players[0].position = 0;
    room.nextForcedRoll = [1, 0]; // force via teleport + direct landing via roll [1, 1] -> pos 2; instead put p1 at 39 and roll [1, 1] -> pos 1!
    room.players[0].position = 39;
    room.nextForcedRoll = [1, 1];

    const rollRes = applyMonopolyAction(room, 'p1', 'roll-dice');
    expect(rollRes.scheduledEffect?.type).toBe('resolve-roll');

    const landed = resolveScheduledEffect(
      rollRes.state,
      'resolve-roll',
      rollRes.scheduledEffect!.token
    );
    expect(landed.state.phase).toBe('use_angel_force');
    expect(landed.state.pendingForceAcquire?.byId).toBe('p1');

    // Active player p1 MUST NOT be able to trigger p2's Angel Card
    const spoofed = applyMonopolyAction(landed.state, 'p1', 'use-angel-force');
    expect(spoofed.changed).toBe(false);

    // Non-turn owner p2 CAN block force acquisition!
    const blocked = applyMonopolyAction(landed.state, 'p2', 'use-angel-force');
    expect(blocked.changed).toBe(true);
    expect(blocked.state.players[1].angelCards).toBe(0);
    expect(blocked.state.board[1].owner).toBe('p2');
    expect(blocked.state.pendingForceAcquire).toBeNull();
  });

  it('Bug #3 & #7: allows Get Rich hotel trading and non-turn receiver trade counter-offers while rejecting negative inputs', () => {
    const room = makePlayingRoom('Get Rich', 2000);
    room.board[1].owner = 'p1';
    room.board[1].houses = 5; // Hotel on Bandung
    room.board[3].owner = 'p2';
    room.phase = 'end_turn';

    // Reject negative cash exploit
    const bad = applyMonopolyAction(room, 'p1', 'trade-propose', {
      receiverId: 'p2',
      senderProperties: [1],
      senderMoney: -500,
      receiverProperties: [],
      receiverMoney: 0,
      senderJailCards: 0,
      receiverJailCards: 0,
    });
    expect(bad.changed).toBe(false);

    // Propose trade with a Hotel in Get Rich mode (must succeed!)
    const proposed = applyMonopolyAction(room, 'p1', 'trade-propose', {
      receiverId: 'p2',
      senderProperties: [1],
      senderMoney: 0,
      receiverProperties: [3],
      receiverMoney: 100,
      senderJailCards: 0,
      receiverJailCards: 0,
    });
    expect(proposed.changed).toBe(true);
    expect(proposed.state.activeTrade?.status).toBe('pending');

    // Receiver p2 enters counter-offer mode and submits a counter-offer on p1's turn!
    const countering = applyMonopolyAction(proposed.state, 'p2', 'trade-counter');
    expect(countering.changed).toBe(true);
    expect(countering.state.activeTrade?.status).toBe('countering');

    const counterProposed = applyMonopolyAction(countering.state, 'p2', 'trade-propose', {
      receiverId: 'p1',
      senderProperties: [3],
      senderMoney: 50,
      receiverProperties: [1],
      receiverMoney: 0,
      senderJailCards: 0,
      receiverJailCards: 0,
    });
    expect(counterProposed.changed).toBe(true);
    expect(counterProposed.state.activeTrade?.senderId).toBe('p2');
    expect(counterProposed.state.activeTrade?.receiverId).toBe('p1');

    // p1 accepts p2's counter-offer
    const accepted = applyMonopolyAction(counterProposed.state, 'p1', 'trade-accept');
    expect(accepted.changed).toBe(true);
    expect(accepted.state.board[1].owner).toBe('p2');
    expect(accepted.state.board[3].owner).toBe('p1');
    expect(accepted.state.players[0].money).toBe(2050);
    expect(accepted.state.players[1].money).toBe(1950);
  });

  it('Bug #4: bankruptcy transfers actual remaining cash to creditor and checks Get Rich instant win', () => {
    const room = makePlayingRoom('Get Rich', 1500);
    // Add 3rd player so bankruptcy doesn't end solely via last-standing
    room.players.push(
      createPlayer({ id: 'p3', name: 'Cara', avatar: DEFAULT_AVATAR, isHost: false, startingCash: 1500 })
    );

    // p2 owns 5 of 6 tourism spots; p1 owns the 6th (Bali, index 12) and has $85 cash
    for (const idx of [5, 15, 25, 28, 35]) {
      room.board[idx].owner = 'p2';
    }
    room.board[12].owner = 'p1';
    room.players[0].money = 85;
    room.players[1].money = 500;
    room.phase = 'bankrupt_decision';
    room.activeDebt = { from: 'p1', to: 'p2', amountValue: 400 };

    const res = applyMonopolyAction(room, 'p1', 'declare-bankruptcy');
    expect(res.changed).toBe(true);
    // p2 MUST receive p1's $85 remaining cash!
    expect(res.state.players[1].money).toBe(585);
    // p2 now owns all 6 tourism spots -> instant Tourism Win!
    expect(res.state.gameState).toBe('gameover');
    expect(res.state.winReason).toContain('Tourism Win');
    expect(res.state.players[1].finishRank).toBe(1);
  });

  it('Bug #5: Classic mode initial decks exclude Get Rich exclusive cards', () => {
    const room = makePlayingRoom('Classic');
    expect(room.chanceDeck.some((c) => c.getRichOnly)).toBe(false);
    expect(room.chestDeck.some((c) => c.getRichOnly)).toBe(false);
  });

  it('Bug #6: Get Rich sell-house works independently even if opponent has more houses in same color', () => {
    const room = makePlayingRoom('Get Rich');
    room.board[1].owner = 'p1';
    room.board[1].houses = 2;
    room.board[3].owner = 'p2';
    room.board[3].houses = 4;
    room.phase = 'end_turn';

    const res = applyMonopolyAction(room, 'p1', 'sell-house', 1);
    expect(res.changed).toBe(true);
    expect(res.state.board[1].houses).toBe(1);
  });

  it('Bug #8 & #9: Tile 20 = Airport (cannot fly to itself), Tile 30 = Festival (lasts 3 FULL turns)', () => {
    const room = makePlayingRoom('Get Rich', 1500);
    room.board[1].owner = 'p1';
    room.players[0].position = 16;
    room.nextForcedRoll = [2, 2]; // lands on 20 (Airport)

    // Roll to Tile 20 -> Airport!
    const r1 = applyMonopolyAction(room, 'p1', 'roll-dice');
    const l1 = resolveScheduledEffect(r1.state, 'resolve-roll', r1.scheduledEffect!.token);
    expect(l1.state.phase).toBe('airport_selection');

    // Cannot fly to Airport tile itself (20)
    const badFly = applyMonopolyAction(l1.state, 'p1', 'airport-fly', {
      targetIndex: AIRPORT_TILE_INDEX,
    });
    expect(badFly.changed).toBe(false);

    // Fly to Tile 30 (Festival!)
    const fly = applyMonopolyAction(l1.state, 'p1', 'airport-fly', {
      targetIndex: FESTIVAL_TILE_INDEX,
    });
    expect(fly.changed).toBe(true);
    expect(fly.state.players[0].position).toBe(30);
    expect(fly.state.players[0].money).toBe(1400);
    expect(fly.state.phase).toBe('festival_selection');

    // Select Bandung (tile 1) for Festival boost
    const fest = applyMonopolyAction(fly.state, 'p1', 'festival-select', 1);
    expect(fest.state.board[1].festivalTurns).toBe(3);

    // End p1's turn (clear doubles first for test clarity)
    fest.state.players[0].doublesRolled = false;
    fest.state.phase = 'end_turn';
    const ended = applyMonopolyAction(fest.state, 'p1', 'end-turn');
    // MUST still be 3 after ending the activation turn!
    expect(ended.state.board[1].festivalTurns).toBe(3);
  });

  it('Bug #10: Casino loss & Round 3 jackpot hold visibly before transitioning', () => {
    const room = makePlayingRoom('Get Rich', 1500);
    room.players[0].position = 0;
    room.nextForcedRoll = [1, 3]; // lands on tile 4 (Casino)

    const roll = applyMonopolyAction(room, 'p1', 'roll-dice');
    const landed = resolveScheduledEffect(roll.state, 'resolve-roll', roll.scheduledEffect!.token);
    expect(landed.state.phase).toBe('casino_flip');

    // Force a losing flip (rng < 0.5)
    const flip = applyMonopolyAction(landed.state, 'p1', 'casino-flip', undefined, makeSeededRng([0.1]));
    expect(flip.scheduledEffect?.type).toBe('resolve-casino-flip');

    const resolved = resolveScheduledEffect(
      flip.state,
      'resolve-casino-flip',
      flip.scheduledEffect!.token
    );
    // Must stay in casino_result_hold with status 'lost' so clients animate the landed coin!
    expect(resolved.state.phase).toBe('casino_result_hold');
    expect(resolved.state.casinoState?.status).toBe('lost');
    expect(resolved.scheduledEffect?.type).toBe('finish-casino-hold');

    const afterHold = resolveScheduledEffect(
      resolved.state,
      'finish-casino-hold',
      resolved.scheduledEffect!.token
    );
    expect(afterHold.state.casinoState).toBeNull();
    expect(afterHold.state.players[0].money).toBe(1300);
    expect(afterHold.state.phase).toBe('end_turn');
  });

  it('Bug #11: rolling doubles onto Go To Jail clears doublesRolled (no phantom extra roll)', () => {
    const room = makePlayingRoom('Classic');
    room.players[0].position = 24;
    room.nextForcedRoll = [3, 3]; // lands on 30 (Go To Jail) with doubles

    const roll = applyMonopolyAction(room, 'p1', 'roll-dice');
    const landed = resolveScheduledEffect(roll.state, 'resolve-roll', roll.scheduledEffect!.token);
    expect(landed.state.players[0].inJail).toBe(true);
    expect(landed.state.players[0].doublesRolled).toBe(false);
    expect(landed.state.turnIndex).toBe(1); // turn passed to p2
  });

  it('Bug #12: landed-build rejects negative count and wrong tileIndex', () => {
    const room = makePlayingRoom('Get Rich');
    room.board[1].owner = 'p1';
    room.board[3].owner = 'p1';
    room.players[0].position = 1;
    room.phase = 'landed_build';

    expect(
      applyMonopolyAction(room, 'p1', 'landed-build', { tileIndex: 1, count: -2 }).changed
    ).toBe(false);
    expect(
      applyMonopolyAction(room, 'p1', 'landed-build', { tileIndex: 3, count: 1 }).changed
    ).toBe(false);
    expect(
      applyMonopolyAction(room, 'p1', 'landed-build', { tileIndex: 1, count: 2 }).changed
    ).toBe(true);
  });

  it('Bug #13: Classic bot sells houses from highest-built property first without deadlocking', () => {
    const room = makePlayingRoom('Classic');
    room.players[0].isBot = true;
    room.players[0].money = 10;
    room.board[1].owner = 'p1';
    room.board[1].houses = 1;
    room.board[3].owner = 'p1';
    room.board[3].houses = 2; // Higher than tile 1 — must sell from tile 3 first!
    room.phase = 'bankrupt_decision';
    room.activeDebt = { from: 'p1', to: 'bank', amountValue: 30 };

    const botDecision = getNextBotAction(room);
    expect(botDecision).toEqual({
      actorId: 'p1',
      action: 'sell-house',
      payload: 3,
    });

    // Applying the decision succeeds cleanly!
    const applied = applyMonopolyAction(room, 'p1', botDecision!.action, botDecision!.payload);
    expect(applied.changed).toBe(true);
    expect(applied.state.board[3].houses).toBe(1);
    expect(applied.state.activeDebt).toBeNull();
  });
});
