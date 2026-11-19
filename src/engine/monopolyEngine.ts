// src/engine/monopolyEngine.ts
import {
  AIRPORT_TILE_INDEX,
  createInitialBoard,
  getDisplayTileName,
  JAIL_TILE_INDEX,
} from './boardData';
import { buildDeck, CHANCE_CARDS, CHEST_CARDS } from './cardsData';
import { applyDevCommand } from './devCommands';
import { calculateForceAcquireWorth, calculateTileRent, ownsMonopoly } from './rent';
import {
  detectGetRichSpecialWin,
  refreshAllNetWorths,
} from './winConditions';
import {
  defaultRng,
  type AvatarConfig,
  type EngineEvent,
  type EngineStepResult,
  type GameRules,
  type MonopolyActionType,
  type PlayerState,
  type RngSource,
  type RoomState,
  type ScheduledEffect,
} from './types';

export const DEFAULT_RULES: GameRules = {
  ruleset: 'Get Rich',
  startingCash: 1500,
  turnLimit: 0,
};

export const BOT_NAMES: readonly string[] = [
  'Budi Bot', 'Siti Bot', 'Joko Bot', 'Dewi Bot', 'Agus Bot', 'Sari Bot',
  'Rudi Bot', 'Ani Bot', 'Aris Bot', 'Fitri Bot', 'Mega Bot', 'Putri Bot',
  'Taufik Bot', 'Wulan Bot', 'Hendra Bot', 'Surya Bot', 'Indah Bot', 'Laras Bot',
  'Alex Bot', 'Emma Bot', 'Liam Bot', 'Olivia Bot', 'Noah Bot', 'Sophia Bot',
  'Lucas Bot', 'Mia Bot', 'Ethan Bot', 'Chloe Bot', 'Leo Bot', 'Zoe Bot',
];

export const BOT_AVATARS: readonly AvatarConfig[] = [
  { skinColor: '#FFDBAC', hairStyle: 'spiky', hairColor: '#1A1A1A', expression: 'cool', clothesColor: '#2F855A' },
  { skinColor: '#F1C27D', hairStyle: 'bob', hairColor: '#E5C158', expression: 'smile', clothesColor: '#6B46C1' },
  { skinColor: '#E0AC69', hairStyle: 'short', hairColor: '#B83B1D', expression: 'excited', clothesColor: '#C53030' },
  { skinColor: '#C68642', hairStyle: 'cap', hairColor: '#1D72B8', expression: 'wink', clothesColor: '#2B6CB0' },
];

export function cloneState(state: RoomState): RoomState {
  return structuredClone(state);
}

function makeToken(rng: RngSource): string {
  return Math.floor(rng.next() * 1e12).toString(36);
}

export function createPlayer(params: {
  id: string;
  sessionId?: string;
  name: string;
  avatar: AvatarConfig;
  isHost: boolean;
  isBot?: boolean;
  startingCash?: number;
}): PlayerState {
  const cash = params.startingCash ?? DEFAULT_RULES.startingCash;
  return {
    id: params.id,
    sessionId: params.sessionId,
    name: params.name,
    avatar: params.avatar,
    isHost: params.isHost,
    isReady: params.isHost || Boolean(params.isBot),
    isBot: Boolean(params.isBot),
    disconnected: false,
    money: cash,
    position: 0,
    inJail: false,
    jailTurns: 0,
    getOutOfJailCards: 0,
    oddEvenCards: 0,
    angelCards: 0,
    bankrupt: false,
    lastRoll: [1, 1],
    rollCount: 0,
    doublesRolled: false,
    netWorth: cash,
    score: cash,
    status: null,
  };
}

export function createLobbyRoom(params: {
  code: string;
  host: { id: string; sessionId?: string; name: string; avatar: AvatarConfig };
  rules?: Partial<GameRules>;
}): RoomState {
  const rules: GameRules = {
    ...DEFAULT_RULES,
    ...params.rules,
  };
  return {
    code: params.code.toUpperCase(),
    gameState: 'lobby',
    rules,
    players: [
      createPlayer({
        id: params.host.id,
        sessionId: params.host.sessionId,
        name: params.host.name,
        avatar: params.host.avatar,
        isHost: true,
        startingCash: rules.startingCash,
      }),
    ],
    turnIndex: 0,
    roundNumber: 0,
    turnCount: 0,
    board: createInitialBoard(),
    chanceDeck: [],
    chestDeck: [],
    dice: [1, 1],
    rollId: null,
    phase: 'roll',
    currentCard: null,
    cardType: null,
    activeDebt: null,
    auctionState: null,
    activeTrade: null,
    pendingForceAcquire: null,
    pendingRent: null,
    landedBuildMaxHouses: 4,
    casinoState: null,
    lastActionDetail: null,
    winReason: null,
    nextForcedRoll: null,
    nextForcedCard: null,
    pendingRollResolution: null,
    pendingCasinoToken: null,
  };
}

export function startGame(
  prevState: RoomState,
  rng: RngSource = defaultRng
): EngineStepResult {
  if (prevState.players.length < 2) {
    return { state: prevState, changed: false, events: [] };
  }

  const state = cloneState(prevState);
  const events: EngineEvent[] = [];

  state.gameState = 'playing';
  state.roundNumber += 1;
  state.turnCount = 0;
  state.board = createInitialBoard();
  state.chanceDeck = buildDeck('chance', state.rules.ruleset, rng);
  state.chestDeck = buildDeck('chest', state.rules.ruleset, rng);

  const startCash = Number(state.rules.startingCash) || 1500;
  for (const p of state.players) {
    p.money = startCash;
    p.position = 0;
    p.inJail = false;
    p.jailTurns = 0;
    p.getOutOfJailCards = 0;
    p.oddEvenCards = 0;
    p.angelCards = 0;
    p.bankrupt = false;
    p.lastRoll = [1, 1];
    p.rollCount = 0;
    p.doublesRolled = false;
    p.netWorth = startCash;
    p.score = startCash;
    p.status = null;
    delete p.finishRank;
  }

  state.dice = [1, 1];
  state.rollId = null;
  state.phase = 'roll';
  state.currentCard = null;
  state.cardType = null;
  state.activeDebt = null;
  state.auctionState = null;
  state.activeTrade = null;
  state.pendingForceAcquire = null;
  state.pendingRent = null;
  state.landedBuildMaxHouses = 4;
  state.casinoState = null;
  state.lastActionDetail = null;
  state.winReason = null;
  state.nextForcedRoll = null;
  state.nextForcedCard = null;
  state.pendingRollResolution = null;
  state.pendingCasinoToken = null;
  state.turnIndex = 0;

  const modeLabel = state.rules.ruleset === 'Get Rich' ? 'GET RICH!' : 'Classic Monopoly';
  events.push({
    type: 'system-chat',
    text: `🎩 ${modeLabel} Game Started! Good luck tycoons! 🎲`,
  });

  return { state, changed: true, events };
}

// =====================================================================
// Internal Game Flow Helpers
// =====================================================================

function addChat(events: EngineEvent[], text: string): void {
  events.push({ type: 'system-chat', text });
}

function getNextActiveTurnIndex(state: RoomState): number {
  let idx = state.turnIndex;
  const n = state.players.length;
  for (let i = 0; i < n; i++) {
    idx = (idx + 1) % n;
    if (!state.players[idx].bankrupt) return idx;
  }
  return state.turnIndex;
}

function decrementFestivalForPlayer(state: RoomState, playerId: string): void {
  for (const tile of state.board) {
    if (tile.owner === playerId && tile.festivalTurns > 0) {
      if (tile.festivalJustActivated) {
        // Bug Fix #9: Do not decrement on the same turn Festival was activated
        tile.festivalJustActivated = false;
      } else {
        tile.festivalTurns -= 1;
      }
    }
  }
}

function finalizeRankingsAndGameOver(
  state: RoomState,
  winnerId: string,
  reason: string,
  events: EngineEvent[]
): void {
  refreshAllNetWorths(state.players, state.board);
  state.gameState = 'gameover';
  state.winReason = reason;
  state.pendingRollResolution = null;
  state.pendingCasinoToken = null;

  const others = state.players
    .filter((p) => p.id !== winnerId)
    .sort((a, b) => {
      if (a.bankrupt && !b.bankrupt) return 1;
      if (!a.bankrupt && b.bankrupt) return -1;
      return b.netWorth - a.netWorth;
    });

  for (const p of state.players) {
    if (p.id === winnerId) {
      p.finishRank = 1;
    } else {
      p.finishRank = others.findIndex((o) => o.id === p.id) + 2;
    }
    p.score = p.netWorth;
  }

  events.push({ type: 'game-over', winnerId, reason });
}

function checkLastStandingWinner(state: RoomState, events: EngineEvent[]): boolean {
  const active = state.players.filter((p) => !p.bankrupt);
  if (active.length === 1) {
    const winner = active[0];
    const reason = 'Last Tycoon Standing';
    addChat(events, `🏆 ${winner.name} is the last tycoon standing! Victory is theirs!`);
    finalizeRankingsAndGameOver(state, winner.id, reason, events);
    return true;
  }
  return false;
}

function checkSpecialWins(state: RoomState, events: EngineEvent[]): boolean {
  const match = detectGetRichSpecialWin(state);
  if (!match) return false;
  const winner = state.players.find((p) => p.id === match.winnerId);
  if (!winner) return false;
  addChat(
    events,
    `🏆 ${winner.name} achieved an instant victory via ${match.reason}!`
  );
  finalizeRankingsAndGameOver(state, winner.id, match.reason, events);
  return true;
}

function checkTurnLimit(state: RoomState, events: EngineEvent[]): boolean {
  const limit = Number(state.rules.turnLimit) || 0;
  if (limit <= 0 || state.turnCount < limit) return false;

  refreshAllNetWorths(state.players, state.board);
  const active = state.players
    .filter((p) => !p.bankrupt)
    .sort((a, b) => b.netWorth - a.netWorth);
  const winner = active[0];
  if (!winner) return false;

  const reason = `Turn Limit (${limit} Turns) — Highest Net Worth`;
  addChat(events, `⏱️ Turn limit of ${limit} reached!`);
  addChat(events, `🏆 ${winner.name} wins with a net worth of $${winner.netWorth}!`);
  finalizeRankingsAndGameOver(state, winner.id, reason, events);
  return true;
}

function advanceTurnToNextPlayer(state: RoomState, events: EngineEvent[], announce = true): void {
  const endingPlayer = state.players[state.turnIndex];
  if (endingPlayer) {
    endingPlayer.status = null;
    endingPlayer.rollCount = 0;
    endingPlayer.doublesRolled = false;
    decrementFestivalForPlayer(state, endingPlayer.id);
  }

  state.turnCount += 1;
  if (checkTurnLimit(state, events)) {
    return;
  }

  state.turnIndex = getNextActiveTurnIndex(state);
  state.phase = 'roll';
  const nextPlayer = state.players[state.turnIndex];
  if (nextPlayer) {
    nextPlayer.rollCount = 0;
    nextPlayer.doublesRolled = false;
    if (announce) {
      addChat(events, `Turn passed to ${nextPlayer.name}.`);
    }
  }
}

function setEndTurnPhase(state: RoomState, player: PlayerState, events: EngineEvent[]): void {
  if (player.inJail) {
    // Jail ends turn immediately and counts as a turn
    advanceTurnToNextPlayer(state, events, false);
    return;
  }

  if (player.doublesRolled && !player.bankrupt) {
    player.doublesRolled = false;
    state.phase = 'roll';
    addChat(events, `🎲 Doubles! ${player.name} gets to roll again.`);
  } else {
    state.phase = 'end_turn';
  }
}

function sendPlayerToJail(state: RoomState, player: PlayerState, events: EngineEvent[]): void {
  player.position = JAIL_TILE_INDEX;
  player.inJail = true;
  player.jailTurns = 0;
  player.rollCount = 0;
  player.doublesRolled = false; // Bug Fix #11
  addChat(events, `👮 ${player.name} was sent directly to Jail!`);
  setEndTurnPhase(state, player, events);
}

function triggerPayment(
  state: RoomState,
  player: PlayerState,
  recipient: PlayerState | null,
  amount: number,
  events: EngineEvent[],
  pendingLandingDiceSum?: number
): void {
  if (player.money >= amount) {
    player.money -= amount;
    if (recipient) {
      recipient.money += amount;
      addChat(events, `${player.name} paid $${amount} rent to ${recipient.name}.`);
    } else {
      addChat(events, `${player.name} paid $${amount} to the bank.`);
    }
    refreshAllNetWorths(state.players, state.board);

    if (pendingLandingDiceSum !== undefined) {
      handleLandedAction(state, player, pendingLandingDiceSum, events, false);
    } else {
      setEndTurnPhase(state, player, events);
    }
  } else {
    state.activeDebt = {
      from: player.id,
      to: recipient ? recipient.id : 'bank',
      amountValue: amount,
      pendingLandingDiceSum,
    };
    state.phase = 'bankrupt_decision';
    addChat(
      events,
      `🚨 ${player.name} is in debt! Needs to raise $${amount - player.money} to pay $${amount}.`
    );
  }
}

function maybeTriggerForceAcquire(
  state: RoomState,
  player: PlayerState,
  owner: PlayerState,
  tileIndex: number
): void {
  if (state.rules.ruleset !== 'Get Rich') return;
  if (state.phase === 'bankrupt_decision') return;

  const tile = state.board[tileIndex];
  // Only street properties can be force-acquired; Hotels (5), Railroads, Utilities are protected
  if (!tile || tile.type !== 'property' || tile.houses >= 5) return;

  const worth = calculateForceAcquireWorth(tile);
  if (player.money < worth) return;

  state.pendingForceAcquire = {
    byId: player.id,
    tileIndex: tile.index,
    worth,
  };
  if (owner.angelCards > 0) {
    state.phase = 'use_angel_force';
  } else {
    state.phase = 'force_acquire_decision';
  }
}

function drawCard(
  state: RoomState,
  player: PlayerState,
  type: 'chance' | 'chest',
  events: EngineEvent[],
  rng: RngSource
): void {
  const isGetRich = state.rules.ruleset === 'Get Rich';
  const source = type === 'chance' ? CHANCE_CARDS : CHEST_CARDS;
  const eligible = isGetRich ? source : source.filter((c) => !c.getRichOnly);

  let card = null;
  if (state.nextForcedCard && state.nextForcedCard.type === type) {
    const query = state.nextForcedCard.cardActionOrId.toLowerCase();
    const matched = eligible.find(
      (c) => c.id.toLowerCase() === query || c.action.toLowerCase() === query
    );
    if (matched) {
      card = matched;
      addChat(events, `Dev Console: Forced next ${type} card.`);
    }
    state.nextForcedCard = null;
  }

  if (!card) {
    let deck = type === 'chance' ? state.chanceDeck : state.chestDeck;
    if (deck.length === 0) {
      deck = buildDeck(type, state.rules.ruleset, rng);
      if (type === 'chance') state.chanceDeck = deck;
      else state.chestDeck = deck;
    }
    card = deck.pop() ?? eligible[0];
  }

  state.currentCard = card;
  state.cardType = type;
  state.phase = 'card_drawn';
  addChat(events, `✉️ ${player.name} drew a ${type.toUpperCase()} card: "${card.text}"`);
}

function handleLandedAction(
  state: RoomState,
  player: PlayerState,
  diceSum: number,
  events: EngineEvent[],
  chanceDoubleMultiplier = false,
  rng: RngSource = defaultRng
): void {
  const tile = state.board[player.position];
  const isGetRich = state.rules.ruleset === 'Get Rich';

  if (tile.type === 'go') {
    if (isGetRich) {
      const ownedProps = state.board.filter(
        (t) =>
          t.type === 'property' &&
          t.owner === player.id &&
          t.houses < 5 &&
          !t.mortgaged
      );
      if (ownedProps.length > 0) {
        addChat(
          events,
          `🎯 ${player.name} landed exactly on GO and can build once on any owned property!`
        );
        state.phase = 'go_build_select';
        return;
      }
    }
    setEndTurnPhase(state, player, events);
    return;
  }

  if (tile.type === 'property' || tile.type === 'railroad' || tile.type === 'utility') {
    if (tile.owner === null) {
      state.phase = 'action';
      return;
    }
    if (tile.owner === player.id) {
      if (isGetRich && tile.type === 'property' && !tile.mortgaged && tile.houses < 5) {
        state.phase = 'landed_build';
        state.landedBuildMaxHouses = tile.houses === 4 ? 5 : 4;
      } else {
        setEndTurnPhase(state, player, events);
      }
      return;
    }
    if (tile.mortgaged) {
      addChat(
        events,
        `${player.name} landed on ${tile.name} (Mortgaged). No rent paid.`
      );
      setEndTurnPhase(state, player, events);
      return;
    }

    const owner = state.players.find((p) => p.id === tile.owner);
    if (!owner) {
      setEndTurnPhase(state, player, events);
      return;
    }

    const rentAmount = calculateTileRent(tile, state.board, diceSum, chanceDoubleMultiplier);
    addChat(
      events,
      `${player.name} landed on ${tile.name} and owes ${owner.name} $${rentAmount} rent.`
    );

    if (isGetRich && player.angelCards > 0) {
      state.phase = 'use_angel_rent';
      state.pendingRent = {
        fromId: player.id,
        toId: owner.id,
        amount: rentAmount,
      };
      return;
    }

    triggerPayment(state, player, owner, rentAmount, events);
    maybeTriggerForceAcquire(state, player, owner, tile.index);
    return;
  }

  if (tile.type === 'tax') {
    if (isGetRich) {
      state.phase = 'casino_flip';
      state.casinoState = {
        playerId: player.id,
        tileIndex: tile.index,
        round: 1,
        status: 'pending_flip',
        payout: 200,
        result: null,
      };
      addChat(
        events,
        `🎰 ${player.name} landed on Casino and must flip the coin!`
      );
      return;
    }
    const taxAmount = tile.price ?? 100;
    addChat(events, `${player.name} landed on ${tile.name} and owes $${taxAmount}.`);
    triggerPayment(state, player, null, taxAmount, events);
    return;
  }

  if (tile.type === 'jail') {
    setEndTurnPhase(state, player, events);
    return;
  }

  // Bug Fix #8: Follow monopoly_get_rich_rules.md —
  // Tile 20 (parking) = Airport, Tile 30 (gotojail) = Festival!
  if (tile.type === 'parking') {
    if (isGetRich) {
      if (player.money >= 100) {
        addChat(
          events,
          `✈️ ${player.name} landed on the Airport! Pay $100 to fly to any tile.`
        );
        state.phase = 'airport_selection';
      } else {
        addChat(
          events,
          `✈️ ${player.name} landed on the Airport but cannot afford the $100 fare.`
        );
        setEndTurnPhase(state, player, events);
      }
    } else {
      addChat(events, `${player.name} relaxes at Free Parking!`);
      setEndTurnPhase(state, player, events);
    }
    return;
  }

  if (tile.type === 'gotojail') {
    if (isGetRich) {
      const ownedProps = state.board.filter(
        (t) =>
          (t.type === 'property' || t.type === 'railroad' || t.type === 'utility') &&
          t.owner === player.id &&
          !t.mortgaged
      );
      if (ownedProps.length > 0) {
        addChat(
          events,
          `🎉 ${player.name} landed on Festival! Choose a property to double its rent for 3 turns.`
        );
        state.phase = 'festival_selection';
      } else {
        addChat(events, `🎉 ${player.name} landed on Festival! No properties to boost.`);
        setEndTurnPhase(state, player, events);
      }
    } else {
      sendPlayerToJail(state, player, events);
    }
    return;
  }

  if (tile.type === 'chance' || tile.type === 'chest') {
    drawCard(state, player, tile.type, events, rng);
  }
}

function resolveCardAction(
  state: RoomState,
  player: PlayerState,
  diceSum: number,
  events: EngineEvent[],
  rng: RngSource
): void {
  const card = state.currentCard;
  if (!card) return;

  state.currentCard = null;
  state.cardType = null;
  const isGetRich = state.rules.ruleset === 'Get Rich';

  switch (card.action) {
    case 'move': {
      const target = card.target ?? 0;
      const oldPos = player.position;
      player.position = target;
      addChat(
        events,
        `${player.name} moved to ${getDisplayTileName(state.board[target], isGetRich)}.`
      );
      if (player.position < oldPos) {
        player.money += 200;
        addChat(events, `${player.name} passed GO and collected $200!`);
        refreshAllNetWorths(state.players, state.board);
      }
      handleLandedAction(state, player, diceSum, events, false, rng);
      return;
    }

    case 'give_money': {
      const amt = card.amount ?? 0;
      player.money += amt;
      addChat(events, `${player.name} received $${amt}.`);
      refreshAllNetWorths(state.players, state.board);
      setEndTurnPhase(state, player, events);
      return;
    }

    case 'take_money': {
      triggerPayment(state, player, null, card.amount ?? 0, events);
      return;
    }

    case 'jail_free': {
      player.getOutOfJailCards += 1;
      addChat(events, `${player.name} received a Get Out of Jail Free card!`);
      setEndTurnPhase(state, player, events);
      return;
    }

    case 'goto_jail': {
      sendPlayerToJail(state, player, events);
      return;
    }

    case 'back_spaces': {
      const spaces = card.amount ?? 3;
      player.position = (player.position - spaces + 40) % 40;
      addChat(
        events,
        `${player.name} moved back ${spaces} spaces to ${getDisplayTileName(state.board[player.position], isGetRich)}.`
      );
      handleLandedAction(state, player, diceSum, events, false, rng);
      return;
    }

    case 'nearest_railroad': {
      let curr = player.position;
      while (state.board[curr].type !== 'railroad') {
        curr = (curr + 1) % 40;
      }
      const oldPos = player.position;
      player.position = curr;
      addChat(
        events,
        `${player.name} advanced to nearest Transit Line: ${state.board[curr].name}.`
      );
      if (player.position < oldPos) {
        player.money += 200;
        addChat(events, `${player.name} passed GO and collected $200!`);
        refreshAllNetWorths(state.players, state.board);
      }
      handleLandedAction(state, player, diceSum, events, true, rng);
      return;
    }

    case 'nearest_utility': {
      let curr = player.position;
      while (state.board[curr].type !== 'utility') {
        curr = (curr + 1) % 40;
      }
      const oldPos = player.position;
      player.position = curr;
      addChat(
        events,
        `${player.name} advanced to nearest Tourist Spot: ${state.board[curr].name}.`
      );
      if (player.position < oldPos) {
        player.money += 200;
        addChat(events, `${player.name} passed GO and collected $200!`);
        refreshAllNetWorths(state.players, state.board);
      }
      const tile = state.board[curr];
      if (tile.owner !== null && tile.owner !== player.id && !tile.mortgaged) {
        const d1 = Math.floor(rng.next() * 6) + 1;
        const d2 = Math.floor(rng.next() * 6) + 1;
        const sum = d1 + d2;
        state.dice = [d1, d2];
        state.rollId = makeToken(rng);
        addChat(events, `🎲 Rolled ${d1} + ${d2} = ${sum} for 10x Tourist Spot rent.`);
        handleLandedAction(state, player, sum, events, true, rng);
      } else {
        handleLandedAction(state, player, diceSum, events, true, rng);
      }
      return;
    }

    case 'pay_each': {
      const share = card.amount ?? 50;
      const opponents = state.players.filter((p) => !p.bankrupt && p.id !== player.id);
      const totalCost = opponents.length * share;
      if (player.money >= totalCost) {
        player.money -= totalCost;
        for (const opp of opponents) {
          opp.money += share;
        }
        addChat(events, `${player.name} paid $${share} to each player.`);
        refreshAllNetWorths(state.players, state.board);
        setEndTurnPhase(state, player, events);
      } else {
        state.activeDebt = {
          from: player.id,
          to: 'bank',
          amountValue: totalCost,
          payoutPlayers: opponents.map((o) => ({ id: o.id, share })),
        };
        state.phase = 'bankrupt_decision';
        addChat(events, `🚨 ${player.name} needs $${totalCost} to pay other players.`);
      }
      return;
    }

    case 'collect_each': {
      const share = card.amount ?? 10;
      let collected = 0;
      for (const opp of state.players) {
        if (!opp.bankrupt && opp.id !== player.id) {
          const paid = Math.min(opp.money, share);
          opp.money -= paid;
          collected += paid;
        }
      }
      player.money += collected;
      addChat(events, `${player.name} collected $${collected} from other players.`);
      refreshAllNetWorths(state.players, state.board);
      setEndTurnPhase(state, player, events);
      return;
    }

    case 'repairs': {
      let housesCount = 0;
      let hotelsCount = 0;
      for (const t of state.board) {
        if (t.owner === player.id) {
          if (t.houses === 5) hotelsCount += 1;
          else housesCount += t.houses;
        }
      }
      const bill =
        housesCount * (card.houseCost ?? 25) + hotelsCount * (card.hotelCost ?? 100);
      addChat(
        events,
        `${player.name} assessed repairs (${housesCount} houses, ${hotelsCount} hotels): $${bill}.`
      );
      if (bill > 0) {
        triggerPayment(state, player, null, bill, events);
      } else {
        setEndTurnPhase(state, player, events);
      }
      return;
    }

    case 'give_odd_even': {
      player.oddEvenCards = Math.min(player.oddEvenCards + 1, 1);
      addChat(events, `🎯 ${player.name} received an Odd/Even Card!`);
      setEndTurnPhase(state, player, events);
      return;
    }

    case 'give_angel': {
      player.angelCards = Math.min(player.angelCards + 1, 1);
      addChat(events, `😇 ${player.name} received an Angel Card!`);
      setEndTurnPhase(state, player, events);
      return;
    }
  }
}

function trySettleActiveDebt(
  state: RoomState,
  player: PlayerState,
  events: EngineEvent[],
  rng: RngSource
): void {
  if (
    state.phase !== 'bankrupt_decision' ||
    !state.activeDebt ||
    state.activeDebt.from !== player.id
  ) {
    return;
  }

  const debt = state.activeDebt;
  if (player.money < debt.amountValue) return;

  player.money -= debt.amountValue;
  if (debt.to !== 'bank') {
    const creditor = state.players.find((p) => p.id === debt.to);
    if (creditor) {
      creditor.money += debt.amountValue;
      addChat(events, `${player.name} paid $${debt.amountValue} debt to ${creditor.name}.`);
    }
  } else if (debt.payoutPlayers && debt.payoutPlayers.length > 0) {
    for (const payout of debt.payoutPlayers) {
      const recipient = state.players.find((p) => p.id === payout.id);
      if (recipient && !recipient.bankrupt) {
        recipient.money += payout.share;
      }
    }
    addChat(events, `${player.name} settled $${debt.amountValue} in player payouts.`);
  } else {
    addChat(events, `${player.name} paid $${debt.amountValue} debt to the bank.`);
  }

  const pendingLanding = debt.pendingLandingDiceSum;
  state.activeDebt = null;
  refreshAllNetWorths(state.players, state.board);

  // Bug Fix #14: If debt came from 3rd-turn Jail fine, resolve landing now
  if (pendingLanding !== undefined) {
    handleLandedAction(state, player, pendingLanding, events, false, rng);
    return;
  }

  setEndTurnPhase(state, player, events);
}

function handleBankruptcyResolution(
  state: RoomState,
  player: PlayerState,
  events: EngineEvent[]
): void {
  const debt = state.activeDebt;
  if (!debt) return;

  const creditorId = debt.to;
  // Bug Fix #4: Capture remaining cash BEFORE zeroing player.money!
  const remainingCash = Math.max(0, player.money);

  addChat(events, `💀 ${player.name} declared bankruptcy!`);
  player.bankrupt = true;
  player.money = 0;
  player.doublesRolled = false;
  player.rollCount = 0;

  for (const tile of state.board) {
    if (tile.owner === player.id) {
      tile.houses = 0;
      tile.festivalTurns = 0;
      tile.festivalJustActivated = false;
      if (creditorId === 'bank') {
        tile.owner = null;
        tile.mortgaged = false;
        addChat(events, `Property ${tile.name} returned to the bank.`);
      } else {
        tile.owner = creditorId;
        const creditor = state.players.find((p) => p.id === creditorId);
        addChat(
          events,
          `Property ${tile.name} transferred to ${creditor?.name ?? 'creditor'}.`
        );
      }
    }
  }

  if (creditorId !== 'bank') {
    const creditor = state.players.find((p) => p.id === creditorId);
    if (creditor && remainingCash > 0) {
      creditor.money += remainingCash;
      addChat(events, `${creditor.name} received $${remainingCash} remaining cash.`);
    }
  } else if (debt.payoutPlayers && debt.payoutPlayers.length > 0 && remainingCash > 0) {
    // Distribute only actual remaining cash pro-rata (no conjuring money from thin air)
    const eligible = debt.payoutPlayers.filter((p) => {
      const r = state.players.find((pl) => pl.id === p.id);
      return r && !r.bankrupt;
    });
    if (eligible.length > 0) {
      const perPlayer = Math.floor(remainingCash / eligible.length);
      for (const entry of eligible) {
        const recipient = state.players.find((pl) => pl.id === entry.id);
        if (recipient) recipient.money += perPlayer;
      }
    }
  }

  state.activeDebt = null;
  refreshAllNetWorths(state.players, state.board);

  // Check both last-standing AND Get Rich special wins after creditor receives assets!
  if (checkLastStandingWinner(state, events)) return;
  if (checkSpecialWins(state, events)) return;

  advanceTurnToNextPlayer(state, events, true);
}

function startPropertyAuction(state: RoomState, tileIndex: number, events: EngineEvent[]): void {
  const bidders = state.players.filter((p) => !p.bankrupt).map((p) => p.id);
  if (bidders.length === 0) {
    const active = state.players[state.turnIndex];
    if (active) setEndTurnPhase(state, active, events);
    return;
  }

  state.phase = 'auction';
  state.auctionState = {
    tileIndex,
    highestBid: 0,
    highestBidder: null,
    bidders,
    activeBidderIndex: 0,
  };
  const tile = state.board[tileIndex];
  addChat(events, `🔨 Auction started for ${tile.name}! Minimum bid is $10.`);
}

function resumeAfterAuction(state: RoomState, events: EngineEvent[]): void {
  state.auctionState = null;
  const active = state.players[state.turnIndex];
  if (active) {
    setEndTurnPhase(state, active, events);
  }
}

// =====================================================================
// Scheduled Effect Resolution (Dice Animation, Casino Flip, Casino Hold)
// =====================================================================

export function resolveScheduledEffect(
  prevState: RoomState,
  effectType: ScheduledEffect['type'],
  token: string,
  rng: RngSource = defaultRng
): EngineStepResult {
  if (prevState.gameState !== 'playing') {
    return { state: prevState, changed: false, events: [] };
  }

  const state = cloneState(prevState);
  const events: EngineEvent[] = [];

  if (effectType === 'resolve-roll') {
    const pending = state.pendingRollResolution;
    if (!pending || pending.token !== token || state.phase !== 'rolling_animation') {
      return { state: prevState, changed: false, events: [] };
    }
    state.pendingRollResolution = null;

    const player = state.players.find((p) => p.id === pending.playerId);
    if (!player || player.bankrupt) {
      return { state: prevState, changed: false, events: [] };
    }

    const { d1, d2, mode } = pending;
    const sum = d1 + d2;
    const isDoubles = d1 === d2;

    if (mode === 'jail') {
      if (isDoubles) {
        player.inJail = false;
        player.jailTurns = 0;
        addChat(events, `🔓 Doubles rolled! ${player.name} is released from Jail!`);
        const oldPos = player.position;
        player.position = (player.position + sum) % 40;
        if (player.position < oldPos) {
          player.money += 200;
          addChat(events, `${player.name} passed GO and collected $200!`);
        }
        refreshAllNetWorths(state.players, state.board);
        handleLandedAction(state, player, sum, events, false, rng);
      } else {
        player.jailTurns += 1;
        if (player.jailTurns >= 3) {
          addChat(
            events,
            `👮 3rd Jail turn completed. ${player.name} must pay $50 fine and move.`
          );
          player.inJail = false;
          player.jailTurns = 0;
          const oldPos = player.position;
          player.position = (player.position + sum) % 40;
          if (player.position < oldPos) {
            player.money += 200;
            addChat(events, `${player.name} passed GO and collected $200!`);
          }
          refreshAllNetWorths(state.players, state.board);
          // Bug Fix #14: Pay fine first, then resolve landed action (even if debt occurs!)
          triggerPayment(state, player, null, 50, events, sum);
        } else {
          addChat(events, `${player.name} remains in Jail (attempt ${player.jailTurns}/3).`);
          setEndTurnPhase(state, player, events);
        }
      }
      return { state, changed: true, events };
    }

    // Normal roll resolution
    if (isDoubles) {
      player.rollCount += 1;
      if (player.rollCount >= 3) {
        addChat(
          events,
          `👮 ${player.name} rolled doubles 3 times in a row and goes to Jail!`
        );
        sendPlayerToJail(state, player, events);
        return { state, changed: true, events };
      }

      const oldPos = player.position;
      player.position = (player.position + sum) % 40;
      if (player.position < oldPos) {
        player.money += 200;
        addChat(events, `${player.name} passed GO and collected $200!`);
      }
      refreshAllNetWorths(state.players, state.board);

      // Mark doublesRolled BEFORE landing so setEndTurnPhase knows they get another roll,
      // while sendPlayerToJail will explicitly clear it (Bug Fix #11).
      player.doublesRolled = true;
      handleLandedAction(state, player, sum, events, false, rng);
      return { state, changed: true, events };
    } else {
      player.rollCount = 0;
      player.doublesRolled = false;

      const oldPos = player.position;
      player.position = (player.position + sum) % 40;
      if (player.position < oldPos) {
        player.money += 200;
        addChat(events, `${player.name} passed GO and collected $200!`);
      }
      refreshAllNetWorths(state.players, state.board);
      handleLandedAction(state, player, sum, events, false, rng);
      return { state, changed: true, events };
    }
  }

  if (effectType === 'resolve-casino-flip') {
    if (
      state.pendingCasinoToken !== token ||
      !state.casinoState ||
      state.casinoState.status !== 'flipping'
    ) {
      return { state: prevState, changed: false, events: [] };
    }

    const player = state.players.find((p) => p.id === state.casinoState!.playerId);
    if (!player) return { state: prevState, changed: false, events: [] };

    if (state.casinoState.result === 'win') {
      if (state.casinoState.round === 3) {
        // Bug Fix #10: Hold jackpot state visibly for 1.8s before clearing modal!
        state.casinoState.status = 'jackpot';
        state.phase = 'casino_result_hold';
        const holdToken = makeToken(rng);
        state.pendingCasinoToken = holdToken;
        addChat(
          events,
          `🎰 JACKPOT! ${player.name} won Round 3 for $${state.casinoState.payout}!`
        );
        return {
          state,
          changed: true,
          events,
          scheduledEffect: {
            type: 'finish-casino-hold',
            delayMs: 1800,
            token: holdToken,
          },
        };
      }

      state.casinoState.status = 'won';
      state.phase = 'casino_collect_or_push';
      state.pendingCasinoToken = null;
      addChat(
        events,
        `🏆 Coin landed on WIN! ${player.name} can collect $${state.casinoState.payout} or push their luck!`
      );
      return { state, changed: true, events };
    } else {
      // Bug Fix #10: Hold lost state visibly for 1.8s so everyone sees the coin land on LOSE
      state.casinoState.status = 'lost';
      state.phase = 'casino_result_hold';
      const holdToken = makeToken(rng);
      state.pendingCasinoToken = holdToken;
      addChat(
        events,
        `💀 Coin landed on LOSE! ${player.name} loses $${state.casinoState.payout}!`
      );
      return {
        state,
        changed: true,
        events,
        scheduledEffect: {
          type: 'finish-casino-hold',
          delayMs: 1800,
          token: holdToken,
        },
      };
    }
  }

  if (effectType === 'finish-casino-hold') {
    if (
      state.pendingCasinoToken !== token ||
      !state.casinoState ||
      state.phase !== 'casino_result_hold'
    ) {
      return { state: prevState, changed: false, events: [] };
    }

    const casino = state.casinoState;
    const player = state.players.find((p) => p.id === casino.playerId);
    state.casinoState = null;
    state.pendingCasinoToken = null;

    if (!player) return { state, changed: true, events };

    if (casino.status === 'jackpot') {
      player.money += casino.payout;
      refreshAllNetWorths(state.players, state.board);
      addChat(events, `💰 ${player.name} collected $${casino.payout} Casino Jackpot!`);
      setEndTurnPhase(state, player, events);
    } else {
      triggerPayment(state, player, null, casino.payout, events);
    }

    return { state, changed: true, events };
  }

  return { state: prevState, changed: false, events: [] };
}

// =====================================================================
// Main Authoritative Action Dispatcher
// =====================================================================

function isAuthorizedActor(
  state: RoomState,
  senderId: string,
  expectedPlayerId: string
): boolean {
  if (senderId === expectedPlayerId) return true;
  const expected = state.players.find((p) => p.id === expectedPlayerId);
  const sender = state.players.find((p) => p.id === senderId);
  return Boolean(expected?.isBot && sender?.isHost);
}

export function applyMonopolyAction(
  prevState: RoomState,
  senderId: string,
  action: MonopolyActionType,
  payload?: unknown,
  rng: RngSource = defaultRng
): EngineStepResult {
  if (prevState.gameState !== 'playing') {
    return { state: prevState, changed: false, events: [] };
  }

  // Dev console is host-only and can run anytime during a match
  if (action === 'dev-command') {
    const sender = prevState.players.find((p) => p.id === senderId);
    if (!sender?.isHost) return { state: prevState, changed: false, events: [] };
    const state = cloneState(prevState);
    const events: EngineEvent[] = [];
    const cmdStr =
      typeof payload === 'object' && payload !== null && 'commandStr' in payload
        ? String((payload as { commandStr: unknown }).commandStr)
        : '';
    const ok = applyDevCommand(state, cmdStr, events);
    return { state: ok ? state : prevState, changed: ok, events };
  }

  // Status updates allowed at any non-animation time by any player
  if (action === 'set-player-status') {
    const state = cloneState(prevState);
    const p = state.players.find((pl) => pl.id === senderId);
    if (!p) return { state: prevState, changed: false, events: [] };
    const nextStatus =
      payload === 'managing' || payload === 'trading' ? payload : null;
    if (p.status === nextStatus) return { state: prevState, changed: false, events: [] };
    p.status = nextStatus;
    return { state, changed: true, events: [] };
  }

  // Block gameplay actions while animations are locked
  if (prevState.phase === 'rolling_animation' || prevState.phase === 'casino_result_hold') {
    return { state: prevState, changed: false, events: [] };
  }

  const activePlayer = prevState.players[prevState.turnIndex];
  if (!activePlayer || activePlayer.bankrupt) {
    return { state: prevState, changed: false, events: [] };
  }

  // Actions with custom non-turn authorization (Bug Fixes #2 & #3!)
  const customAuthActions: ReadonlySet<MonopolyActionType> = new Set([
    'auction-bid',
    'auction-pass',
    'trade-propose',
    'trade-accept',
    'trade-decline',
    'trade-cancel',
    'trade-counter',
    'use-angel-force',
    'decline-angel-force',
  ]);

  if (!customAuthActions.has(action)) {
    if (!isAuthorizedActor(prevState, senderId, activePlayer.id)) {
      return { state: prevState, changed: false, events: [] };
    }
  }

  const state = cloneState(prevState);
  const player = state.players[state.turnIndex];
  const events: EngineEvent[] = [];
  const isGetRich = state.rules.ruleset === 'Get Rich';

  switch (action) {
    case 'roll-dice': {
      if (state.phase !== 'roll' || player.inJail) {
        return { state: prevState, changed: false, events: [] };
      }

      state.lastActionDetail = null;
      const pObj = (payload && typeof payload === 'object' ? payload : {}) as {
        power?: number;
        oddEvenChoice?: 'odd' | 'even' | null;
      };

      let d1 = 1;
      let d2 = 1;

      // Dev forced roll always wins (Bug Fix #12)
      if (state.nextForcedRoll) {
        [d1, d2] = state.nextForcedRoll;
        state.nextForcedRoll = null;
        addChat(events, `Dev Console: Applied forced roll [${d1}, ${d2}].`);
      } else if (isGetRich && (typeof pObj.power === 'number' || pObj.oddEvenChoice)) {
        const hasPower = typeof pObj.power === 'number';
        const power = hasPower ? Math.max(0, Math.min(100, pObj.power!)) : -1;
        let minSum = 2;
        let maxSum = 12;
        if (hasPower) {
          if (power <= 33) {
            minSum = 2;
            maxSum = 4;
          } else if (power <= 66) {
            minSum = 5;
            maxSum = 8;
          } else {
            minSum = 9;
            maxSum = 12;
          }
        }

        const oddEvenChoice =
          (pObj.oddEvenChoice === 'odd' || pObj.oddEvenChoice === 'even') &&
          player.oddEvenCards > 0
            ? pObj.oddEvenChoice
            : null;
        if (oddEvenChoice) {
          player.oddEvenCards -= 1;
          addChat(events, `🎯 ${player.name} activated Odd/Even Card (${oddEvenChoice.toUpperCase()})!`);
        }

        // Exact uniform draw from all valid (d1, d2) pairs — guaranteed valid in O(1)
        const candidates: Array<[number, number]> = [];
        for (let a = 1; a <= 6; a++) {
          for (let b = 1; b <= 6; b++) {
            const s = a + b;
            const rangeOk = s >= minSum && s <= maxSum;
            const parityOk =
              !oddEvenChoice ||
              (oddEvenChoice === 'odd' ? s % 2 === 1 : s % 2 === 0);
            if (rangeOk && parityOk) candidates.push([a, b]);
          }
        }
        const pick = candidates[Math.floor(rng.next() * candidates.length)] ?? [3, 4];
        [d1, d2] = pick;
      } else {
        d1 = Math.floor(rng.next() * 6) + 1;
        d2 = Math.floor(rng.next() * 6) + 1;
      }

      const token = makeToken(rng);
      state.dice = [d1, d2];
      state.rollId = token;
      player.lastRoll = [d1, d2];
      state.phase = 'rolling_animation';
      state.pendingRollResolution = {
        playerId: player.id,
        d1,
        d2,
        mode: 'normal',
        token,
      };

      const sum = d1 + d2;
      addChat(
        events,
        `🎲 ${player.name} rolled ${d1} & ${d2} = ${sum}${d1 === d2 ? ' (DOUBLES!)' : ''}`
      );

      return {
        state,
        changed: true,
        events,
        scheduledEffect: { type: 'resolve-roll', delayMs: 2200, token },
      };
    }

    case 'roll-jail-doubles': {
      if (state.phase !== 'roll' || !player.inJail) {
        return { state: prevState, changed: false, events: [] };
      }

      state.lastActionDetail = null;
      let d1: number;
      let d2: number;
      if (state.nextForcedRoll) {
        [d1, d2] = state.nextForcedRoll;
        state.nextForcedRoll = null;
        addChat(events, `Dev Console: Applied forced jail roll [${d1}, ${d2}].`);
      } else {
        d1 = Math.floor(rng.next() * 6) + 1;
        d2 = Math.floor(rng.next() * 6) + 1;
      }

      const token = makeToken(rng);
      state.dice = [d1, d2];
      state.rollId = token;
      player.lastRoll = [d1, d2];
      state.phase = 'rolling_animation';
      state.pendingRollResolution = {
        playerId: player.id,
        d1,
        d2,
        mode: 'jail',
        token,
      };
      addChat(events, `🎲 ${player.name} rolled for Jail release: ${d1} & ${d2}`);

      return {
        state,
        changed: true,
        events,
        scheduledEffect: { type: 'resolve-roll', delayMs: 2200, token },
      };
    }

    case 'pay-jail-fine': {
      if (state.phase !== 'roll' || !player.inJail || player.money < 50) {
        return { state: prevState, changed: false, events: [] };
      }
      player.money -= 50;
      player.inJail = false;
      player.jailTurns = 0;
      addChat(events, `🔓 ${player.name} paid $50 to leave Jail.`);
      refreshAllNetWorths(state.players, state.board);
      return { state, changed: true, events };
    }

    case 'use-jail-card': {
      if (state.phase !== 'roll' || !player.inJail || player.getOutOfJailCards <= 0) {
        return { state: prevState, changed: false, events: [] };
      }
      player.getOutOfJailCards -= 1;
      player.inJail = false;
      player.jailTurns = 0;
      addChat(events, `🔓 ${player.name} used a Get Out of Jail Free card.`);
      return { state, changed: true, events };
    }

    case 'buy-property': {
      if (state.phase !== 'action') return { state: prevState, changed: false, events: [] };
      const tile = state.board[player.position];
      if (!tile || tile.owner !== null || !tile.price || player.money < tile.price) {
        return { state: prevState, changed: false, events: [] };
      }

      player.money -= tile.price;
      tile.owner = player.id;
      addChat(events, `🏠 ${player.name} bought ${tile.name} for $${tile.price}.`);
      refreshAllNetWorths(state.players, state.board);

      if (checkSpecialWins(state, events)) {
        return { state, changed: true, events };
      }

      if (isGetRich && tile.type === 'property') {
        state.phase = 'landed_build';
        state.landedBuildMaxHouses = 4;
      } else {
        setEndTurnPhase(state, player, events);
      }
      return { state, changed: true, events };
    }

    case 'pass-property': {
      if (state.phase !== 'action') return { state: prevState, changed: false, events: [] };
      const tile = state.board[player.position];
      addChat(events, `${player.name} passed on buying ${tile.name}.`);
      if (isGetRich) {
        setEndTurnPhase(state, player, events);
      } else {
        startPropertyAuction(state, player.position, events);
      }
      return { state, changed: true, events };
    }

    case 'ok-card': {
      if (state.phase !== 'card_drawn' || !state.currentCard) {
        return { state: prevState, changed: false, events: [] };
      }
      const sum = player.lastRoll[0] + player.lastRoll[1];
      resolveCardAction(state, player, sum, events, rng);
      return { state, changed: true, events };
    }

    case 'build-house': {
      if (isGetRich) {
        events.push({
          type: 'action-error',
          targetPlayerId: senderId,
          message: 'In Get Rich mode, build houses when landing on your property or on GO.',
        });
        return { state: prevState, changed: false, events };
      }
      if (!['roll', 'end_turn'].includes(state.phase)) {
        return { state: prevState, changed: false, events: [] };
      }

      const tileIndex = typeof payload === 'number' ? payload : -1;
      const tile = state.board[tileIndex];
      if (!tile || tile.type !== 'property' || tile.owner !== player.id || tile.mortgaged) {
        return { state: prevState, changed: false, events: [] };
      }
      if (!ownsMonopoly(state.board, tile.color, player.id)) {
        return { state: prevState, changed: false, events: [] };
      }

      const colorGroup = state.board.filter(
        (t) => t.type === 'property' && t.color === tile.color
      );
      if (colorGroup.some((t) => t.mortgaged) || tile.houses >= 5) {
        return { state: prevState, changed: false, events: [] };
      }

      const canBuildEvenly = colorGroup.every((t) => t.houses >= tile.houses);
      if (!canBuildEvenly) {
        events.push({
          type: 'action-error',
          targetPlayerId: senderId,
          message: 'Must build houses evenly across the color group.',
        });
        return { state: prevState, changed: false, events };
      }

      const cost = tile.housePrice ?? 0;
      if (player.money < cost) return { state: prevState, changed: false, events: [] };

      player.money -= cost;
      tile.houses += 1;
      const label = tile.houses === 5 ? 'a Hotel' : 'a house';
      addChat(events, `🧱 ${player.name} built ${label} on ${tile.name} for $${cost}.`);
      refreshAllNetWorths(state.players, state.board);
      return { state, changed: true, events };
    }

    case 'sell-house': {
      if (!['roll', 'end_turn', 'bankrupt_decision'].includes(state.phase)) {
        return { state: prevState, changed: false, events: [] };
      }
      const tileIndex = typeof payload === 'number' ? payload : -1;
      const tile = state.board[tileIndex];
      if (!tile || tile.type !== 'property' || tile.owner !== player.id || tile.houses <= 0) {
        return { state: prevState, changed: false, events: [] };
      }

      // Bug Fix #6: Only enforce even-sell across color group in Classic mode
      if (!isGetRich) {
        const colorGroup = state.board.filter(
          (t) => t.type === 'property' && t.color === tile.color
        );
        const canSellEvenly = colorGroup.every((t) => t.houses <= tile.houses);
        if (!canSellEvenly) {
          events.push({
            type: 'action-error',
            targetPlayerId: senderId,
            message: 'Must sell houses evenly across the color group.',
          });
          return { state: prevState, changed: false, events };
        }
      }

      const refund = Math.floor((tile.housePrice ?? 0) / 2);
      player.money += refund;
      tile.houses -= 1;
      addChat(events, `🧱 ${player.name} sold a building on ${tile.name} for $${refund}.`);
      refreshAllNetWorths(state.players, state.board);
      trySettleActiveDebt(state, player, events, rng);
      return { state, changed: true, events };
    }

    case 'mortgage-property': {
      if (!['roll', 'end_turn', 'bankrupt_decision'].includes(state.phase)) {
        return { state: prevState, changed: false, events: [] };
      }
      const tileIndex = typeof payload === 'number' ? payload : -1;
      const tile = state.board[tileIndex];
      if (!tile || tile.owner !== player.id || tile.mortgaged || !tile.mortgageValue) {
        return { state: prevState, changed: false, events: [] };
      }

      if (tile.type === 'property') {
        if (isGetRich) {
          if (tile.houses > 0) {
            events.push({
              type: 'action-error',
              targetPlayerId: senderId,
              message: 'Sell all buildings on this property before mortgaging.',
            });
            return { state: prevState, changed: false, events };
          }
        } else {
          const group = state.board.filter(
            (t) => t.type === 'property' && t.color === tile.color
          );
          if (group.some((t) => t.houses > 0)) {
            events.push({
              type: 'action-error',
              targetPlayerId: senderId,
              message: 'Sell all buildings in this color group before mortgaging.',
            });
            return { state: prevState, changed: false, events };
          }
        }
      }

      tile.mortgaged = true;
      player.money += tile.mortgageValue;
      addChat(events, `🏦 ${player.name} mortgaged ${tile.name} for $${tile.mortgageValue}.`);
      refreshAllNetWorths(state.players, state.board);
      trySettleActiveDebt(state, player, events, rng);
      return { state, changed: true, events };
    }

    case 'unmortgage-property': {
      if (!['roll', 'end_turn'].includes(state.phase)) {
        return { state: prevState, changed: false, events: [] };
      }
      const tileIndex = typeof payload === 'number' ? payload : -1;
      const tile = state.board[tileIndex];
      if (!tile || tile.owner !== player.id || !tile.mortgaged || !tile.mortgageValue) {
        return { state: prevState, changed: false, events: [] };
      }
      const cost = Math.floor(tile.mortgageValue * 1.1);
      if (player.money < cost) return { state: prevState, changed: false, events: [] };
      player.money -= cost;
      tile.mortgaged = false;
      addChat(events, `🏦 ${player.name} unmortgaged ${tile.name} for $${cost}.`);
      refreshAllNetWorths(state.players, state.board);
      return { state, changed: true, events };
    }

    case 'declare-bankruptcy': {
      if (state.phase !== 'bankrupt_decision') {
        return { state: prevState, changed: false, events: [] };
      }
      handleBankruptcyResolution(state, player, events);
      return { state, changed: true, events };
    }

    case 'end-turn': {
      if (state.phase !== 'end_turn') {
        return { state: prevState, changed: false, events: [] };
      }
      advanceTurnToNextPlayer(state, events, true);
      return { state, changed: true, events };
    }

    case 'festival-select': {
      if (state.phase !== 'festival_selection') {
        return { state: prevState, changed: false, events: [] };
      }
      const tileIndex = typeof payload === 'number' ? payload : -1;
      const fTile = state.board[tileIndex];
      if (!fTile || fTile.owner !== player.id || fTile.mortgaged) {
        return { state: prevState, changed: false, events: [] };
      }
      fTile.festivalTurns = 3;
      fTile.festivalJustActivated = true; // Bug Fix #9
      state.lastActionDetail = { type: 'festival', tileIndex };
      addChat(
        events,
        `🎉 ${player.name} hosted a Festival at ${fTile.name}! Rent doubled for 3 full turns.`
      );
      setEndTurnPhase(state, player, events);
      return { state, changed: true, events };
    }

    case 'festival-skip': {
      if (state.phase !== 'festival_selection') {
        return { state: prevState, changed: false, events: [] };
      }
      setEndTurnPhase(state, player, events);
      return { state, changed: true, events };
    }

    case 'airport-fly': {
      if (state.phase !== 'airport_selection') {
        return { state: prevState, changed: false, events: [] };
      }
      const targetIndex =
        typeof payload === 'object' && payload !== null && 'targetIndex' in payload
          ? Number((payload as { targetIndex: unknown }).targetIndex)
          : -1;
      // Cannot fly to Airport tile itself (Tile 20)
      if (
        !Number.isInteger(targetIndex) ||
        targetIndex < 0 ||
        targetIndex >= 40 ||
        targetIndex === AIRPORT_TILE_INDEX ||
        targetIndex === player.position ||
        player.money < 100
      ) {
        return { state: prevState, changed: false, events: [] };
      }

      player.money -= 100;
      const oldPos = player.position;
      player.position = targetIndex;
      state.lastActionDetail = { type: 'airport', tileIndex: targetIndex };

      if (player.position < oldPos) {
        player.money += 200;
        addChat(events, `${player.name} passed GO while flying and collected $200!`);
      }
      addChat(
        events,
        `✈️ ${player.name} paid $100 and flew to ${getDisplayTileName(state.board[targetIndex], isGetRich)}.`
      );
      refreshAllNetWorths(state.players, state.board);

      const diceSum = player.lastRoll[0] + player.lastRoll[1];
      handleLandedAction(state, player, diceSum, events, false, rng);
      return { state, changed: true, events };
    }

    case 'airport-skip': {
      if (state.phase !== 'airport_selection') {
        return { state: prevState, changed: false, events: [] };
      }
      addChat(events, `${player.name} skipped the Airport flight.`);
      setEndTurnPhase(state, player, events);
      return { state, changed: true, events };
    }

    case 'force-acquire': {
      if (state.phase !== 'force_acquire_decision' || !state.pendingForceAcquire) {
        return { state: prevState, changed: false, events: [] };
      }
      const fa = state.pendingForceAcquire;
      if (fa.byId !== player.id) return { state: prevState, changed: false, events: [] };
      const faTile = state.board[fa.tileIndex];
      if (!faTile || faTile.type !== 'property' || faTile.houses >= 5) {
        return { state: prevState, changed: false, events: [] };
      }
      const prevOwner = state.players.find((p) => p.id === faTile.owner);
      if (!prevOwner || player.money < fa.worth) {
        return { state: prevState, changed: false, events: [] };
      }

      player.money -= fa.worth;
      prevOwner.money += fa.worth;
      faTile.owner = player.id;
      faTile.festivalTurns = 0;
      faTile.festivalJustActivated = false;
      state.pendingForceAcquire = null;
      state.lastActionDetail = { type: 'force-acquire', tileIndex: fa.tileIndex };

      addChat(
        events,
        `💼 ${player.name} force-acquired ${faTile.name} from ${prevOwner.name} for $${fa.worth}!`
      );
      refreshAllNetWorths(state.players, state.board);

      if (checkSpecialWins(state, events)) {
        return { state, changed: true, events };
      }

      state.phase = 'landed_build';
      state.landedBuildMaxHouses = faTile.houses === 4 ? 5 : 4;
      return { state, changed: true, events };
    }

    case 'decline-force-acquire': {
      if (state.phase !== 'force_acquire_decision') {
        return { state: prevState, changed: false, events: [] };
      }
      state.pendingForceAcquire = null;
      setEndTurnPhase(state, player, events);
      return { state, changed: true, events };
    }

    case 'use-angel-rent': {
      if (state.phase !== 'use_angel_rent' || !state.pendingRent) {
        return { state: prevState, changed: false, events: [] };
      }
      if (state.pendingRent.fromId !== player.id || player.angelCards <= 0) {
        return { state: prevState, changed: false, events: [] };
      }
      player.angelCards -= 1;
      state.pendingRent = null;
      addChat(events, `😇 ${player.name} used an Angel Card to skip rent!`);
      setEndTurnPhase(state, player, events);
      return { state, changed: true, events };
    }

    case 'decline-angel-rent': {
      if (state.phase !== 'use_angel_rent' || !state.pendingRent) {
        return { state: prevState, changed: false, events: [] };
      }
      const pending = state.pendingRent;
      const debtor = state.players.find((p) => p.id === pending.fromId);
      const creditor = state.players.find((p) => p.id === pending.toId);
      state.pendingRent = null;
      if (debtor && creditor) {
        triggerPayment(state, debtor, creditor, pending.amount, events);
        maybeTriggerForceAcquire(state, debtor, creditor, debtor.position);
      }
      return { state, changed: true, events };
    }

    // Bug Fix #2: Properly authorized for the property OWNER (not active turn player)!
    case 'use-angel-force': {
      if (state.phase !== 'use_angel_force' || !state.pendingForceAcquire) {
        return { state: prevState, changed: false, events: [] };
      }
      const faTile = state.board[state.pendingForceAcquire.tileIndex];
      if (!faTile || !faTile.owner) return { state: prevState, changed: false, events: [] };
      if (!isAuthorizedActor(state, senderId, faTile.owner)) {
        return { state: prevState, changed: false, events: [] };
      }
      const owner = state.players.find((p) => p.id === faTile.owner);
      if (!owner || owner.angelCards <= 0) {
        return { state: prevState, changed: false, events: [] };
      }

      owner.angelCards -= 1;
      state.pendingForceAcquire = null;
      addChat(
        events,
        `😇 ${owner.name} used an Angel Card to protect ${faTile.name} from force-acquisition!`
      );
      setEndTurnPhase(state, player, events);
      return { state, changed: true, events };
    }

    case 'decline-angel-force': {
      if (state.phase !== 'use_angel_force' || !state.pendingForceAcquire) {
        return { state: prevState, changed: false, events: [] };
      }
      const faTile = state.board[state.pendingForceAcquire.tileIndex];
      if (!faTile || !faTile.owner) return { state: prevState, changed: false, events: [] };
      if (!isAuthorizedActor(state, senderId, faTile.owner)) {
        return { state: prevState, changed: false, events: [] };
      }
      state.phase = 'force_acquire_decision';
      return { state, changed: true, events };
    }

    case 'landed-build': {
      if (state.phase !== 'landed_build') {
        return { state: prevState, changed: false, events: [] };
      }
      const { tileIndex, count } =
        typeof payload === 'object' && payload !== null
          ? {
              tileIndex: Number((payload as { tileIndex?: unknown }).tileIndex),
              count: Number((payload as { count?: unknown }).count ?? 1),
            }
          : { tileIndex: Number(payload), count: 1 };

      // Bug Fix #12: Validate exact landed tile & positive integer count
      if (
        tileIndex !== player.position ||
        !Number.isInteger(count) ||
        count < 1
      ) {
        return { state: prevState, changed: false, events: [] };
      }

      const lbTile = state.board[tileIndex];
      if (!lbTile || lbTile.type !== 'property' || lbTile.owner !== player.id || lbTile.mortgaged) {
        return { state: prevState, changed: false, events: [] };
      }

      const maxHouses = state.landedBuildMaxHouses;
      if (lbTile.houses + count > maxHouses) {
        return { state: prevState, changed: false, events: [] };
      }
      const totalCost = (lbTile.housePrice ?? 0) * count;
      if (player.money < totalCost) {
        return { state: prevState, changed: false, events: [] };
      }

      player.money -= totalCost;
      lbTile.houses += count;
      const buildName = lbTile.houses === 5 ? 'Hotel!' : `${lbTile.houses} house(s)`;
      addChat(events, `🏗️ ${player.name} built on ${lbTile.name} (${buildName}) for $${totalCost}.`);
      refreshAllNetWorths(state.players, state.board);
      return { state, changed: true, events };
    }

    case 'landed-build-done': {
      if (state.phase !== 'landed_build') {
        return { state: prevState, changed: false, events: [] };
      }
      setEndTurnPhase(state, player, events);
      return { state, changed: true, events };
    }

    case 'go-build': {
      if (state.phase !== 'go_build_select' || !isGetRich) {
        return { state: prevState, changed: false, events: [] };
      }
      const tileIndex = typeof payload === 'number' ? payload : -1;
      const tile = state.board[tileIndex];
      if (
        !tile ||
        tile.type !== 'property' ||
        tile.owner !== player.id ||
        tile.mortgaged ||
        tile.houses >= 5
      ) {
        return { state: prevState, changed: false, events: [] };
      }
      const cost = tile.housePrice ?? 50;
      if (player.money < cost) return { state: prevState, changed: false, events: [] };

      player.money -= cost;
      tile.houses += 1;
      const label = tile.houses === 5 ? 'Hotel' : 'house';
      addChat(
        events,
        `🧱 ${player.name} built a ${label} on ${tile.name} via GO landing bonus for $${cost}.`
      );
      refreshAllNetWorths(state.players, state.board);
      setEndTurnPhase(state, player, events);
      return { state, changed: true, events };
    }

    case 'go-build-skip': {
      if (state.phase !== 'go_build_select' || !isGetRich) {
        return { state: prevState, changed: false, events: [] };
      }
      setEndTurnPhase(state, player, events);
      return { state, changed: true, events };
    }

    case 'casino-flip': {
      if (
        state.phase !== 'casino_flip' ||
        !state.casinoState ||
        state.casinoState.status !== 'pending_flip'
      ) {
        return { state: prevState, changed: false, events: [] };
      }
      const token = makeToken(rng);
      state.casinoState.status = 'flipping';
      state.casinoState.result = rng.next() >= 0.5 ? 'win' : 'lose';
      state.pendingCasinoToken = token;
      addChat(events, `🎰 Coin is in the air...`);
      return {
        state,
        changed: true,
        events,
        scheduledEffect: { type: 'resolve-casino-flip', delayMs: 2000, token },
      };
    }

    case 'casino-collect': {
      if (
        state.phase !== 'casino_collect_or_push' ||
        !state.casinoState ||
        state.casinoState.status !== 'won'
      ) {
        return { state: prevState, changed: false, events: [] };
      }
      const winnings = state.casinoState.payout;
      player.money += winnings;
      state.casinoState = null;
      state.pendingCasinoToken = null;
      addChat(events, `💰 ${player.name} collected $${winnings} Casino winnings!`);
      refreshAllNetWorths(state.players, state.board);
      setEndTurnPhase(state, player, events);
      return { state, changed: true, events };
    }

    case 'casino-push': {
      if (
        state.phase !== 'casino_collect_or_push' ||
        !state.casinoState ||
        state.casinoState.status !== 'won' ||
        state.casinoState.round >= 3
      ) {
        return { state: prevState, changed: false, events: [] };
      }
      const nextRound = (state.casinoState.round + 1) as 2 | 3;
      const nextPayout = nextRound === 2 ? 400 : 800;
      const token = makeToken(rng);

      state.casinoState.round = nextRound;
      state.casinoState.payout = nextPayout;
      state.casinoState.status = 'flipping';
      state.casinoState.result = rng.next() >= 0.5 ? 'win' : 'lose';
      state.phase = 'casino_flip';
      state.pendingCasinoToken = token;

      addChat(
        events,
        `🎲 ${player.name} pushes their luck to Round ${nextRound} for $${nextPayout}!`
      );
      return {
        state,
        changed: true,
        events,
        scheduledEffect: { type: 'resolve-casino-flip', delayMs: 2000, token },
      };
    }

    case 'auction-bid': {
      if (state.phase !== 'auction' || !state.auctionState) {
        return { state: prevState, changed: false, events: [] };
      }
      const activeBidderId = state.auctionState.bidders[state.auctionState.activeBidderIndex];
      if (!activeBidderId || !isAuthorizedActor(state, senderId, activeBidderId)) {
        return { state: prevState, changed: false, events: [] };
      }

      const bid =
        typeof payload === 'object' && payload !== null && 'bid' in payload
          ? Number((payload as { bid: unknown }).bid)
          : 0;
      const bidder = state.players.find((p) => p.id === activeBidderId);
      if (
        !bidder ||
        !Number.isInteger(bid) ||
        bid < 10 ||
        bid <= state.auctionState.highestBid ||
        bidder.money < bid
      ) {
        return { state: prevState, changed: false, events: [] };
      }

      if (state.auctionState.bidders.length === 1) {
        const tile = state.board[state.auctionState.tileIndex];
        if (tile) {
          bidder.money -= bid;
          tile.owner = bidder.id;
          addChat(events, `🏆 ${bidder.name} won the auction for ${tile.name} ($${bid})!`);
          refreshAllNetWorths(state.players, state.board);
          if (checkSpecialWins(state, events)) {
            state.auctionState = null;
            return { state, changed: true, events };
          }
          resumeAfterAuction(state, events);
        }
      } else {
        state.auctionState.highestBid = bid;
        state.auctionState.highestBidder = bidder.id;
        state.auctionState.activeBidderIndex =
          (state.auctionState.activeBidderIndex + 1) % state.auctionState.bidders.length;
        addChat(events, `💰 ${bidder.name} bid $${bid}.`);
      }
      return { state, changed: true, events };
    }

    case 'auction-pass': {
      if (state.phase !== 'auction' || !state.auctionState) {
        return { state: prevState, changed: false, events: [] };
      }
      const activeBidderId = state.auctionState.bidders[state.auctionState.activeBidderIndex];
      if (!activeBidderId || !isAuthorizedActor(state, senderId, activeBidderId)) {
        return { state: prevState, changed: false, events: [] };
      }

      const bidder = state.players.find((p) => p.id === activeBidderId);
      if (!bidder) return { state: prevState, changed: false, events: [] };

      addChat(events, `❌ ${bidder.name} folded in the auction.`);
      state.auctionState.bidders = state.auctionState.bidders.filter(
        (id) => id !== activeBidderId
      );

      if (state.auctionState.bidders.length === 0) {
        const tile = state.board[state.auctionState.tileIndex];
        addChat(events, `Auction ended. No one bought ${tile.name}.`);
        resumeAfterAuction(state, events);
      } else {
        if (state.auctionState.activeBidderIndex >= state.auctionState.bidders.length) {
          state.auctionState.activeBidderIndex = 0;
        }
        if (
          state.auctionState.bidders.length === 1 &&
          state.auctionState.highestBidder !== null
        ) {
          const winnerId = state.auctionState.highestBidder;
          const winner = state.players.find((p) => p.id === winnerId);
          const tile = state.board[state.auctionState.tileIndex];
          if (winner && tile) {
            winner.money -= state.auctionState.highestBid;
            tile.owner = winnerId;
            addChat(
              events,
              `🏆 ${winner.name} won the auction for ${tile.name} ($${state.auctionState.highestBid})!`
            );
            refreshAllNetWorths(state.players, state.board);
            if (checkSpecialWins(state, events)) {
              state.auctionState = null;
              return { state, changed: true, events };
            }
            resumeAfterAuction(state, events);
          }
        }
      }
      return { state, changed: true, events };
    }

    case 'trade-propose': {
      if (!['roll', 'end_turn', 'action'].includes(state.phase)) {
        return { state: prevState, changed: false, events: [] };
      }

      // Bug Fix #3: Allow active turn player OR receiver submitting a counter-offer
      const isCounteringReceiver =
        state.activeTrade?.status === 'countering' &&
        isAuthorizedActor(state, senderId, state.activeTrade.receiverId);
      const isActiveActor = isAuthorizedActor(state, senderId, activePlayer.id);
      if (!isActiveActor && !isCounteringReceiver) {
        return { state: prevState, changed: false, events: [] };
      }

      const raw = (payload && typeof payload === 'object' ? payload : {}) as Partial<{
        receiverId: string;
        senderProperties: number[];
        senderMoney: number;
        receiverProperties: number[];
        receiverMoney: number;
        senderJailCards: number;
        receiverJailCards: number;
      }>;

      const proposerId = isCounteringReceiver ? state.activeTrade!.receiverId : senderId;
      const sender = state.players.find((p) => p.id === proposerId);
      const receiver = state.players.find((p) => p.id === raw.receiverId);
      if (!sender || !receiver || sender.id === receiver.id || sender.bankrupt || receiver.bankrupt) {
        return { state: prevState, changed: false, events: [] };
      }

      const senderMoney = Number(raw.senderMoney ?? 0);
      const receiverMoney = Number(raw.receiverMoney ?? 0);
      const senderJailCards = Number(raw.senderJailCards ?? 0);
      const receiverJailCards = Number(raw.receiverJailCards ?? 0);
      const senderProperties = Array.isArray(raw.senderProperties) ? [...new Set(raw.senderProperties)] : [];
      const receiverProperties = Array.isArray(raw.receiverProperties) ? [...new Set(raw.receiverProperties)] : [];

      // Bug Fix #7: Strict non-negative integer validation
      if (
        !Number.isInteger(senderMoney) ||
        senderMoney < 0 ||
        senderMoney > sender.money ||
        !Number.isInteger(receiverMoney) ||
        receiverMoney < 0 ||
        receiverMoney > receiver.money ||
        !Number.isInteger(senderJailCards) ||
        senderJailCards < 0 ||
        senderJailCards > sender.getOutOfJailCards ||
        !Number.isInteger(receiverJailCards) ||
        receiverJailCards < 0 ||
        receiverJailCards > receiver.getOutOfJailCards
      ) {
        return { state: prevState, changed: false, events: [] };
      }

      const validateProps = (indices: number[], ownerId: string): boolean => {
        for (const idx of indices) {
          const tile = state.board[idx];
          if (!tile || tile.owner !== ownerId) return false;
          // Bug Fix #7: In Get Rich mode, properties with houses/hotels CAN be traded!
          if (!isGetRich && tile.type === 'property') {
            const colorGroup = state.board.filter(
              (t) => t.type === 'property' && t.color === tile.color
            );
            if (colorGroup.some((t) => t.houses > 0)) return false;
          }
        }
        return true;
      };

      if (!validateProps(senderProperties, sender.id)) return { state: prevState, changed: false, events: [] };
      if (!validateProps(receiverProperties, receiver.id)) return { state: prevState, changed: false, events: [] };

      const hasAnything =
        senderMoney > 0 ||
        receiverMoney > 0 ||
        senderJailCards > 0 ||
        receiverJailCards > 0 ||
        senderProperties.length > 0 ||
        receiverProperties.length > 0;
      if (!hasAnything) return { state: prevState, changed: false, events: [] };

      state.activeTrade = {
        senderId: sender.id,
        receiverId: receiver.id,
        senderProperties,
        senderMoney,
        receiverProperties,
        receiverMoney,
        senderJailCards,
        receiverJailCards,
        status: 'pending',
      };

      addChat(
        events,
        isCounteringReceiver
          ? `🔄 ${sender.name} sent a counter-offer to ${receiver.name}.`
          : `🤝 ${sender.name} proposed a trade to ${receiver.name}.`
      );
      return { state, changed: true, events };
    }

    case 'trade-accept': {
      if (!state.activeTrade || state.activeTrade.status !== 'pending') {
        return { state: prevState, changed: false, events: [] };
      }
      const trade = state.activeTrade;
      if (!isAuthorizedActor(state, senderId, trade.receiverId)) {
        return { state: prevState, changed: false, events: [] };
      }

      const sender = state.players.find((p) => p.id === trade.senderId);
      const receiver = state.players.find((p) => p.id === trade.receiverId);
      if (!sender || !receiver || sender.bankrupt || receiver.bankrupt) {
        state.activeTrade = null;
        return { state, changed: true, events };
      }

      const validMoney =
        sender.money >= trade.senderMoney && receiver.money >= trade.receiverMoney;
      const validJail =
        sender.getOutOfJailCards >= trade.senderJailCards &&
        receiver.getOutOfJailCards >= trade.receiverJailCards;
      const validProps =
        trade.senderProperties.every((idx) => state.board[idx]?.owner === sender.id) &&
        trade.receiverProperties.every((idx) => state.board[idx]?.owner === receiver.id);

      if (!validMoney || !validJail || !validProps) {
        state.activeTrade = null;
        addChat(events, `❌ Trade failed: assets changed before acceptance.`);
        return { state, changed: true, events };
      }

      for (const idx of trade.senderProperties) {
        state.board[idx].owner = receiver.id;
      }
      for (const idx of trade.receiverProperties) {
        state.board[idx].owner = sender.id;
      }

      sender.money = sender.money - trade.senderMoney + trade.receiverMoney;
      receiver.money = receiver.money - trade.receiverMoney + trade.senderMoney;
      sender.getOutOfJailCards =
        sender.getOutOfJailCards - trade.senderJailCards + trade.receiverJailCards;
      receiver.getOutOfJailCards =
        receiver.getOutOfJailCards - trade.receiverJailCards + trade.senderJailCards;

      state.activeTrade = null;
      state.lastActionDetail = { type: 'trade' };
      refreshAllNetWorths(state.players, state.board);
      addChat(
        events,
        `🤝 Trade accepted! Assets exchanged between ${sender.name} and ${receiver.name}.`
      );

      checkSpecialWins(state, events);
      return { state, changed: true, events };
    }

    case 'trade-decline': {
      if (!state.activeTrade) return { state: prevState, changed: false, events: [] };
      const trade = state.activeTrade;
      const authorized =
        isAuthorizedActor(state, senderId, trade.receiverId) ||
        senderId === trade.senderId;
      if (!authorized) return { state: prevState, changed: false, events: [] };

      const receiver = state.players.find((p) => p.id === trade.receiverId);
      addChat(events, `❌ Trade offer declined by ${receiver?.name ?? 'opponent'}.`);
      events.push({
        type: 'trade-rejected',
        targetPlayerId: trade.senderId,
        receiverName: receiver?.name ?? 'Opponent',
      });
      state.activeTrade = null;
      return { state, changed: true, events };
    }

    case 'trade-counter': {
      if (!state.activeTrade || state.activeTrade.status !== 'pending') {
        return { state: prevState, changed: false, events: [] };
      }
      if (!isAuthorizedActor(state, senderId, state.activeTrade.receiverId)) {
        return { state: prevState, changed: false, events: [] };
      }
      state.activeTrade.status = 'countering';
      const receiver = state.players.find((p) => p.id === state.activeTrade!.receiverId);
      const sender = state.players.find((p) => p.id === state.activeTrade!.senderId);
      addChat(
        events,
        `🔄 ${receiver?.name ?? 'Opponent'} is preparing a counter-offer to ${sender?.name ?? 'player'}.`
      );
      return { state, changed: true, events };
    }

    case 'trade-cancel': {
      if (!state.activeTrade) return { state: prevState, changed: false, events: [] };
      if (!isAuthorizedActor(state, senderId, state.activeTrade.senderId)) {
        return { state: prevState, changed: false, events: [] };
      }
      addChat(events, `Trade offer canceled.`);
      state.activeTrade = null;
      return { state, changed: true, events };
    }

    default:
      return { state: prevState, changed: false, events: [] };
  }
}
