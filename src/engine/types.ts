// src/engine/types.ts

export interface AvatarConfig {
  skinColor: string;
  hairStyle: 'short' | 'spiky' | 'long' | 'bob' | 'bald' | 'cap';
  hairColor: string;
  expression: 'smile' | 'excited' | 'cool' | 'wink' | 'nervous';
  clothesColor: string;
}

export type Ruleset = 'Classic' | 'Get Rich';

export interface GameRules {
  ruleset: Ruleset;
  startingCash: number;
  turnLimit: number; // 0 = Unlimited
}

export type PropertyColor =
  | 'brown'
  | 'lightblue'
  | 'pink'
  | 'orange'
  | 'red'
  | 'yellow'
  | 'green'
  | 'darkblue';

export type TileType =
  | 'go'
  | 'property'
  | 'tax'
  | 'railroad'
  | 'utility'
  | 'chance'
  | 'chest'
  | 'jail'
  | 'parking'
  | 'gotojail';

export interface TileDefinition {
  index: number;
  name: string;
  type: TileType;
  color?: PropertyColor;
  price?: number;
  /**
   * For 'property': [base, monopoly0H, 1H, 2H, 3H, 4H, hotel] (7 entries)
   * For 'railroad': [1RR, 2RR, 3RR, 4RR]
   * For 'utility': [1UtilMult, 2UtilMult]
   */
  rent?: number[];
  housePrice?: number;
  mortgageValue?: number;
}

export interface TileState extends TileDefinition {
  owner: string | null;
  houses: number; // 0..4 houses, 5 = Hotel
  mortgaged: boolean;
  festivalTurns: number;
  /** Prevents decrementing on the very same turn the player activated Festival. */
  festivalJustActivated?: boolean;
}

export type CardAction =
  | 'move'
  | 'give_money'
  | 'take_money'
  | 'jail_free'
  | 'goto_jail'
  | 'back_spaces'
  | 'nearest_railroad'
  | 'nearest_utility'
  | 'pay_each'
  | 'collect_each'
  | 'repairs'
  | 'give_odd_even'
  | 'give_angel';

export interface CardDefinition {
  id: string;
  text: string;
  action: CardAction;
  target?: number;
  amount?: number;
  houseCost?: number;
  hotelCost?: number;
  getRichOnly?: boolean;
}

export type MonopolyPhase =
  | 'roll'
  | 'rolling_animation'
  | 'action'
  | 'card_drawn'
  | 'bankrupt_decision'
  | 'end_turn'
  | 'auction'
  | 'festival_selection'
  | 'airport_selection'
  | 'force_acquire_decision'
  | 'use_angel_rent'
  | 'use_angel_force'
  | 'landed_build'
  | 'casino_flip'
  | 'casino_collect_or_push'
  | 'casino_result_hold'
  | 'go_build_select';

export type PlayerStatus = 'managing' | 'trading' | null;

export interface PlayerState {
  id: string;
  sessionId?: string;
  name: string;
  avatar: AvatarConfig;
  isHost: boolean;
  isReady: boolean;
  isBot: boolean;
  disconnected?: boolean;
  money: number;
  position: number;
  inJail: boolean;
  jailTurns: number;
  getOutOfJailCards: number;
  oddEvenCards: number;
  angelCards: number;
  bankrupt: boolean;
  lastRoll: [number, number];
  rollCount: number;
  doublesRolled: boolean;
  netWorth: number;
  score: number;
  finishRank?: number;
  status: PlayerStatus;
}

export interface DebtState {
  from: string;
  to: string; // playerId or 'bank'
  amountValue: number;
  payoutPlayers?: Array<{ id: string; share: number }>;
  /** If debt occurred on 3rd-turn Jail fine before landing resolved, resolve landing after paying. */
  pendingLandingDiceSum?: number;
}

export interface AuctionState {
  tileIndex: number;
  highestBid: number;
  highestBidder: string | null;
  bidders: string[];
  activeBidderIndex: number;
}

export interface TradeOffer {
  senderId: string;
  receiverId: string;
  senderProperties: number[];
  senderMoney: number;
  receiverProperties: number[];
  receiverMoney: number;
  senderJailCards: number;
  receiverJailCards: number;
  status: 'pending' | 'countering';
}

export interface PendingForceAcquire {
  byId: string;
  tileIndex: number;
  worth: number;
}

export interface PendingRent {
  fromId: string;
  toId: string;
  amount: number;
}

export interface CasinoState {
  playerId: string;
  tileIndex: number;
  round: 1 | 2 | 3;
  status: 'pending_flip' | 'flipping' | 'won' | 'lost' | 'jackpot';
  payout: number;
  result: 'win' | 'lose' | null;
}

export interface LastActionDetail {
  type: 'force-acquire' | 'trade' | 'airport' | 'festival';
  tileIndex?: number;
}

export interface ForcedCardRequest {
  type: 'chance' | 'chest';
  cardActionOrId: string;
}

export type GameLifecycle = 'lobby' | 'playing' | 'gameover';

export interface RoomState {
  code: string;
  gameState: GameLifecycle;
  rules: GameRules;
  players: PlayerState[];
  turnIndex: number;
  roundNumber: number;
  turnCount: number;
  board: TileState[];
  chanceDeck: CardDefinition[];
  chestDeck: CardDefinition[];
  dice: [number, number];
  rollId: string | null;
  phase: MonopolyPhase;
  currentCard: CardDefinition | null;
  cardType: 'chance' | 'chest' | null;
  activeDebt: DebtState | null;
  auctionState: AuctionState | null;
  activeTrade: TradeOffer | null;
  pendingForceAcquire: PendingForceAcquire | null;
  pendingRent: PendingRent | null;
  landedBuildMaxHouses: number;
  casinoState: CasinoState | null;
  lastActionDetail: LastActionDetail | null;
  winReason: string | null;
  /** Dev console overrides */
  nextForcedRoll: [number, number] | null;
  nextForcedCard: ForcedCardRequest | null;
  /** Pending dice resolution data while phase === 'rolling_animation' */
  pendingRollResolution?: {
    playerId: string;
    d1: number;
    d2: number;
    mode: 'normal' | 'jail';
    token: string;
  } | null;
  /** Pending casino flip/hold timer token */
  pendingCasinoToken?: string | null;
}

export type MonopolyActionType =
  | 'roll-dice'
  | 'roll-jail-doubles'
  | 'pay-jail-fine'
  | 'use-jail-card'
  | 'buy-property'
  | 'pass-property'
  | 'ok-card'
  | 'build-house'
  | 'sell-house'
  | 'mortgage-property'
  | 'unmortgage-property'
  | 'declare-bankruptcy'
  | 'set-player-status'
  | 'end-turn'
  | 'festival-select'
  | 'festival-skip'
  | 'airport-fly'
  | 'airport-skip'
  | 'force-acquire'
  | 'decline-force-acquire'
  | 'use-angel-rent'
  | 'decline-angel-rent'
  | 'use-angel-force'
  | 'decline-angel-force'
  | 'landed-build'
  | 'landed-build-done'
  | 'go-build'
  | 'go-build-skip'
  | 'casino-flip'
  | 'casino-collect'
  | 'casino-push'
  | 'auction-bid'
  | 'auction-pass'
  | 'trade-propose'
  | 'trade-accept'
  | 'trade-decline'
  | 'trade-counter'
  | 'trade-cancel'
  | 'dev-command';

export type ScheduledEffect =
  | { type: 'resolve-roll'; delayMs: number; token: string }
  | { type: 'resolve-casino-flip'; delayMs: number; token: string }
  | { type: 'finish-casino-hold'; delayMs: number; token: string };

export type EngineEvent =
  | { type: 'system-chat'; text: string }
  | { type: 'action-error'; targetPlayerId: string; message: string }
  | { type: 'trade-rejected'; targetPlayerId: string; receiverName: string }
  | { type: 'game-over'; winnerId: string; reason: string };

export interface EngineStepResult {
  state: RoomState;
  changed: boolean;
  events: EngineEvent[];
  scheduledEffect?: ScheduledEffect;
}

export interface RngSource {
  /** Returns float in [0, 1) */
  next(): number;
}

export const defaultRng: RngSource = {
  next: () => Math.random(),
};
