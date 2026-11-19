// src/engine/cardsData.ts
import type { CardDefinition, RngSource, Ruleset } from './types';

export const CHANCE_CARDS: readonly CardDefinition[] = [
  { id: 'ch_go', text: 'Advance to GO (Collect $200)', action: 'move', target: 0 },
  { id: 'ch_boardwalk', text: 'Advance to New York City', action: 'move', target: 39 },
  { id: 'ch_illinois', text: 'Advance to Shanghai', action: 'move', target: 24 },
  { id: 'ch_stcharles', text: 'Advance to Adelaide', action: 'move', target: 11 },
  {
    id: 'ch_railroad',
    text: 'Advance to nearest Transit Line (Railroad). If unowned, buy it. If owned, pay double rent.',
    action: 'nearest_railroad',
  },
  {
    id: 'ch_utility',
    text: 'Advance to nearest Tourist Spot (Bali or Hawaii). If unowned, buy it. If owned, throw dice and pay 10x multiplier.',
    action: 'nearest_utility',
  },
  { id: 'ch_dividend', text: 'Bank pays you dividend of $50', action: 'give_money', amount: 50 },
  { id: 'ch_jail_free', text: 'Get Out of Jail Free card', action: 'jail_free' },
  { id: 'ch_back3', text: 'Go Back 3 Spaces', action: 'back_spaces', amount: 3 },
  {
    id: 'ch_goto_jail',
    text: 'Go directly to Jail. Do not pass GO, do not collect $200.',
    action: 'goto_jail',
  },
  {
    id: 'ch_repairs',
    text: 'Make general repairs on all your property. Pay $25 per house and $100 per hotel.',
    action: 'repairs',
    houseCost: 25,
    hotelCost: 100,
  },
  { id: 'ch_speeding', text: 'Speeding fine $15', action: 'take_money', amount: 15 },
  {
    id: 'ch_reading',
    text: 'Take a trip to Orient Express. If you pass GO, collect $200.',
    action: 'move',
    target: 5,
  },
  {
    id: 'ch_chairman',
    text: 'You have been elected Chairman of the Board. Pay each player $50.',
    action: 'pay_each',
    amount: 50,
  },
  // Get Rich exclusives
  {
    id: 'ch_odd_even',
    text: 'Odd/Even Card! Use before rolling to force your dice result to be odd or even.',
    action: 'give_odd_even',
    getRichOnly: true,
  },
  {
    id: 'ch_angel',
    text: 'Angel Card! Use to skip paying rent OR block a forced acquisition once.',
    action: 'give_angel',
    getRichOnly: true,
  },
];

export const CHEST_CARDS: readonly CardDefinition[] = [
  { id: 'cc_go', text: 'Advance to GO (Collect $200)', action: 'move', target: 0 },
  { id: 'cc_bank_error', text: 'Bank error in your favor. Collect $200.', action: 'give_money', amount: 200 },
  { id: 'cc_doctor', text: "Doctor's fees. Pay $50.", action: 'take_money', amount: 50 },
  { id: 'cc_sale', text: 'From sale of stock you get $50.', action: 'give_money', amount: 50 },
  { id: 'cc_jail_free', text: 'Get Out of Jail Free card', action: 'jail_free' },
  {
    id: 'cc_goto_jail',
    text: 'Go directly to Jail. Do not pass GO, do not collect $200.',
    action: 'goto_jail',
  },
  { id: 'cc_holiday', text: 'Holiday fund matures. Receive $100.', action: 'give_money', amount: 100 },
  { id: 'cc_tax_refund', text: 'Income tax refund. Collect $20.', action: 'give_money', amount: 20 },
  { id: 'cc_birthday', text: 'It is your birthday. Collect $10 from every player.', action: 'collect_each', amount: 10 },
  { id: 'cc_life', text: 'Life insurance matures. Collect $100.', action: 'give_money', amount: 100 },
  { id: 'cc_hospital', text: 'Pay hospital fees of $100.', action: 'take_money', amount: 100 },
  { id: 'cc_school', text: 'Pay school fees of $50.', action: 'take_money', amount: 50 },
  { id: 'cc_consultancy', text: 'Receive $25 consultancy fee.', action: 'give_money', amount: 25 },
  {
    id: 'cc_street_repairs',
    text: 'You are assessed for street repairs. Pay $40 per house and $115 per hotel.',
    action: 'repairs',
    houseCost: 40,
    hotelCost: 115,
  },
  { id: 'cc_beauty', text: 'You have won second prize in a beauty contest. Collect $10.', action: 'give_money', amount: 10 },
  { id: 'cc_inherit', text: 'You inherit $100.', action: 'give_money', amount: 100 },
  // Get Rich exclusives
  {
    id: 'cc_odd_even',
    text: 'Odd/Even Card! Use before rolling to force your dice result to be odd or even.',
    action: 'give_odd_even',
    getRichOnly: true,
  },
  {
    id: 'cc_angel',
    text: 'Angel Card! Use to skip paying rent OR block a forced acquisition once.',
    action: 'give_angel',
    getRichOnly: true,
  },
];

export function shuffleArray<T>(items: readonly T[], rng: RngSource): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**
 * Bug Fix #5: Filter out Get Rich exclusive cards on BOTH initial deal and reshuffle.
 */
export function buildDeck(type: 'chance' | 'chest', ruleset: Ruleset, rng: RngSource): CardDefinition[] {
  const source = type === 'chance' ? CHANCE_CARDS : CHEST_CARDS;
  const filtered = ruleset === 'Get Rich' ? source : source.filter((c) => !c.getRichOnly);
  return shuffleArray(filtered, rng);
}
