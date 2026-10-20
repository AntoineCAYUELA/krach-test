// Machine à états d'une run et d'une séance (GDD 2.1 à 2.3, 4, 8).
// Tout l'état est un objet JSON simple : il se sauvegarde tel quel dans le localStorage.

import { CONFIG } from '../config.ts';
import { RANDOM_EVENT_IDS } from '../data/events.ts';
import { CARD_IDS, cardContext, checkCard, startingDeck, type CardCheck, type CardContext } from './cards.ts';
import { advanceMarket, createMarket, lastCandle, peekFuture, type MarketState } from './market.ts';
import { createRng, deriveSeed, nextFloat, pick, shuffle, type RngState } from './rng.ts';
import { computeChance, marketContext, riskUnit, type Chance } from './forecast.ts';
import { addPerformance, classifySetup, computeMulti, scoreTrade, type MultiBreakdown, type SetupResult, type TradeScore } from './scoring.ts';
import { previewTrade, resolveTrade, type TradeCosts, type TradeOrder, type TradePreview, type TradeResult } from './trade.ts';
import type { CardId, ConsumableId, Direction, EventId, MarketContext, Regime, SetupType, SizeId, ToolId } from './types.ts';
import { GameError } from './errors.ts';
import {
  addStress,
  createLife,
  fatigueDelta,
  nextUpgrade,
  stressState,
  tradeStressDelta,
  type EntracteState,
  type LifeState,
  type SeanceStress,
  type TradeStress,
  type Upgrade,
} from './life.ts';
import { createShop } from './shop.ts';
import type { ActivityId, HomeId, SetupId } from './types.ts';

export type RunPhase = 'briefing' | 'seance' | 'summary' | 'entracte' | 'shop' | 'victory' | 'defeat';
export type DefeatCause = 'quota' | 'liquidation';

export { GameError };

export interface StockInfo {
  ticker: string;
  name: string;
  profile: string;
  /** Volatilité de l'action, avant l'éventuelle contrainte d'événement. */
  sigma: number;
}

export interface TradeRecord {
  number: number;
  direction: Direction;
  size: SizeId;
  /** Chance affichée au moment de l'ordre (GDD 2.7). */
  chance: Chance;
  playedCards: CardId[];
  setup: SetupResult;
  trade: TradeResult;
  /** P&L net réellement appliqué au capital (après Couverture). */
  pnlNet: number;
  hedged: boolean;
  multi: MultiBreakdown;
  score: TradeScore;
  twoPercentOk: boolean;
  /** Primes gagnées pendant ce trade (Stop-loss discipliné). */
  primesBonus: number;
  /** Index, dans market.candles, de la bougie d'entrée (la dernière close au moment de l'ordre). */
  entryCandleIndex: number;
  capitalBefore: number;
  capitalAfter: number;
  performanceAfter: number;
  /** Stress pris par ce trade (GDD 13.2), null si la vie du trader est désactivée. */
  stress: TradeStress | null;
}

export interface SeanceRewards {
  base: number;
  unusedOrders: number;
  interest: number;
  total: number;
}

export interface SeanceState {
  index: number;
  quota: number;
  event: EventId | null;
  stock: StockInfo;
  market: MarketState;
  rng: RngState;
  drawPile: CardId[];
  discardPile: CardId[];
  hand: CardId[];
  orders: number;
  discards: number;
  candlesLeft: number;
  performance: number;
  trades: TradeRecord[];
  hedgeActive: boolean;
  /** Rapport d'analyste : bonus de chance sur le prochain trade. */
  analystBoost: boolean;
  /** Boule de cristal : l'issue du prochain trade est visible sur le ticket. */
  crystalBall: boolean;
  /** Tirage (0 à 1) du prochain trade : take-profit si tirage < chance (GDD 2.7). */
  roll: number;
  rollRng: RngState;
  capitalAtStart: number;
  status: 'playing' | 'won' | 'lost' | 'liquidated';
  rewards: SeanceRewards | null;
  /** Stress de la séance (GDD 13.2), null si la vie du trader est désactivée. */
  stress: SeanceStress | null;
}

export interface SeanceHistory {
  index: number;
  quota: number;
  performance: number;
  won: boolean;
  capitalStart: number;
  capitalEnd: number;
}

export interface ShopState {
  tools: (ToolId | null)[];
  consumables: (ConsumableId | null)[];
  rerolls: number;
  rng: RngState;
}

export interface RunState {
  version: 3;
  seed: number;
  phase: RunPhase;
  defeatCause: DefeatCause | null;
  capital: number;
  primes: number;
  deck: CardId[];
  tools: ToolId[];
  consumables: ConsumableId[];
  formations: Partial<Record<SetupType, number>>;
  journalBonus: number;
  /** Nombre de Packs de signaux ouverts : graine des cartes proposées. */
  packCounter: number;
  seanceIndex: number;
  /** Événement de chaque séance (null = séance normale). */
  events: (EventId | null)[];
  seance: SeanceState | null;
  shop: ShopState | null;
  history: SeanceHistory[];
  bestTrade: { pnlNet: number; seance: number; direction: Direction } | null;
  tradeCount: number;
  /** Vie du trader (GDD 13) ; null quand elle est désactivée (simulation de référence du GDD 7.3). */
  life: LifeState | null;
  entracte: EntracteState | null;
}

export interface RunOptions {
  /** Impose les événements des 8 séances (simulation, tests). */
  events?: (EventId | null)[];
  /** false : sans stress ni entracte, comme dans le GDD 7.3. */
  life?: boolean;
}

// ---------------------------------------------------------------------------
// Création

export function createRun(seed: number, options: RunOptions = {}): RunState {
  const run: RunState = {
    version: 3,
    seed,
    phase: 'briefing',
    defeatCause: null,
    capital: CONFIG.run.startingCapital,
    primes: CONFIG.run.startingPrimes,
    deck: startingDeck(),
    tools: [],
    consumables: [],
    formations: {},
    journalBonus: 0,
    packCounter: 0,
    seanceIndex: 0,
    events: options.events ?? drawEvents(seed),
    seance: null,
    shop: null,
    history: [],
    bestTrade: null,
    tradeCount: 0,
    life: options.life === false ? null : createLife(),
    entracte: null,
  };
  run.seance = prepareSeance(run);
  return run;
}

/** Séances 2, 4 et 6 : tirage sans remise ; séance 8 : Krach (GDD 7.2). */
function drawEvents(seed: number): (EventId | null)[] {
  const rng = createRng(deriveSeed(seed, 'events'));
  const pool = shuffle(rng, [...RANDOM_EVENT_IDS]);
  const events: (EventId | null)[] = Array<EventId | null>(CONFIG.run.seanceCount).fill(null);
  CONFIG.run.randomEventSeances.forEach((index, i) => {
    events[index] = pool[i] ?? null;
  });
  events[CONFIG.run.finalEventSeance] = 'crash';
  return events;
}

function prepareSeance(run: RunState): SeanceState {
  const index = run.seanceIndex;
  const event = run.events[index] ?? null;
  const stockDef = pick(createRng(deriveSeed(run.seed, 'stock', index)), CONFIG.stocks);
  const E = CONFIG.events;
  let sigma: number = stockDef.sigma;
  if (event === 'lowVolatility') sigma *= E.lowVolatility.sigmaMultiplier;
  if (event === 'crash') sigma *= E.crash.sigmaMultiplier;
  const forcedRegime: Regime | undefined = event === 'rangeMarket' ? E.rangeMarket.forcedRegime : event === 'crash' ? E.crash.forcedRegime : undefined;
  const params = {
    ticker: stockDef.ticker,
    sigma,
    baseVolume: stockDef.baseVolume,
    startPrice: stockDef.startPrice,
    newsProb: event === 'earningsDay' ? E.earningsDay.newsProb : CONFIG.market.newsProb,
    ...(forcedRegime ? { forcedRegime } : {}),
  };
  const market = createMarket(params, deriveSeed(run.seed, 'market', index));
  const rng = createRng(deriveSeed(run.seed, 'deck', index));
  const rollRng = createRng(deriveSeed(run.seed, 'roll', index));
  const seance: SeanceState = {
    index,
    quota: CONFIG.run.quotas[index] ?? Infinity,
    event,
    stock: { ticker: stockDef.ticker, name: stockDef.name, profile: stockDef.profile, sigma: stockDef.sigma },
    market,
    rng,
    drawPile: shuffle(rng, [...run.deck]),
    discardPile: [],
    hand: [],
    orders: CONFIG.seance.orders,
    discards: CONFIG.seance.discards,
    candlesLeft: CONFIG.seance.candles,
    performance: 0,
    trades: [],
    hedgeActive: false,
    analystBoost: false,
    crystalBall: false,
    roll: nextFloat(rollRng),
    rollRng,
    capitalAtStart: run.capital,
    status: 'playing',
    rewards: null,
    stress: seanceStress(run.life, event),
  };
  drawUpTo(seance);
  return seance;
}

/** Stress fixé au briefing : la séance à événement ajoute son stress avant que l'état soit fixé (GDD 13.2). */
function seanceStress(life: LifeState | null, event: EventId | null): SeanceStress | null {
  if (!life) return null;
  const before = life.stress;
  if (event) addStress(life, CONFIG.life.eventSeance);
  return { start: life.stress, event: life.stress - before, state: stressState(life.stress), fatigue: null };
}

/** Briefing → séance. */
export function beginSeance(run: RunState): void {
  if (run.phase !== 'briefing' || !run.seance) throw new GameError('Aucune séance à commencer');
  run.phase = 'seance';
  if (run.life) run.life.tripReview = false;
}

// ---------------------------------------------------------------------------
// Règles dérivées des Outils et des événements

export function hasTool(run: RunState, id: ToolId): boolean {
  return run.tools.includes(id);
}

export function currentCosts(run: RunState): TradeCosts {
  const multiplier = run.seance?.event === 'doubleFees' ? CONFIG.events.doubleFees.costMultiplier : 1;
  return {
    spread: (hasTool(run, 'marketMaker') ? CONFIG.tools.marketMaker.spread : CONFIG.costs.spread) * multiplier,
    feePerSide: (hasTool(run, 'lowCostBroker') ? CONFIG.tools.lowCostBroker.feePerSide : CONFIG.costs.feePerSide) * multiplier,
  };
}

export const SIZE_NAMES: Record<SizeId, string> = { prudent: 'Prudent', normal: 'Normal', aggressive: 'Agressif' };

/** Mise et levier d'une taille de position (GDD 2.3). */
export function sizeOrder(run: RunState, size: SizeId): { stake: number; leverage: number } {
  const def = CONFIG.sizes[size];
  const leverage = size === 'aggressive' && hasTool(run, 'leverage') ? CONFIG.sizes.aggressive.toolLeverage : def.leverage;
  return { stake: run.capital * def.stakePct, leverage };
}

/** Distances du stop-loss et du take-profit, en unités de risque u (GDD 2.7). */
export function bracketUnits(run: RunState): { stop: number; take: number } {
  return {
    stop: CONFIG.forecast.stopUnits,
    take: hasTool(run, 'takeProfit') ? CONFIG.tools.takeProfit.takeUnits : CONFIG.forecast.takeUnits,
  };
}

/** Contexte de marché visible sur la dernière bougie close (GDD 2.7). */
export function currentContext(run: RunState): MarketContext {
  const ctx = handContext(run);
  const last = ctx.candles[ctx.candles.length - 1];
  return marketContext(ctx.snap, last?.c ?? 0);
}

export function allowedDurations(run: RunState): number[] {
  return hasTool(run, 'scalper') ? [CONFIG.seance.tradeDuration, CONFIG.seance.scalpDuration] : [CONFIG.seance.tradeDuration];
}

/** Durée la plus courte possible : la séance s'arrête quand il reste moins de bougies. */
export function minDuration(run: RunState): number {
  return Math.min(...allowedDurations(run));
}

function requireSeance(run: RunState): SeanceState {
  const seance = run.seance;
  if (run.phase !== 'seance' || !seance || seance.status !== 'playing') throw new GameError('Aucune séance en cours');
  return seance;
}

export function handContext(run: RunState): CardContext {
  if (!run.seance) throw new GameError('Aucune séance');
  return cardContext(run.seance.market.candles, run.tools);
}

/** Validité de chaque carte de la main pour une direction (✔/✘ et raison). */
export function evaluateHand(run: RunState, direction: Direction): CardCheck[] {
  const ctx = handContext(run);
  return (run.seance?.hand ?? []).map((id) => checkCard(id, direction, ctx));
}

// ---------------------------------------------------------------------------
// Pioche

function drawUpTo(seance: SeanceState): void {
  while (seance.hand.length < CONFIG.seance.handSize) {
    if (seance.drawPile.length === 0) {
      if (seance.discardPile.length === 0) return;
      seance.drawPile = shuffle(seance.rng, seance.discardPile);
      seance.discardPile = [];
    }
    const card = seance.drawPile.pop();
    if (card) seance.hand.push(card);
  }
}

function removeFromHand(seance: SeanceState, indices: readonly number[]): CardId[] {
  const unique = [...new Set(indices)].sort((a, b) => b - a);
  for (const i of unique) {
    if (i < 0 || i >= seance.hand.length) throw new GameError('Carte inexistante');
  }
  const removed: CardId[] = [];
  for (const i of unique) removed.unshift(...seance.hand.splice(i, 1));
  return removed;
}

// ---------------------------------------------------------------------------
// Actions du tour (GDD 2.3 étape 3)

/** Défausser 1 à 7 cartes et repiocher. Coût : 1 défausse. */
export function discardCards(run: RunState, indices: readonly number[]): void {
  const seance = requireSeance(run);
  if (seance.discards <= 0) throw new GameError('Plus de défausse disponible');
  if (indices.length < 1 || indices.length > CONFIG.seance.handSize) throw new GameError(`Choisis de 1 à ${CONFIG.seance.handSize} cartes`);
  const removed = removeFromHand(seance, indices);
  seance.discardPile.push(...removed);
  seance.discards--;
  drawUpTo(seance);
}

/** Passer : le marché avance d'une bougie. Coût : 1 bougie. */
export function passCandle(run: RunState): void {
  const seance = requireSeance(run);
  if (seance.candlesLeft < 1) throw new GameError('Plus de bougie disponible');
  advanceMarket(seance.market);
  seance.candlesLeft--;
  checkSeanceEnd(run);
}

export interface PositionInput {
  direction: Direction;
  size: SizeId;
  duration: number;
  /** Index des cartes de la main jouées (0 à 3). */
  cardIndices: number[];
}

export interface PositionPreview {
  preview: TradePreview;
  /** Ordre envoyé au moteur de résolution (mise, levier, distances du stop et du take-profit). */
  order: TradeOrder;
  chance: Chance;
  setup: SetupResult;
  multi: MultiBreakdown;
  twoPercentOk: boolean;
  /** P&L net au take-profit (> 0) et au stop-loss (< 0), avant Couverture. */
  gainAtTake: number;
  lossAtStop: number;
  /** Espérance de gain : chance × gain + (1 − chance) × perte, avant Couverture. */
  expectancy: number;
  /** Risque du trade (perte au stop) en fraction du capital. */
  riskPct: number;
  /** Boule de cristal : issue prévue pour ce ticket (hors news), sinon null. */
  crystal: 'takeProfit' | 'stopLoss' | null;
  /** Raison qui empêche d'ouvrir la position, ou null. */
  error: string | null;
}

export function previewPosition(run: RunState, input: PositionInput): PositionPreview {
  const seance = run.seance;
  if (!seance) throw new GameError('Aucune séance');
  const costs = currentCosts(run);
  const { stake, leverage } = sizeOrder(run, input.size);
  const units = bracketUnits(run);
  const u = riskUnit(seance.market.params.sigma, input.duration);
  const order: TradeOrder = { direction: input.direction, stake, leverage, stopLossPct: units.stop * u, takeProfitPct: units.take * u, duration: input.duration };
  const preview = previewTrade(lastCandle(seance.market).c, order, costs);
  const ctx = handContext(run);
  const played = input.cardIndices.map((i) => seance.hand[i]).filter((id): id is CardId => id !== undefined);
  const valid = played.filter((id) => checkCard(id, input.direction, ctx).valid);
  const setup = classifySetup(valid);
  const chance = computeChance({
    context: currentContext(run),
    direction: input.direction,
    validCards: setup.validCards,
    stopUnits: units.stop,
    takeUnits: units.take,
    ...(seance.analystBoost ? { extraBonus: { label: 'Rapport d’analyste', value: CONFIG.consumables.analystReport.chanceBonus } } : {}),
  });
  const twoPercentOk = preview.notional * (order.stopLossPct ?? 0) <= CONFIG.tools.twoPercentRule.maxRiskPct * run.capital;
  const multi = computeMulti({
    setup,
    direction: input.direction,
    tools: run.tools,
    trendSlope: ctx.snap.trendSlope,
    duration: input.duration,
    twoPercentOk,
    journalBonus: run.journalBonus,
    formationBonus: run.formations[setup.type] ?? 0,
    ...(seance.stress ? { stressState: seance.stress.state } : {}),
  });
  const gainAtTake = netAt(preview.notional, preview.entryPrice, preview.takePrice ?? preview.entryPrice, input.direction, costs);
  const lossAtStop = Math.max(-stake, preview.lossAtStop ?? -stake);
  return {
    preview,
    order,
    chance,
    setup,
    multi,
    twoPercentOk,
    gainAtTake,
    lossAtStop,
    expectancy: chance.value * gainAtTake + (1 - chance.value) * lossAtStop,
    riskPct: run.capital > 0 ? -lossAtStop / run.capital : 0,
    crystal: seance.crystalBall ? (seance.roll < chance.value ? 'takeProfit' : 'stopLoss') : null,
    error: positionError(run, input, stake),
  };
}

/** P&L net d'une sortie à `exit` (spread et frais compris). */
function netAt(notional: number, entry: number, exit: number, direction: Direction, costs: TradeCosts): number {
  const d = direction === 'long' ? 1 : -1;
  const exitAdjusted = exit * (1 - (d * costs.spread) / 2);
  return notional * d * (exitAdjusted / entry - 1) - 2 * costs.feePerSide * notional;
}

function positionError(run: RunState, input: PositionInput, stake: number): string | null {
  const seance = run.seance;
  if (!seance || run.phase !== 'seance' || seance.status !== 'playing') return 'Aucune séance en cours';
  if (seance.orders <= 0) return 'Plus d’ordre disponible';
  if (!allowedDurations(run).includes(input.duration)) return 'Durée non autorisée';
  if (seance.candlesLeft < input.duration) return 'Pas assez de bougies restantes';
  if (!(input.size in CONFIG.sizes)) return 'Taille inconnue';
  if (!(stake >= CONFIG.run.minStake)) return `Mise minimale : ${CONFIG.run.minStake} $`;
  if (input.cardIndices.length > CONFIG.seance.maxPlayedCards) return `${CONFIG.seance.maxPlayedCards} cartes maximum`;
  if (new Set(input.cardIndices).size !== input.cardIndices.length) return 'Carte jouée deux fois';
  if (input.cardIndices.some((i) => i < 0 || i >= seance.hand.length)) return 'Carte inexistante';
  return null;
}

/** Ouvre et résout une position (GDD 2.3 étapes 4 à 9). */
export function openPosition(run: RunState, input: PositionInput): TradeRecord {
  const seance = requireSeance(run);
  const planned = previewPosition(run, input);
  if (planned.error) throw new GameError(planned.error);
  const ctx = handContext(run);
  const entryCandleIndex = seance.market.candles.length - 1;

  const win = seance.roll < planned.chance.value;
  const trade = resolveTrade(seance.market, planned.order, currentCosts(run), win);
  seance.roll = nextFloat(seance.rollRng);
  seance.analystBoost = false;
  seance.crystalBall = false;
  seance.candlesLeft -= input.duration;
  seance.orders--;

  const hedged = seance.hedgeActive;
  seance.hedgeActive = false;
  const pnlNet = hedged ? trade.pnlNet * CONFIG.consumables.hedge.pnlFactor : trade.pnlNet;

  const multi = computeMulti({
    setup: planned.setup,
    direction: input.direction,
    tools: run.tools,
    trendSlope: ctx.snap.trendSlope,
    duration: input.duration,
    twoPercentOk: planned.twoPercentOk,
    journalBonus: run.journalBonus,
    formationBonus: run.formations[planned.setup.type] ?? 0,
    ...(seance.stress ? { stressState: seance.stress.state } : {}),
  });
  const disciplined = trade.exitReason === 'stopLoss' && hasTool(run, 'stopLoss');
  const score = scoreTrade(pnlNet, multi.total, disciplined ? CONFIG.tools.stopLoss.lossFactor : CONFIG.scoring.lossFactor);

  let primesBonus = 0;
  if (trade.exitReason === 'stopLoss' && hasTool(run, 'stopLoss')) primesBonus = CONFIG.tools.stopLoss.primesPerStop;
  run.primes += primesBonus;

  if (hasTool(run, 'tradingJournal') && pnlNet > 0 && planned.setup.validCards.length >= CONFIG.tools.tradingJournal.minValidCards) {
    run.journalBonus = Math.min(CONFIG.tools.tradingJournal.cap, run.journalBonus + CONFIG.tools.tradingJournal.multiPerWin);
  }

  const capitalBefore = run.capital;
  run.capital += pnlNet;
  seance.performance = addPerformance(seance.performance, score.performance);

  let stress: TradeStress | null = null;
  if (run.life) {
    const delta = tradeStressDelta(run.life, { pnlNet, capitalBefore, leverage: planned.order.leverage, liquidated: trade.exitReason === 'liquidation' });
    addStress(run.life, delta);
    stress = { delta, after: run.life.stress };
  }

  const playedCards = removeFromHand(seance, input.cardIndices);
  seance.discardPile.push(...playedCards);
  drawUpTo(seance);

  const record: TradeRecord = {
    number: seance.trades.length + 1,
    direction: input.direction,
    size: input.size,
    chance: planned.chance,
    playedCards,
    setup: planned.setup,
    trade,
    pnlNet,
    hedged,
    multi,
    score,
    twoPercentOk: planned.twoPercentOk,
    primesBonus,
    entryCandleIndex,
    capitalBefore,
    capitalAfter: run.capital,
    performanceAfter: seance.performance,
    stress,
  };
  seance.trades.push(record);
  run.tradeCount++;
  if (!run.bestTrade || pnlNet > run.bestTrade.pnlNet) run.bestTrade = { pnlNet, seance: seance.index, direction: input.direction };

  checkSeanceEnd(run);
  return record;
}

/** Fin de séance (GDD 2.2 et 8). */
function checkSeanceEnd(run: RunState): void {
  const seance = run.seance;
  if (!seance || seance.status !== 'playing') return;
  if (run.capital < CONFIG.run.minStake) {
    seance.status = 'liquidated';
    endRun(run, 'liquidation');
  } else if (seance.performance >= seance.quota) {
    seance.status = 'won';
    if (run.life && seance.stress) {
      seance.stress.fatigue = fatigueDelta(run.life);
      addStress(run.life, seance.stress.fatigue);
    }
    seance.rewards = computeRewards(run, seance);
    run.primes += seance.rewards.total;
    recordHistory(run, seance, true);
    run.phase = 'summary';
  } else if (seance.orders <= 0 || seance.candlesLeft < minDuration(run)) {
    seance.status = 'lost';
    endRun(run, 'quota');
  }
}

function endRun(run: RunState, cause: DefeatCause): void {
  if (run.seance) recordHistory(run, run.seance, false);
  run.phase = 'defeat';
  run.defeatCause = cause;
}

function recordHistory(run: RunState, seance: SeanceState, won: boolean): void {
  run.history.push({
    index: seance.index,
    quota: seance.quota,
    performance: seance.performance,
    won,
    capitalStart: seance.capitalAtStart,
    capitalEnd: run.capital,
  });
}

/** Primes de fin de séance réussie (GDD 4). */
export function computeRewards(run: RunState, seance: SeanceState): SeanceRewards {
  const R = CONFIG.rewards;
  const base = seance.event ? R.eventSeance : R.normalSeance;
  const unusedOrders = seance.orders * R.perUnusedOrder;
  const interest = Math.min(R.interestMax, Math.floor(run.capital / R.interestStep));
  return { base, unusedOrders, interest, total: base + unusedOrders + interest };
}

/** Bilan → entracte (ou boutique sans la vie du trader), ou victoire après la séance 8. */
export function finishSummary(run: RunState): void {
  if (run.phase !== 'summary') throw new GameError('Pas de bilan en cours');
  if (run.seanceIndex >= CONFIG.run.seanceCount - 1) {
    run.phase = 'victory';
    return;
  }
  if (run.life) {
    openEntracte(run, run.life);
    return;
  }
  openShop(run);
}

function openShop(run: RunState): void {
  run.phase = 'shop';
  run.shop = createShop(run);
}

/** Boutique → briefing de la séance suivante. */
export function leaveShop(run: RunState): void {
  if (run.phase !== 'shop') throw new GameError('Pas de boutique ouverte');
  run.shop = null;
  nextSeance(run);
}

function nextSeance(run: RunState): void {
  run.seanceIndex++;
  run.seance = prepareSeance(run);
  run.phase = 'briefing';
}

// ---------------------------------------------------------------------------
// Entracte (GDD 13.3) : salaire, nuit au logement, activité, améliorations

function openEntracte(run: RunState, life: LifeState): void {
  const L = CONFIG.life;
  const stressBefore = life.stress;
  const recovery = L.homes[life.home].recovery;
  addStress(life, -recovery);
  life.savings += L.salary;
  run.entracte = { salary: L.salary, stressBefore, recovery, activity: null };
  run.phase = 'entracte';
}

function requireEntracte(run: RunState): { life: LifeState; entracte: EntracteState } {
  if (run.phase !== 'entracte' || !run.life || !run.entracte) throw new GameError('Pas d’entracte en cours');
  return { life: run.life, entracte: run.entracte };
}

/** Une activité au plus par entracte, payée sur l'épargne. */
export function chooseActivity(run: RunState, id: ActivityId): void {
  const { life, entracte } = requireEntracte(run);
  if (entracte.activity) throw new GameError('Une seule activité par entracte');
  const activity = CONFIG.life.activities[id];
  if (life.savings < activity.price) throw new GameError('Épargne insuffisante');
  life.savings -= activity.price;
  addStress(life, -activity.relief);
  entracte.activity = id;
  if (id === 'trip') life.tripReview = true;
}

/** Achète le niveau suivant du poste ou du logement. */
export function buyUpgrade(run: RunState, kind: Upgrade): SetupId | HomeId {
  const { life } = requireEntracte(run);
  const next = nextUpgrade(life, kind);
  if (!next) throw new GameError('Déjà au dernier niveau');
  if (life.savings < next.price) throw new GameError('Épargne insuffisante');
  life.savings -= next.price;
  if (kind === 'setup') life.setup = next.id as SetupId;
  else life.home = next.id as HomeId;
  return next.id;
}

/** Entracte → boutique ; après un Voyage, la boutique est sautée (GDD 13.3). */
export function leaveEntracte(run: RunState): void {
  const { entracte } = requireEntracte(run);
  run.entracte = null;
  if (entracte.activity === 'trip') nextSeance(run);
  else openShop(run);
}

// ---------------------------------------------------------------------------
// Consommables (GDD 6.1)

export type ConsumableChoice = { setupType: SetupType } | { addCard: CardId } | { removeCard: CardId };

export interface ConsumableOutcome {
  message: string;
}

export function canUseConsumable(run: RunState, id: ConsumableId): boolean {
  if (run.phase === 'seance' && run.seance?.status === 'playing') {
    if (id === 'hedge') return !run.seance.hedgeActive;
    if (id === 'analystReport') return !run.seance.analystBoost;
    if (id === 'crystalBall') return !run.seance.crystalBall;
    return true;
  }
  return run.phase === 'shop' && (id === 'training' || id === 'signalPack');
}

/** Les 3 cartes proposées par le prochain Pack de signaux (déterministe). */
export function signalPackOffers(run: RunState): CardId[] {
  const rng = createRng(deriveSeed(run.seed, 'pack', run.packCounter));
  return shuffle(rng, [...CARD_IDS]).slice(0, CONFIG.consumables.signalPack.choices);
}

export function useConsumable(run: RunState, slot: number, choice?: ConsumableChoice): ConsumableOutcome {
  const id = run.consumables[slot];
  if (!id) throw new GameError('Emplacement vide');
  if (!canUseConsumable(run, id)) throw new GameError('Ce consommable n’est pas utilisable maintenant');
  const seance = run.seance;
  let message: string;

  switch (id) {
    case 'analystReport': {
      if (!seance) throw new GameError('Aucune séance');
      seance.analystBoost = true;
      message = `Rapport lu : +${CONFIG.consumables.analystReport.chanceBonus} % de chance sur le prochain trade.`;
      break;
    }
    case 'training': {
      if (!choice || !('setupType' in choice)) throw new GameError('Choisis un type de setup');
      run.formations[choice.setupType] = (run.formations[choice.setupType] ?? 0) + CONFIG.consumables.training.multiBonus;
      message = 'Formation suivie : bonus de Multi permanent ajouté.';
      break;
    }
    case 'signalPack': {
      if (!choice) throw new GameError('Choisis une carte à ajouter ou à retirer');
      if ('addCard' in choice) {
        if (!signalPackOffers(run).includes(choice.addCard)) throw new GameError('Carte non proposée');
        run.deck.push(choice.addCard);
        if (seance && run.phase === 'seance') {
          seance.drawPile.push(choice.addCard);
          shuffle(seance.rng, seance.drawPile);
        }
        message = 'Carte ajoutée au deck.';
      } else if ('removeCard' in choice) {
        const index = run.deck.indexOf(choice.removeCard);
        if (index < 0) throw new GameError('Carte absente du deck');
        run.deck.splice(index, 1);
        if (seance && run.phase === 'seance') {
          const pile = seance.drawPile.includes(choice.removeCard) ? seance.drawPile : seance.discardPile;
          const i = pile.indexOf(choice.removeCard);
          if (i >= 0) pile.splice(i, 1);
        }
        message = 'Carte retirée du deck.';
      } else throw new GameError('Choix invalide');
      run.packCounter++;
      break;
    }
    case 'hedge': {
      if (!seance) throw new GameError('Aucune séance');
      seance.hedgeActive = true;
      message = 'Couverture active sur le prochain trade.';
      break;
    }
    case 'extraOrder': {
      if (!seance) throw new GameError('Aucune séance');
      seance.orders += CONFIG.consumables.extraOrder.orders;
      message = 'Ordre supplémentaire ajouté.';
      break;
    }
    case 'crystalBall': {
      if (!seance) throw new GameError('Aucune séance');
      seance.crystalBall = true;
      message = 'L’issue du prochain trade s’affiche sur le ticket.';
      break;
    }
  }
  run.consumables.splice(slot, 1);
  return { message };
}

export const REGIME_NAMES: Record<Regime, string> = { bull: 'bull market', bear: 'bear market', range: 'range' };

/** Calendrier économique : news des prochaines bougies (titre et sentiment). */
export function upcomingNews(run: RunState): { inCandles: number; headline: string; sentiment: 'positive' | 'negative' }[] {
  const seance = run.seance;
  if (!seance || !hasTool(run, 'calendar')) return [];
  const result = [];
  for (let k = 0; k < CONFIG.tools.calendar.warningCandles; k++) {
    const news = peekFuture(seance.market, k)?.news;
    if (news) result.push({ inCandles: k + 1, headline: news.headline, sentiment: news.sentiment });
  }
  return result;
}
