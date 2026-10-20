// Outils de test : construction rapide de bougies.
import type { Candle, Regime } from '../src/engine/types.ts';

export function candle(o: number, h: number, l: number, c: number, v = 10000, regime: Regime = 'range'): Candle {
  return { o, h, l, c, v, regime };
}

/** Bougies plates à partir d'une suite de Close (open = close précédent, mèches de ±0,2 %). */
export function fromCloses(closes: number[], volume = 10000): Candle[] {
  return closes.map((c, i) => {
    const o = i === 0 ? c : (closes[i - 1] as number);
    return candle(o, Math.max(o, c) * 1.002, Math.min(o, c) * 0.998, c, volume);
  });
}
