// Marché inventé (GDD v3, section 3). Aucun accès au DOM : on peut simuler des parties dans Node.
//
// Le prix bouge parce que les acheteurs ou les vendeurs dominent (jauge b, en %).
// Un retournement ne tombe jamais du ciel : il est annoncé par des signes sur le graphique
// (longue mèche contre la tendance, gros volume, jauge qui bascule). Le seul vrai hasard
// est la news surprise, rare et affichée comme telle.
//
// Pour chaque trade, on tire d'abord ce qui va se passer, puis on dessine les 12 bougies
// qui l'annoncent (ou un faux signe).
import { NEWS, type NewsItem } from '../data/news.ts';
import { clamp, createRng, gauss, nextFloat, nextInt, pick, type Rng } from './rng.ts';
import { RULES, type Direction } from './rules.ts';
import type { Level, Regime } from './tiers.ts';

/** Une bougie : ouverture, clôture, plus haut, plus bas, volume et part d'acheteurs b (%). */
export interface Candle {
  o: number;
  c: number;
  h: number;
  l: number;
  v: number;
  b: number;
}

export interface Market {
  rng: Rng;
  history: Candle[];
  price: number;
  ticker: string;
}

export interface RangeInfo {
  center: number;
  endsHigh: boolean;
  endPhase: number;
  top: number;
  bottom: number;
}

/** Les 12 bougies montrées avant un trade et ce qu'elles cachent. */
export interface Lead {
  regime: Regime;
  candles: Candle[];
  rangeInfo: RangeInfo | null;
  /** Le mouvement se retourne (tendance) ou casse le niveau (range) pendant le trade. */
  reverses: boolean;
  /** Les dernières bougies portent un signe (essoufflement ou pression sur un niveau). */
  sign: boolean;
  fake: boolean;
  news: boolean;
  /** Index dans l'historique de la bougie qui porte le signe. */
  signIndex: number | null;
}

export interface TradeNews extends NewsItem {
  /** Bougie du trade (0 à 4) où tombe la news. */
  at: number;
}

export interface TradeCandles {
  candles: Candle[];
  news: TradeNews | null;
}

interface CandleOptions {
  wickUp?: number | null;
  wickDown?: number | null;
  volume?: number;
  buyers?: number;
}

function candle(rng: Rng, open: number, close: number, sigma: number, opts: CandleOptions = {}): Candle {
  const top = Math.max(open, close);
  const bottom = Math.min(open, close);
  const move = Math.abs(close / open - 1);
  const wu = opts.wickUp ?? Math.abs(gauss(rng)) * sigma * 0.5;
  const wd = opts.wickDown ?? Math.abs(gauss(rng)) * sigma * 0.5;
  return {
    o: open,
    c: close,
    h: top * (1 + wu),
    l: bottom * (1 - wd),
    v: (55 + 30 * nextFloat(rng) + (move / sigma) * 22) * (opts.volume ?? 1),
    b: clamp(Math.round(opts.buyers ?? 50), 5, 95),
  };
}

function last<T>(items: readonly T[]): T {
  const item = items[items.length - 1];
  if (item === undefined) throw new Error('liste vide');
  return item;
}

/** Tendance : chaque clôture = clôture précédente × (1 + pente + bruit). */
function trendCandles(rng: Rng, from: number, n: number, sign: number, drift: number, sigma: number): Candle[] {
  const out: Candle[] = [];
  let price = from;
  for (let i = 0; i < n; i++) {
    const close = price * (1 + sign * drift + gauss(rng) * sigma);
    out.push(candle(rng, price, close, sigma, { buyers: 50 + sign * (13 + nextFloat(rng) * 7), volume: 1.1 }));
    price = close;
  }
  return out;
}

/** Range : le prix oscille entre un plancher (support) et un plafond (résistance). */
function rangeCandles(rng: Rng, from: number, center: number, phase0: number, n: number, sigma: number): Candle[] {
  const out: Candle[] = [];
  let price = from;
  for (let i = 1; i <= n; i++) {
    const phase = phase0 + (i * Math.PI) / RULES.tradeCandles;
    const target = center * (1 + RULES.rangeAmplitude * Math.sin(phase));
    const close = target * (1 + gauss(rng) * sigma * 0.4);
    out.push(candle(rng, price, close, sigma, { buyers: 50 + 14 * Math.cos(phase) + gauss(rng) * 3, volume: 0.8 }));
    price = close;
  }
  return out;
}

/** Essoufflement : la pente s'aplatit, la jauge bascule, puis une longue mèche avec un gros volume. */
function exhaustionCandles(rng: Rng, from: number, sign: number, level: Level): Candle[] {
  const c = level.clarity;
  const out: Candle[] = [];
  let price = from;
  const slopes = [0.45, 0.15, 0];
  for (let i = 0; i < RULES.signCandles; i++) {
    const close = price * (1 + sign * level.drift * (slopes[i] ?? 0) + gauss(rng) * level.sigma * 0.4);
    const isLast = i === RULES.signCandles - 1;
    const wick = isLast ? level.sigma * (1.6 + 2.6 * c) : null;
    out.push(candle(rng, price, close, level.sigma, {
      buyers: 50 + sign * (12 - (i + 1) * (5 + 4 * c)),
      volume: isLast ? 1.4 + 1.4 * c : 1 + 0.3 * c,
      wickUp: sign > 0 ? wick : null,
      wickDown: sign < 0 ? wick : null,
    }));
    price = close;
  }
  return out;
}

/** Pression sur un bord du range : les clôtures collent au niveau, le volume grossit. */
function pressureCandles(rng: Rng, from: number, level: Level, levelPrice: number, side: number): Candle[] {
  const c = level.clarity;
  const out: Candle[] = [];
  let price = from;
  for (let i = 0; i < 2; i++) {
    const close = levelPrice * (1 - side * level.sigma * (0.4 - 0.15 * i) + gauss(rng) * level.sigma * 0.15);
    out.push(candle(rng, price, close, level.sigma, {
      buyers: 50 + side * (10 + 8 * c),
      volume: 1.4 + (0.6 + 0.6 * c) * (i + 1),
      wickUp: side > 0 ? level.sigma * 0.2 : null,
      wickDown: side < 0 ? level.sigma * 0.2 : null,
    }));
    price = close;
  }
  return out;
}

export function createMarket(seed: number, ticker = 'KRCH'): Market {
  const rng = createRng(seed);
  const history: Candle[] = [];
  let price: number = RULES.startPrice;
  for (let i = 0; i < 30; i++) {
    const close = price * (1 + 0.0004 + gauss(rng) * 0.0026);
    history.push(candle(rng, price, close, 0.0026, { buyers: 50 + gauss(rng) * 4 }));
    price = close;
  }
  return { rng, history, price, ticker };
}

/** Avant chaque trade : le marché montre 12 bougies qui annoncent la suite. */
export function nextLead(market: Market, level: Level): Lead {
  const rng = market.rng;
  const regime = level.regimes[nextInt(rng, level.regimes.length)] ?? 'up';
  const reverses = nextFloat(rng) < level.reversal;
  const sign = reverses || nextFloat(rng) < level.fake;
  const news = nextFloat(rng) < level.news;
  let candles: Candle[];
  let rangeInfo: RangeInfo | null = null;
  if (regime === 'range') {
    const endsHigh = nextFloat(rng) < 0.5;
    const side = endsHigh ? 1 : -1;
    const endPhase = endsHigh ? Math.PI / 2 : -Math.PI / 2;
    const body = RULES.leadCandles - (sign ? 2 : 0);
    const startPhase = endPhase - (body * Math.PI) / RULES.tradeCandles;
    const center = market.price / (1 + RULES.rangeAmplitude * Math.sin(startPhase));
    const top = center * (1 + RULES.rangeAmplitude);
    const bottom = center * (1 - RULES.rangeAmplitude);
    candles = rangeCandles(rng, market.price, center, startPhase, body, level.sigma);
    if (sign) {
      candles.push(...pressureCandles(rng, last(candles).c, level, endsHigh ? top : bottom, side));
    } else {
      // Rebond normal : la dernière bougie laisse une mèche de rejet sur le niveau.
      const end = last(candles);
      if (endsHigh) end.h = Math.max(end.h, top * (1 + level.sigma * 0.3));
      else end.l = Math.min(end.l, bottom * (1 - level.sigma * 0.3));
    }
    rangeInfo = { center, endsHigh, endPhase, top, bottom };
  } else {
    const dir = regime === 'up' ? 1 : -1;
    const body = RULES.leadCandles - (sign ? RULES.signCandles : 0);
    candles = trendCandles(rng, market.price, body, dir, level.drift, level.sigma);
    if (sign) candles.push(...exhaustionCandles(rng, last(candles).c, dir, level));
  }
  market.history.push(...candles);
  market.price = last(candles).c;
  return {
    regime,
    candles,
    rangeInfo,
    reverses,
    sign,
    fake: sign && !reverses,
    news,
    signIndex: sign ? market.history.length - 1 : null,
  };
}

/**
 * Direction qui gagne si le marché fait ce que les signes annoncent.
 * Tendance sans signe : la suivre. Tendance avec signe : jouer le retournement.
 * Range sans signe : jouer le rebond. Range avec signe : jouer la cassure.
 */
export function readingFor(lead: Lead): Direction {
  if (lead.regime === 'range' && lead.rangeInfo) {
    const toward: Direction = lead.rangeInfo.endsHigh ? 'long' : 'short';
    const away: Direction = lead.rangeInfo.endsHigh ? 'short' : 'long';
    return lead.sign ? toward : away;
  }
  const withTrend: Direction = lead.regime === 'up' ? 'long' : 'short';
  const against: Direction = lead.regime === 'up' ? 'short' : 'long';
  return lead.sign ? against : withTrend;
}

/** Sens que le marché prend vraiment pendant le trade, hors news (+1 hausse, −1 baisse). */
export function outcomeFor(lead: Lead): 1 | -1 {
  if (lead.regime === 'range' && lead.rangeInfo) {
    return ((lead.rangeInfo.endsHigh ? 1 : -1) * (lead.reverses ? 1 : -1)) as 1 | -1;
  }
  return ((lead.regime === 'up' ? 1 : -1) * (lead.reverses ? -1 : 1)) as 1 | -1;
}

/** Les 5 bougies du trade. Une news part toujours contre le mouvement attendu. */
export function tradeCandles(market: Market, level: Level, lead: Lead): TradeCandles {
  const rng = market.rng;
  const dir = outcomeFor(lead);
  let candles: Candle[];
  let news: TradeNews | null = null;
  if (lead.regime === 'range' && lead.rangeInfo && !lead.reverses) {
    candles = rangeCandles(rng, market.price, lead.rangeInfo.center, lead.rangeInfo.endPhase, RULES.tradeCandles, level.sigma);
  } else {
    candles = trendCandles(rng, market.price, RULES.tradeCandles, dir, level.drift * (lead.reverses ? 1.15 : 1), level.sigma);
  }
  if (lead.news) {
    const at = 1 + nextInt(rng, 2);
    const pool = (NEWS[market.ticker] ?? NEWS.KRCH ?? []).filter((n) => n.dir === -dir);
    news = { at, ...pick(rng, pool) };
    let price = candles[at - 1]?.c ?? market.price;
    const rest: Candle[] = [];
    for (let i = at; i < RULES.tradeCandles; i++) {
      const shock = i === at ? 0.016 + nextFloat(rng) * 0.006 : level.drift * 1.3;
      const close = price * (1 + news.dir * shock + gauss(rng) * level.sigma * 0.6);
      rest.push(candle(rng, price, close, level.sigma, { buyers: 50 + news.dir * 30, volume: i === at ? 3.2 : 1.6 }));
      price = close;
    }
    candles = candles.slice(0, at).concat(rest);
  }
  market.history.push(...candles);
  market.price = last(candles).c;
  return { candles, news };
}

/** Garde les dernières bougies seulement : assez pour le graphique, léger à sauvegarder. */
export function trimHistory(market: Market, keep = 80): void {
  if (market.history.length > keep) market.history = market.history.slice(-keep);
}
