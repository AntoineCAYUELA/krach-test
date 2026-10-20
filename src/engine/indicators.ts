// Indicateurs techniques (GDD 2.5), calculés sur la bougie d'index t.
// Toutes les fonctions renvoient null s'il n'y a pas assez d'historique.

import { CONFIG } from '../config.ts';
import type { Candle } from './types.ts';

/** Moyenne mobile simple des `period` derniers Close jusqu'à t inclus. */
export function sma(closes: readonly number[], period: number, t: number): number | null {
  if (t - period + 1 < 0 || t >= closes.length) return null;
  let sum = 0;
  for (let i = t - period + 1; i <= t; i++) sum += closes[i] as number;
  return sum / period;
}

/** RSI sur les `period` dernières variations de Close : 100 − 100 / (1 + hausses / baisses). */
export function rsi(closes: readonly number[], t: number, period: number = CONFIG.indicators.rsiPeriod): number | null {
  if (t - period < 0 || t >= closes.length) return null;
  let gains = 0;
  let losses = 0;
  for (let i = t - period + 1; i <= t; i++) {
    const diff = (closes[i] as number) - (closes[i - 1] as number);
    if (diff > 0) gains += diff;
    else losses -= diff;
  }
  if (losses === 0) return 100;
  return 100 - 100 / (1 + gains / losses);
}

/** Plus bas des Low des `window` bougies précédant t (t exclue). */
export function support(candles: readonly Candle[], t: number, window: number = CONFIG.indicators.levelWindow): number | null {
  if (t - window < 0) return null;
  let min = Infinity;
  for (let i = t - window; i < t; i++) min = Math.min(min, (candles[i] as Candle).l);
  return min;
}

/** Plus haut des High des `window` bougies précédant t (t exclue). */
export function resistance(candles: readonly Candle[], t: number, window: number = CONFIG.indicators.levelWindow): number | null {
  if (t - window < 0) return null;
  let max = -Infinity;
  for (let i = t - window; i < t; i++) max = Math.max(max, (candles[i] as Candle).h);
  return max;
}

/** Volume moyen des `window` bougies précédant t (t exclue). */
export function averageVolume(candles: readonly Candle[], t: number, window: number = CONFIG.indicators.volumeWindow): number | null {
  if (t - window < 0) return null;
  let sum = 0;
  for (let i = t - window; i < t; i++) sum += (candles[i] as Candle).v;
  return sum / window;
}

/** Pente de tendance : MM20(t) − MM20(t − 5). */
export function trendSlope(closes: readonly number[], t: number): number | null {
  const { smaLong, trendLookback } = CONFIG.indicators;
  const now = sma(closes, smaLong, t);
  const before = sma(closes, smaLong, t - trendLookback);
  if (now === null || before === null) return null;
  return now - before;
}

/** Valeurs utiles à la dernière bougie close, pour les cartes et l'affichage. */
export interface IndicatorSnapshot {
  t: number;
  sma5: number | null;
  sma20: number | null;
  rsi: number | null;
  support: number | null;
  resistance: number | null;
  averageVolume: number | null;
  trendSlope: number | null;
}

export function snapshot(candles: readonly Candle[], t: number = candles.length - 1): IndicatorSnapshot {
  const closes = candles.map((c) => c.c);
  const { smaShort, smaLong } = CONFIG.indicators;
  return {
    t,
    sma5: sma(closes, smaShort, t),
    sma20: sma(closes, smaLong, t),
    rsi: rsi(closes, t),
    support: support(candles, t),
    resistance: resistance(candles, t),
    averageVolume: averageVolume(candles, t),
    trendSlope: trendSlope(closes, t),
  };
}

/** Série complète d'une moyenne mobile, pour le graphique (null avant d'avoir assez de données). */
export function smaSeries(candles: readonly Candle[], period: number): (number | null)[] {
  const closes = candles.map((c) => c.c);
  return closes.map((_, t) => sma(closes, period, t));
}

export function rsiSeries(candles: readonly Candle[]): (number | null)[] {
  const closes = candles.map((c) => c.c);
  return closes.map((_, t) => rsi(closes, t));
}
