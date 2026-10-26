// Une partie = un palier (GDD v3, sections 2 et 5). Machine à états pure : l'état complet
// est un objet JSON, sauvegardé avant chaque trade pour reprendre au même endroit.
import { cardDef, unlockedItems, type CardId, type ToolId } from '../data/items.ts';
import {
  applyTrade, createMarket, nextLead, planTrade, readingFor, trimHistory,
  type Candle, type Lead, type Market, type TradeCandles, type TradePlan,
} from './market.ts';
import { createRng, nextFloat, type Rng } from './rng.ts';
import { RULES, bonusTradeCost, multiplier, settle, type Direction, type Modifiers, type Settlement } from './rules.ts';
import { rollOffer, type ShopState } from './shop.ts';
import { getTier, levelFor, type Level } from './tiers.ts';

export type Phase =
  | 'intro' // écran d'objectif avant la séance
  | 'trading' // le joueur enchaîne ses trades
  | 'cashout' // quota atteint avec des trades restants : encaisser ou continuer
  | 'bonus' // plus de trades, quota raté : acheter un trade bonus ou abandonner
  | 'seanceWon'
  | 'shop' // entre deux mois, à partir du palier 2
  | 'won' // dernière séance du palier réussie
  | 'lost';

export interface TradeResult {
  direction: Direction;
  gain: number;
}

export interface RunState {
  version: 2;
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
  /** Outils actifs (5 au plus) et Cartes en main (2 au plus). */
  tools: ToolId[];
  hand: CardId[];
  /** Outils et Cartes débloqués au début de la partie : ce que la boutique peut proposer. */
  pool: { tools: ToolId[]; cards: CardId[] };
  shop: ShopState | null;
  /**
   * Hasard des objets (offre de la boutique, Détecteur, rumeurs), séparé de celui du marché :
   * acheter un Outil ne change pas les bougies qui suivent.
   */
  luck: Rng;
}

/** Ce que les Outils et Cartes montrent avant le choix. */
export interface Hints {
  /** Loupe : bougie du signe à faire clignoter (index dans l'historique). */
  flash: number | null;
  /** Détecteur de faux signaux. */
  verdict: 'fiable' | 'douteux' | null;
  /** Abonnement presse : sens de la news à venir. */
  rumor: 1 | -1 | null;
  /** Terminal pro : 1re bougie du trade. */
  peek: Candle | null;
  /** Rapport d'analyste, une fois la carte jouée. */
  analyst: 'continue' | 'reverse' | null;
}

/** Un trade en préparation : les 12 bougies montrées, la suite déjà tirée et les cartes jouées. */
export interface Deal {
  lead: Lead;
  plan: TradePlan;
  hints: Hints;
  played: CardId[];
}

export function createRun(tier: number, seed: number, pool = unlockedItems([])): RunState {
  const t = getTier(tier);
  return {
    version: 2,
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
    tools: [],
    hand: [],
    pool,
    shop: null,
    luck: createRng(seed ^ 0x51ed27),
  };
}

export const hasTool = (run: RunState, id: ToolId): boolean => run.tools.includes(id);
export const multiMax = (run: RunState): number => (hasTool(run, 'logbook') ? 4 : RULES.multiMax);

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

/** Intérêts versés au début du mois (Outil Intérêts), 0 sans l'Outil. */
export const interestFor = (run: RunState): number => (hasTool(run, 'interest') ? run.capital * 0.02 : 0);

export function startSeance(run: RunState): void {
  expectPhase(run, 'intro');
  run.capital += interestFor(run);
  run.seanceStartCapital = run.capital;
  run.tradesLeft = RULES.tradesPerSeance;
  run.results = [];
  run.lastCashOut = 0;
  run.phase = 'trading';
}

/** Les 12 bougies qui précèdent le trade, la suite tirée d'avance et ce que montrent les Outils. */
export function beginTrade(run: RunState): Deal {
  expectPhase(run, 'trading');
  if (run.tradesLeft <= 0) throw new Error('Plus de trade dans cette séance');
  trimHistory(run.market);
  const level = currentLevel(run);
  const lead = nextLead(run.market, level);
  const plan = planTrade(run.market, level, lead);
  const hints: Hints = { flash: null, verdict: null, rumor: null, peek: null, analyst: null };
  if (hasTool(run, 'loupe') && lead.sign) hints.flash = lead.signIndex;
  if (hasTool(run, 'detector') && lead.sign && nextFloat(run.luck) < 0.5) hints.verdict = lead.fake ? 'douteux' : 'fiable';
  if (hasTool(run, 'press') && plan.news && nextFloat(run.luck) < 0.5) hints.rumor = plan.news.dir;
  if (hasTool(run, 'terminal')) hints.peek = plan.base[0] ?? null;
  return { lead, plan, hints, played: [] };
}

export const canPlayCard = (run: RunState, deal: Deal, id: CardId): boolean =>
  run.phase === 'trading' && run.hand.includes(id) && !deal.played.includes(id);

/** Joue une Carte avant de choisir LONG ou SHORT. */
export function playCard(run: RunState, deal: Deal, id: CardId): void {
  if (!canPlayCard(run, deal, id)) throw new Error(`Carte injouable : ${cardDef(id).name}`);
  run.hand.splice(run.hand.indexOf(id), 1);
  deal.played.push(id);
  if (id === 'tickets') run.tickets += 2;
  if (id === 'overtime') run.tradesLeft += 1;
  if (id === 'analyst') deal.hints.analyst = deal.lead.reverses ? 'reverse' : 'continue';
}

/** Bonus des Outils sur un gain : +30 % tendance suivie, +50 % range, +60 % retournement joué. */
export function toolBonus(run: RunState, lead: Lead, direction: Direction): number {
  let bonus = 0;
  const trend = lead.regime !== 'range';
  if (hasTool(run, 'trend') && trend && !lead.sign && direction === (lead.regime === 'up' ? 'long' : 'short')) bonus += 0.3;
  if (hasTool(run, 'range') && !trend) bonus += 0.5;
  if (hasTool(run, 'contrarian') && trend && lead.reverses && direction === readingFor(lead)) bonus += 0.6;
  return bonus;
}

export function modifiersFor(run: RunState, deal: Deal, direction: Direction): Modifiers {
  return {
    lever: deal.played.includes('leverage') ? 2 : 1,
    bonus: toolBonus(run, deal.lead, direction),
    multiMax: multiMax(run),
    stopLoss: hasTool(run, 'stop-loss'),
    insured: deal.played.includes('insurance'),
    halfStreak: hasTool(run, 'composure'),
  };
}

export interface TradeOutcome {
  entry: number;
  exit: number;
  trade: TradeCandles;
  settlement: Settlement;
  /** Une news a été annulée par la carte Démenti. */
  denied: boolean;
}

/** Le joueur a choisi : les 5 bougies se forment et le trade se règle. */
export function finishTrade(run: RunState, deal: Deal, direction: Direction): TradeOutcome {
  expectPhase(run, 'trading');
  const entry = run.market.price;
  const denied = deal.played.includes('denial') && deal.plan.news !== null;
  const trade: TradeCandles = denied ? { candles: deal.plan.base, news: null } : { candles: deal.plan.candles, news: deal.plan.news };
  applyTrade(run.market, trade.candles);
  const exit = run.market.price;
  const settlement = settle(run.capital, direction, entry, exit, run.streak, modifiersFor(run, deal, direction));
  run.capital += settlement.gain;
  run.streak = settlement.nextStreak;
  run.tradesLeft -= 1;
  run.results.push({ direction, gain: settlement.gain });
  run.stats.trades += 1;
  if (settlement.raw > 0) run.stats.wins += 1;
  run.stats.bestMulti = Math.max(run.stats.bestMulti, settlement.multi);
  run.stats.bestGain = Math.max(run.stats.bestGain, settlement.gain);
  afterTrade(run);
  return { entry, exit, trade, settlement, denied };
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
  if (hasTool(run, 'golden-ticket')) run.tickets += 1;
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

/** Mois suivant : la boutique ouvre d'abord à partir du palier 2. */
export function nextSeance(run: RunState): void {
  expectPhase(run, 'seanceWon');
  run.seance += 1;
  if (run.tier >= 2) {
    run.shop = { offer: rollOffer(run.luck, run.pool, run.tools), rerolls: 0 };
    run.phase = 'shop';
  } else {
    run.phase = 'intro';
  }
}

export const currentMulti = (run: RunState): number => multiplier(run.streak, multiMax(run));
