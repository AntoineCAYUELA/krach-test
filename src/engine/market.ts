// Générateur de prix (GDD 2.4) : régimes cachés, 10 ticks par bougie, news avec gap.
// Le marché garde `lookahead` bougies d'avance en cache : le Calendrier économique peut annoncer
// leurs news sans jamais modifier le hasard (docs/DECISIONS.md). Pendant une position, les bougies
// sont regénérées pour respecter l'issue tirée (GDD 2.7), en gardant les news déjà annoncées.

import { CONFIG } from '../config.ts';
import { NEGATIVE_HEADLINES, POSITIVE_HEADLINES } from '../data/news.ts';
import { createRng, gaussian, nextFloat, pick, uniform, weightedPick, type RngState } from './rng.ts';
import { directionSign, type Candle, type Direction, type NewsEvent, type Regime } from './types.ts';

export interface MarketParams {
  ticker: string;
  /** Volatilité par bougie, déjà multipliée par l'éventuelle contrainte d'événement. */
  sigma: number;
  baseVolume: number;
  startPrice: number;
  newsProb: number;
  /** Régime imposé toute la séance (Marché sans tendance, Krach). */
  forcedRegime?: Regime;
}

export interface MarketState {
  params: MarketParams;
  rng: RngState;
  /** Régime à la « frontière » de génération (bougies futures comprises). */
  regime: Regime;
  /** Prix de référence du régime courant, pour le rappel vers la moyenne en range. */
  refPrice: number;
  lastPrice: number;
  /** Bougies closes, visibles par le joueur. */
  candles: Candle[];
  /** Bougies déjà générées mais encore cachées. */
  future: Candle[];
  /** Marché scripté (tests) : les bougies futures sont fournies et rien n'est généré. */
  scripted: boolean;
}

const REGIMES: Regime[] = ['bull', 'bear', 'range'];

export function createMarket(params: MarketParams, seed: number): MarketState {
  const rng = createRng(seed);
  const weights = CONFIG.market.regimeWeights;
  const regime =
    params.forcedRegime ??
    weightedPick(rng, [
      ['bull', weights.bull],
      ['bear', weights.bear],
      ['range', weights.range],
    ] as const);
  const state: MarketState = {
    params,
    rng,
    regime,
    refPrice: params.startPrice,
    lastPrice: params.startPrice,
    candles: [],
    future: [],
    scripted: false,
  };
  for (let i = 0; i < CONFIG.seance.historyCandles; i++) state.candles.push(generateCandle(state));
  for (let i = 0; i < CONFIG.market.lookahead; i++) state.future.push(generateCandle(state));
  return state;
}

/** Marché aux bougies fixées à la main, pour les tests (exemple GDD 5.3). */
export function createScriptedMarket(history: Candle[], future: Candle[]): MarketState {
  const last = history[history.length - 1];
  return {
    params: { ticker: 'TEST', sigma: 0.015, baseVolume: 10000, startPrice: last?.c ?? 100, newsProb: 0 },
    rng: createRng(0),
    regime: last?.regime ?? 'range',
    refPrice: last?.c ?? 100,
    lastPrice: last?.c ?? 100,
    candles: [...history],
    future: [...future],
    scripted: true,
  };
}

/** Fait passer la prochaine bougie de « cachée » à « close » et la renvoie. */
export function advanceMarket(state: MarketState): Candle {
  const next = state.future.shift();
  if (!next) throw new Error('Marché scripté épuisé : aucune bougie future');
  state.candles.push(next);
  if (!state.scripted) state.future.push(generateCandle(state));
  return next;
}

/** Bougie future sans l'avancer (0 = la prochaine). */
export function peekFuture(state: MarketState, offset: number): Candle | undefined {
  return state.future[offset];
}

export function lastCandle(state: MarketState): Candle {
  const candle = state.candles[state.candles.length - 1];
  if (!candle) throw new Error('Marché vide');
  return candle;
}

/** News de la prochaine bougie : tirée au hasard, ou imposée (null = aucune). */
function drawNews(state: MarketState, forced?: NewsEvent | null): NewsEvent | undefined {
  if (forced !== undefined) return forced ?? undefined;
  const { rng, params } = state;
  const m = CONFIG.market;
  if (nextFloat(rng) >= params.newsProb) return undefined;
  const sentiment = nextFloat(rng) < 0.5 ? 'positive' : 'negative';
  const sentimentSign = sentiment === 'positive' ? 1 : -1;
  const sign = nextFloat(rng) < m.newsSentimentReliability ? sentimentSign : -sentimentSign;
  const gap = sign * uniform(rng, m.newsGapMin, m.newsGapMax);
  const template = pick(rng, sentiment === 'positive' ? POSITIVE_HEADLINES : NEGATIVE_HEADLINES);
  return { headline: template.replace('{T}', params.ticker), sentiment, gap };
}

function maybeSwitchRegime(state: MarketState): void {
  if (!state.params.forcedRegime && nextFloat(state.rng) < CONFIG.market.regimeSwitchProb) {
    state.regime = pick(
      state.rng,
      REGIMES.filter((r) => r !== state.regime),
    );
    state.refPrice = state.lastPrice;
  }
}

/** Un tick du marché libre : dérive du régime, rappel vers la moyenne en range, bruit. */
function freeTick(state: MarketState, price: number): number {
  const m = CONFIG.market;
  const ticks = m.ticksPerCandle;
  const drift = state.regime === 'bull' ? m.drift : state.regime === 'bear' ? -m.drift : 0;
  const reversion = state.regime === 'range' ? (-m.meanReversion * Math.log(price / state.refPrice)) / ticks : 0;
  const noise = (state.params.sigma / Math.sqrt(ticks)) * gaussian(state.rng);
  return price * Math.exp(drift / ticks + reversion + noise);
}

function candleVolume(state: MarketState, open: number, close: number, news: boolean): number {
  const m = CONFIG.market;
  const move = Math.abs(close / open - 1);
  return (
    state.params.baseVolume *
    (1 + (m.volumeMoveFactor * move) / state.params.sigma) *
    Math.exp(m.volumeNoiseSigma * gaussian(state.rng)) *
    (news ? m.newsVolumeMultiplier : 1)
  );
}

function generateCandle(state: MarketState, forcedNews?: NewsEvent | null): Candle {
  maybeSwitchRegime(state);
  const news = drawNews(state, forcedNews);
  const open = news ? state.lastPrice * (1 + news.gap) : state.lastPrice;
  let price = open;
  let high = open;
  let low = open;
  for (let i = 0; i < CONFIG.market.ticksPerCandle; i++) {
    price = freeTick(state, price);
    high = Math.max(high, price);
    low = Math.min(low, price);
  }
  state.lastPrice = price;
  const candle: Candle = { o: open, h: high, l: low, c: price, v: candleVolume(state, open, price, news !== undefined), regime: state.regime };
  if (news) candle.news = news;
  return candle;
}

// ---------------------------------------------------------------------------
// Position : chemin conditionné par l'issue tirée (GDD 2.7)

export interface TradePathTarget {
  direction: Direction;
  stopPrice: number;
  takePrice: number;
  /** Issue tirée : take-profit touché avant le stop-loss. */
  win: boolean;
  duration: number;
}

export interface TradePath {
  candles: Candle[];
  /** Index (0 à duration − 1) de la bougie de sortie. */
  exitOffset: number;
  exitPrice: number;
  reason: 'stopLoss' | 'takeProfit';
  /** Sortie au prix d'Open après un gap de news qui a sauté un niveau (slippage). */
  gapped: boolean;
}

interface PathAttempt {
  candles: Candle[];
  exit: { offset: number; price: number; reason: 'stopLoss' | 'takeProfit'; gapped: boolean } | null;
}

/**
 * Fait avancer le marché de `duration` bougies pendant une position. Le prix suit un pont brownien
 * vers le niveau de l'issue tirée (take-profit si gagné, stop-loss sinon), sans toucher l'autre niveau.
 * Les news déjà annoncées sont gardées ; un gap qui saute un niveau ferme la position à l'Open,
 * quelle que soit l'issue tirée. Après la sortie, le marché redevient libre.
 */
export function advanceMarketForTrade(state: MarketState, target: TradePathTarget): TradePath {
  const plannedNews = state.future.map((c) => c.news ?? null);
  const startPrice = lastCandle(state).c;
  const startRegime = state.regime;
  const startRef = state.refPrice;
  const ticks = CONFIG.market.ticksPerCandle;
  const total = target.duration * ticks;
  const earliest = Math.max(1, Math.ceil(CONFIG.forecast.earliestHit * total));
  const news: (NewsEvent | null)[] = [];
  for (let j = 0; j < target.duration; j++) news.push(j < plannedNews.length ? (plannedNews[j] ?? null) : null);
  // Les news des bougies non annoncées sont tirées une fois pour toutes, avant les essais.
  state.lastPrice = startPrice;
  for (let j = plannedNews.length; j < target.duration; j++) news[j] = drawNews(state) ?? null;

  let attempt: PathAttempt | null = null;
  for (let tries = 0; tries < 80 && !attempt?.exit; tries++) {
    state.regime = startRegime;
    state.refPrice = startRef;
    const hitTick = earliest + Math.floor(nextFloat(state.rng) * (total - earliest + 1));
    attempt = tradeAttempt(state, target, startPrice, news, hitTick, tries < 60 ? 1 : 0.4);
  }
  if (!attempt?.exit) throw new Error('Chemin de position introuvable');

  state.lastPrice = (attempt.candles[attempt.candles.length - 1] as Candle).c;
  state.candles.push(...attempt.candles);
  // Le cache est reconstruit depuis le nouveau prix, en gardant les news déjà annoncées au-delà de la position.
  state.future = [];
  for (let j = 0; j < CONFIG.market.lookahead; j++) {
    const planned = plannedNews[target.duration + j];
    state.future.push(generateCandle(state, planned === undefined ? undefined : planned));
  }
  const exit = attempt.exit;
  return { candles: attempt.candles, exitOffset: exit.offset, exitPrice: exit.price, reason: exit.reason, gapped: exit.gapped };
}

function tradeAttempt(state: MarketState, target: TradePathTarget, startPrice: number, news: (NewsEvent | null)[], hitTick: number, noiseScale: number): PathAttempt {
  const d = directionSign(target.direction);
  const ticks = CONFIG.market.ticksPerCandle;
  const tickSigma = (state.params.sigma / Math.sqrt(ticks)) * noiseScale;
  const goal = target.win ? target.takePrice : target.stopPrice;
  const avoid = target.win ? target.stopPrice : target.takePrice;
  const lnGoal = Math.log(goal);
  // Sens du niveau visé par rapport au prix : +1 s'il est au-dessus.
  const goalSide = Math.sign(goal - startPrice) || 1;
  const reached = (p: number, level: number, side: number) => side * (p - level) >= 0;
  const avoidSide = Math.sign(avoid - startPrice) || -goalSide;

  const candles: Candle[] = [];
  let price = startPrice;
  let exit: PathAttempt['exit'] = null;
  let tick = 0;

  for (let j = 0; j < target.duration; j++) {
    state.lastPrice = price;
    maybeSwitchRegime(state);
    const candleNews = news[j] ?? null;
    let open = price;
    if (candleNews) open = price * (1 + candleNews.gap);
    price = open;
    if (!exit) {
      // Gap à l'ouverture au-delà d'un niveau : sortie au prix d'Open (slippage), quelle que soit l'issue.
      const stopHit = d * (open - target.stopPrice) <= 0;
      const takeHit = d * (open - target.takePrice) >= 0;
      if (stopHit || takeHit) exit = { offset: j, price: open, reason: stopHit ? 'stopLoss' : 'takeProfit', gapped: true };
    }
    let high = open;
    let low = open;
    for (let i = 0; i < ticks; i++, tick++) {
      if (exit) {
        price = freeTick(state, price);
      } else {
        const remaining = hitTick - tick;
        const x = Math.log(price);
        if (remaining <= 1) {
          price = goal;
        } else {
          const mean = (lnGoal - x) / remaining;
          const sd = tickSigma * Math.sqrt((remaining - 1) / remaining);
          price = Math.exp(x + mean + sd * gaussian(state.rng));
        }
        if (reached(price, avoid, avoidSide)) return { candles, exit: null };
        if (reached(price, goal, goalSide)) {
          price = goal;
          exit = { offset: j, price: goal, reason: target.win ? 'takeProfit' : 'stopLoss', gapped: false };
        }
      }
      high = Math.max(high, price);
      low = Math.min(low, price);
    }
    const candle: Candle = { o: open, h: high, l: low, c: price, v: candleVolume(state, open, price, candleNews !== null), regime: state.regime };
    if (candleNews) candle.news = candleNews;
    candles.push(candle);
  }
  return { candles, exit };
}
