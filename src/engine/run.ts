// Machine à états d'une run et d'une séance (GDD 2.1 à 2.3, 4, 8).
// Tout l'état est un objet JSON simple : il se sauvegarde tel quel dans le localStorage.

import { CONFIG } from '../config.ts';
import { RANDOM_EVENT_IDS } from '../data/events.ts';
import { CARD_IDS, cardContext, checkCard, startingDeck, type CardCheck, type CardContext } from './cards.ts';
import { advanceMarket, createMarket, lastCandle, peekFuture, type MarketState } from './market.ts';
import { createRng, deriveSeed, pick, shuffle, type RngState } from './rng.ts';
import { addPerformance, classifySetup, computeMulti, scoreTrade, type MultiBreakdown, type SetupResult, type TradeScore } from './scoring.ts';
import { previewTrade, resolveTrade, type TradeCosts, type TradePreview, type TradeResult } from './trade.ts';
import type { CardId, ConsumableId, Direction, EventId, Regime, SetupType, ToolId } from './types.ts';
import { GameError } from './errors.ts';
import { createShop } from './shop.ts';

export type RunPhase = 'briefing' | 'seance' | 'summary' | 'shop' | 'victory' | 'defeat';
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
  /** Rapport d'analyste : régime révélé tant que le nombre de bougies n'a pas changé. */
  revealedRegime: { candleCount: number; regime: Regime } | null;
  /** Boule de cristal : couleur de la prochaine bougie. */
  crystalBall: { candleCount: number; bullish: boolean } | null;
  capitalAtStart: number;
  status: 'playing' | 'won' | 'lost' | 'liquidated';
  rewards: SeanceRewards | null;
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
  version: 1;
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
}

export interface RunOptions {
  /** Impose les événements des 8 séances (simulation, tests). */
  events?: (EventId | null)[];
}

// ---------------------------------------------------------------------------
// Création

export function createRun(seed: number, options: RunOptions = {}): RunState {
  const run: RunState = {
    version: 1,
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
    revealedRegime: null,
    crystalBall: null,
    capitalAtStart: run.capital,
    status: 'playing',
    rewards: null,
  };
  drawUpTo(seance);
  return seance;
}

/** Briefing → séance. */
export function beginSeance(run: RunState): void {
  if (run.phase !== 'briefing' || !run.seance) throw new GameError('Aucune séance à commencer');
  run.phase = 'seance';
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

export function allowedLeverages(run: RunState): readonly number[] {
  return hasTool(run, 'leverage') ? CONFIG.trade.toolLeverages : CONFIG.trade.baseLeverages;
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

/** Défausser 1 à 5 cartes et repiocher. Coût : 1 défausse. */
export function discardCards(run: RunState, indices: readonly number[]): void {
  const seance = requireSeance(run);
  if (seance.discards <= 0) throw new GameError('Plus de défausse disponible');
  if (indices.length < 1 || indices.length > CONFIG.seance.handSize) throw new GameError('Choisis de 1 à 5 cartes');
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
  stake: number;
  leverage: number;
  /** Stop-loss choisi par le joueur (fraction), ou null. */
  stopLossPct: number | null;
  takeProfitPct: number | null;
  duration: number;
  /** Index des cartes de la main jouées (0 à 3). */
  cardIndices: number[];
}

interface Protection {
  pct: number | null;
  fromTool: boolean;
}

/** Stop automatique de l'Outil, sauf si le joueur en a fixé un plus proche. */
function effectiveStop(run: RunState, playerPct: number | null): Protection {
  if (!hasTool(run, 'stopLoss')) return { pct: playerPct, fromTool: false };
  const toolPct = CONFIG.tools.stopLoss.stopPct;
  return playerPct !== null && playerPct < toolPct ? { pct: playerPct, fromTool: false } : { pct: toolPct, fromTool: true };
}

function effectiveTake(run: RunState, playerPct: number | null): Protection {
  if (!hasTool(run, 'takeProfit')) return { pct: playerPct, fromTool: false };
  const toolPct = CONFIG.tools.takeProfit.takePct;
  return playerPct !== null && playerPct < toolPct ? { pct: playerPct, fromTool: false } : { pct: toolPct, fromTool: true };
}

export interface PositionPreview {
  preview: TradePreview;
  stop: Protection;
  take: Protection;
  setup: SetupResult;
  /** Multi hors bonus qui dépendent de la sortie (Take-profit méthodique). */
  multi: MultiBreakdown;
  twoPercentOk: boolean;
  /** Raison qui empêche d'ouvrir la position, ou null. */
  error: string | null;
}

export function previewPosition(run: RunState, input: PositionInput): PositionPreview {
  const seance = run.seance;
  if (!seance) throw new GameError('Aucune séance');
  const stop = effectiveStop(run, input.stopLossPct);
  const take = effectiveTake(run, input.takeProfitPct);
  const order = { direction: input.direction, stake: input.stake, leverage: input.leverage, stopLossPct: stop.pct, takeProfitPct: take.pct, duration: input.duration };
  const preview = previewTrade(lastCandle(seance.market).c, order, currentCosts(run));
  const ctx = handContext(run);
  const played = input.cardIndices.map((i) => seance.hand[i]).filter((id): id is CardId => id !== undefined);
  const valid = played.filter((id) => checkCard(id, input.direction, ctx).valid);
  const setup = classifySetup(valid);
  const twoPercentOk = stop.pct !== null && preview.notional * stop.pct <= CONFIG.tools.twoPercentRule.maxRiskPct * run.capital;
  const multi = computeMulti({
    setup,
    direction: input.direction,
    tools: run.tools,
    trendSlope: ctx.snap.trendSlope,
    duration: input.duration,
    exitByToolTakeProfit: false,
    twoPercentOk,
    journalBonus: run.journalBonus,
    formationBonus: run.formations[setup.type] ?? 0,
  });
  return { preview, stop, take, setup, multi, twoPercentOk, error: positionError(run, input) };
}

function positionError(run: RunState, input: PositionInput): string | null {
  const seance = run.seance;
  if (!seance || run.phase !== 'seance' || seance.status !== 'playing') return 'Aucune séance en cours';
  if (seance.orders <= 0) return 'Plus d’ordre disponible';
  if (!allowedDurations(run).includes(input.duration)) return 'Durée non autorisée';
  if (seance.candlesLeft < input.duration) return 'Pas assez de bougies restantes';
  if (!allowedLeverages(run).includes(input.leverage)) return 'Levier non autorisé';
  if (!(input.stake >= CONFIG.run.minStake)) return `Mise minimale : ${CONFIG.run.minStake} $`;
  if (input.stake > run.capital + 1e-9) return 'La mise dépasse le capital';
  if (input.cardIndices.length > CONFIG.seance.maxPlayedCards) return `${CONFIG.seance.maxPlayedCards} cartes maximum`;
  if (new Set(input.cardIndices).size !== input.cardIndices.length) return 'Carte jouée deux fois';
  if (input.cardIndices.some((i) => i < 0 || i >= seance.hand.length)) return 'Carte inexistante';
  if (input.stopLossPct !== null && !(input.stopLossPct > 0 && input.stopLossPct < 1)) return 'Stop-loss invalide';
  if (input.takeProfitPct !== null && !(input.takeProfitPct > 0)) return 'Take-profit invalide';
  return null;
}

/** Ouvre et résout une position (GDD 2.3 étapes 4 à 9). */
export function openPosition(run: RunState, input: PositionInput): TradeRecord {
  const seance = requireSeance(run);
  const error = positionError(run, input);
  if (error) throw new GameError(error);
  const planned = previewPosition(run, input);
  const ctx = handContext(run);
  const entryCandleIndex = seance.market.candles.length - 1;

  const order = {
    direction: input.direction,
    stake: input.stake,
    leverage: input.leverage,
    stopLossPct: planned.stop.pct,
    takeProfitPct: planned.take.pct,
    duration: input.duration,
  };
  const trade = resolveTrade(seance.market, order, currentCosts(run));
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
    exitByToolTakeProfit: trade.exitReason === 'takeProfit' && planned.take.fromTool,
    twoPercentOk: planned.twoPercentOk,
    journalBonus: run.journalBonus,
    formationBonus: run.formations[planned.setup.type] ?? 0,
  });
  const score = scoreTrade(pnlNet, planned.setup.validCards.length, multi.total);

  let primesBonus = 0;
  if (trade.exitReason === 'stopLoss' && planned.stop.fromTool) primesBonus = CONFIG.tools.stopLoss.primesPerStop;
  run.primes += primesBonus;

  if (hasTool(run, 'tradingJournal') && pnlNet > 0 && planned.setup.validCards.length >= CONFIG.tools.tradingJournal.minValidCards) {
    run.journalBonus = Math.min(CONFIG.tools.tradingJournal.cap, run.journalBonus + CONFIG.tools.tradingJournal.multiPerWin);
  }

  const capitalBefore = run.capital;
  run.capital += pnlNet;
  seance.performance = addPerformance(seance.performance, score.performance);

  const playedCards = removeFromHand(seance, input.cardIndices);
  seance.discardPile.push(...playedCards);
  drawUpTo(seance);

  const record: TradeRecord = {
    number: seance.trades.length + 1,
    direction: input.direction,
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

/** Bilan → boutique, ou victoire après la séance 8. */
export function finishSummary(run: RunState): void {
  if (run.phase !== 'summary') throw new GameError('Pas de bilan en cours');
  if (run.seanceIndex >= CONFIG.run.seanceCount - 1) {
    run.phase = 'victory';
    return;
  }
  run.phase = 'shop';
  run.shop = createShop(run);
}

/** Boutique → briefing de la séance suivante. */
export function leaveShop(run: RunState): void {
  if (run.phase !== 'shop') throw new GameError('Pas de boutique ouverte');
  run.shop = null;
  run.seanceIndex++;
  run.seance = prepareSeance(run);
  run.phase = 'briefing';
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
      const regime = lastCandle(seance.market).regime;
      seance.revealedRegime = { candleCount: seance.market.candles.length, regime };
      message = `Régime actuel : ${REGIME_NAMES[regime]}.`;
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
      const next = peekFuture(seance.market, 0);
      if (!next) throw new GameError('Aucune bougie à révéler');
      const bullish = next.c > next.o;
      seance.crystalBall = { candleCount: seance.market.candles.length, bullish };
      message = `La prochaine bougie sera ${bullish ? 'verte' : 'rouge'}.`;
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
