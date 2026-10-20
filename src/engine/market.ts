// Générateur de prix (GDD 2.4) : régimes cachés, 10 ticks par bougie, news avec gap.
// Le marché garde `lookahead` bougies d'avance en cache : le Calendrier économique et la
// Boule de cristal peuvent les révéler sans jamais modifier le hasard (docs/DECISIONS.md).

import { CONFIG } from '../config.ts';
import { NEGATIVE_HEADLINES, POSITIVE_HEADLINES } from '../data/news.ts';
import { createRng, gaussian, nextFloat, pick, uniform, weightedPick, type RngState } from './rng.ts';
import type { Candle, Regime } from './types.ts';

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

function generateCandle(state: MarketState): Candle {
  const { rng, params } = state;
  const m = CONFIG.market;

  if (!params.forcedRegime && nextFloat(rng) < m.regimeSwitchProb) {
    state.regime = pick(
      rng,
      REGIMES.filter((r) => r !== state.regime),
    );
    state.refPrice = state.lastPrice;
  }

  const drift = state.regime === 'bull' ? m.drift : state.regime === 'bear' ? -m.drift : 0;

  let open = state.lastPrice;
  let news: Candle['news'];
  if (nextFloat(rng) < params.newsProb) {
    const sentiment = nextFloat(rng) < 0.5 ? 'positive' : 'negative';
    const sentimentSign = sentiment === 'positive' ? 1 : -1;
    const sign = nextFloat(rng) < m.newsSentimentReliability ? sentimentSign : -sentimentSign;
    const gap = sign * uniform(rng, m.newsGapMin, m.newsGapMax);
    const template = pick(rng, sentiment === 'positive' ? POSITIVE_HEADLINES : NEGATIVE_HEADLINES);
    news = { headline: template.replace('{T}', params.ticker), sentiment, gap };
    open = state.lastPrice * (1 + gap);
  }

  let price = open;
  let high = open;
  let low = open;
  const ticks = m.ticksPerCandle;
  for (let i = 0; i < ticks; i++) {
    const reversion = state.regime === 'range' ? (-m.meanReversion * Math.log(price / state.refPrice)) / ticks : 0;
    const noise = (params.sigma / Math.sqrt(ticks)) * gaussian(rng);
    price *= Math.exp(drift / ticks + reversion + noise);
    high = Math.max(high, price);
    low = Math.min(low, price);
  }

  const move = Math.abs(price / open - 1);
  const volume =
    params.baseVolume *
    (1 + (m.volumeMoveFactor * move) / params.sigma) *
    Math.exp(m.volumeNoiseSigma * gaussian(rng)) *
    (news ? m.newsVolumeMultiplier : 1);

  state.lastPrice = price;
  const candle: Candle = { o: open, h: high, l: low, c: price, v: volume, regime: state.regime };
  if (news) candle.news = news;
  return candle;
}
