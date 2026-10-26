// Une partie = un palier (GDD v3, sections 2 et 5). Machine à états pure : l'état complet
// est un objet JSON, sauvegardé avant chaque trade pour reprendre au même endroit.
import { createMarket, nextLead, tradeCandles, trimHistory, type Lead, type Market, type TradeCandles } from './market.ts';
import { RULES, bonusTradeCost, multiplier, settle, type Direction, type Settlement } from './rules.ts';
import { getTier, levelFor, type Level } from './tiers.ts';

export type Phase =
  | 'intro' // écran d'objectif avant la séance
  | 'trading' // le joueur enchaîne ses trades
  | 'cashout' // quota atteint avec des trades restants : encaisser ou continuer
  | 'bonus' // plus de trades, quota raté : acheter un trade bonus ou abandonner
  | 'seanceWon'
  | 'won' // dernière séance du palier réussie
  | 'lost';

export interface TradeResult {
  direction: Direction;
  gain: number;
}

export interface RunState {
  version: 1;
  tier: number;
  seed: number;
  seance: number;
  phase: Phase;
  capital: number;
  seanceStartCapital: number;
  streak: number;
  tickets: number;
  /** Trades bonus achetés depuis le début de la partie (leur prix monte : 1, 2, 3… tickets). */
  bonusBought: number;
  tradesLeft: number;
  results: TradeResult[];
  /** Tickets gagnés en encaissant à la dernière séance réussie. */
  lastCashOut: number;
  stats: { trades: number; wins: number; bestMulti: number; bestGain: number };
  market: Market;
}

export function createRun(tier: number, seed: number): RunState {
  const t = getTier(tier);
  return {
    version: 1,
    tier,
    seed,
    seance: 0,
    phase: 'intro',
    capital: RULES.startCapital,
    seanceStartCapital: RULES.startCapital,
    streak: 0,
    tickets: 0,
    bonusBought: 0,
    tradesLeft: 0,
    results: [],
    lastCashOut: 0,
    stats: { trades: 0, wins: 0, bestMulti: 1, bestGain: 0 },
    market: createMarket(seed, t.ticker),
  };
}

export const seanceCount = (run: RunState): number => getTier(run.tier).quotas.length;
export const quota = (run: RunState): number => getTier(run.tier).quotas[run.seance] ?? 0;
export const seanceGain = (run: RunState): number => run.capital - run.seanceStartCapital;
export const remainingToQuota = (run: RunState): number => Math.max(0, quota(run) - seanceGain(run));
export const nextBonusCost = (run: RunState): number => bonusTradeCost(run.bonusBought);
export const canBuyBonus = (run: RunState): boolean => run.tickets >= nextBonusCost(run);
export const currentLevel = (run: RunState): Level => levelFor(getTier(run.tier), run.seance, RULES.drift);

function expectPhase(run: RunState, ...phases: Phase[]): void {
  if (!phases.includes(run.phase)) throw new Error(`Action impossible en phase « ${run.phase} »`);
}

export function startSeance(run: RunState): void {
  expectPhase(run, 'intro');
  run.seanceStartCapital = run.capital;
  run.tradesLeft = RULES.tradesPerSeance;
  run.results = [];
  run.lastCashOut = 0;
  run.phase = 'trading';
}

/** Les 12 bougies qui précèdent le trade. Appelée au début de chaque trade. */
export function beginTrade(run: RunState): Lead {
  expectPhase(run, 'trading');
  if (run.tradesLeft <= 0) throw new Error('Plus de trade dans cette séance');
  trimHistory(run.market);
  return nextLead(run.market, currentLevel(run));
}

export interface TradeOutcome {
  entry: number;
  exit: number;
  trade: TradeCandles;
  settlement: Settlement;
}

/** Le joueur a choisi : le marché forme les 5 bougies et le trade se règle. */
export function finishTrade(run: RunState, lead: Lead, direction: Direction): TradeOutcome {
  expectPhase(run, 'trading');
  const entry = run.market.price;
  const trade = tradeCandles(run.market, currentLevel(run), lead);
  const exit = run.market.price;
  const settlement = settle(run.capital, direction, entry, exit, run.streak);
  run.capital += settlement.gain;
  run.streak = settlement.nextStreak;
  run.tradesLeft -= 1;
  run.results.push({ direction, gain: settlement.gain });
  run.stats.trades += 1;
  if (settlement.raw > 0) run.stats.wins += 1;
  run.stats.bestMulti = Math.max(run.stats.bestMulti, settlement.multi);
  run.stats.bestGain = Math.max(run.stats.bestGain, settlement.gain);
  afterTrade(run);
  return { entry, exit, trade, settlement };
}

function afterTrade(run: RunState): void {
  if (seanceGain(run) >= quota(run)) {
    if (run.tradesLeft > 0) run.phase = 'cashout';
    else completeSeance(run);
  } else if (run.tradesLeft > 0) {
    run.phase = 'trading';
  } else {
    run.phase = canBuyBonus(run) ? 'bonus' : 'lost';
  }
}

function completeSeance(run: RunState): void {
  run.phase = run.seance + 1 >= seanceCount(run) ? 'won' : 'seanceWon';
}

/** Encaisser : la séance est réussie et chaque trade restant donne un ticket. */
export function cashOut(run: RunState): void {
  expectPhase(run, 'cashout');
  run.lastCashOut = run.tradesLeft;
  run.tickets += run.tradesLeft;
  run.tradesLeft = 0;
  completeSeance(run);
}

/** Continuer : le joueur garde ses trades et peut repasser sous le quota. */
export function keepTrading(run: RunState): void {
  expectPhase(run, 'cashout');
  run.phase = 'trading';
}

export function buyBonusTrade(run: RunState): void {
  expectPhase(run, 'bonus');
  const cost = nextBonusCost(run);
  if (run.tickets < cost) throw new Error('Pas assez de tickets');
  run.tickets -= cost;
  run.bonusBought += 1;
  run.tradesLeft = 1;
  run.phase = 'trading';
}

export function giveUp(run: RunState): void {
  expectPhase(run, 'bonus');
  run.phase = 'lost';
}

export function nextSeance(run: RunState): void {
  expectPhase(run, 'seanceWon');
  run.seance += 1;
  run.phase = 'intro';
}

export const currentMulti = (run: RunState): number => multiplier(run.streak);
