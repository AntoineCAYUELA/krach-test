// Revue de marché après un voyage (GDD 13.6) : résumé chiffré de l'historique de la prochaine séance.

import { CONFIG } from '../config.ts';
import { rsi, sma } from './indicators.ts';
import type { Candle } from './types.ts';

export type ReviewTrend = 'up' | 'down' | 'flat';
export type RsiZone = 'overbought' | 'nearOverbought' | 'neutral' | 'nearOversold' | 'oversold';

export interface MarketReview {
  candleCount: number;
  firstClose: number;
  lastClose: number;
  /** Variation du premier au dernier Close (0,081 = +8,1 %). */
  change: number;
  high: number;
  low: number;
  trend: ReviewTrend;
  rsi: number | null;
  rsiZone: RsiZone | null;
  news: { candle: number; headline: string; gap: number }[];
}

/** Écart relatif entre MM5 et MM20 en dessous duquel on parle de marché sans tendance nette. */
const FLAT_TREND = 0.001;
/** Largeur de la zone « proche » du surachat ou de la survente, en points de RSI. */
const NEAR_ZONE = 10;

export function rsiZone(value: number): RsiZone {
  const { rsiOverbought: high, rsiOversold: low } = CONFIG.cards;
  if (value > high) return 'overbought';
  if (value >= high - NEAR_ZONE) return 'nearOverbought';
  if (value < low) return 'oversold';
  if (value <= low + NEAR_ZONE) return 'nearOversold';
  return 'neutral';
}

export function marketReview(candles: readonly Candle[]): MarketReview {
  const first = candles[0];
  const last = candles[candles.length - 1];
  if (!first || !last) throw new Error('Historique vide');
  const closes = candles.map((c) => c.c);
  const t = closes.length - 1;
  const short = sma(closes, CONFIG.indicators.smaShort, t);
  const long = sma(closes, CONFIG.indicators.smaLong, t);
  let trend: ReviewTrend = 'flat';
  if (short !== null && long !== null && Math.abs(short - long) / long >= FLAT_TREND) trend = short > long ? 'up' : 'down';
  const value = rsi(closes, t);
  return {
    candleCount: candles.length,
    firstClose: first.c,
    lastClose: last.c,
    change: last.c / first.c - 1,
    high: Math.max(...candles.map((c) => c.h)),
    low: Math.min(...candles.map((c) => c.l)),
    trend,
    rsi: value,
    rsiZone: value === null ? null : rsiZone(value),
    news: candles.flatMap((c, i) => (c.news ? [{ candle: i + 1, headline: c.news.headline, gap: c.news.gap }] : [])),
  };
}
