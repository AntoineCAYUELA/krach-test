import { describe, expect, it } from 'vitest';
import { averageVolume, resistance, rsi, sma, snapshot, support, trendSlope } from '../src/engine/indicators.ts';
import { candle, fromCloses } from './helpers.ts';

describe('indicateurs (GDD 2.5)', () => {
  it('moyenne mobile simple', () => {
    const closes = [1, 2, 3, 4, 5, 6];
    expect(sma(closes, 5, 4)).toBe(3); // (1+2+3+4+5)/5
    expect(sma(closes, 5, 5)).toBe(4); // (2+3+4+5+6)/5
    expect(sma(closes, 5, 3)).toBeNull(); // pas assez d'historique
  });

  it('RSI calculé à la main', () => {
    // Variations : +2, −1, +3, −2 → hausses 5, baisses 3 → RSI = 100 − 100/(1 + 5/3) = 62,5
    const closes = [10, 12, 11, 14, 12];
    expect(rsi(closes, 4, 4)).toBeCloseTo(62.5, 10);
  });

  it('RSI = 100 sans aucune baisse, 0 sans aucune hausse', () => {
    expect(rsi([1, 2, 3, 4], 3, 3)).toBe(100);
    expect(rsi([4, 3, 2, 1], 3, 3)).toBe(0);
  });

  it('support et résistance excluent la bougie courante', () => {
    const candles = [candle(10, 12, 9, 11), candle(11, 13, 10, 12), candle(12, 20, 1, 12)];
    expect(support(candles, 2, 2)).toBe(9);
    expect(resistance(candles, 2, 2)).toBe(13);
  });

  it('volume moyen des bougies précédentes', () => {
    const candles = [candle(1, 1, 1, 1, 100), candle(1, 1, 1, 1, 300), candle(1, 1, 1, 1, 5000)];
    expect(averageVolume(candles, 2, 2)).toBe(200);
  });

  it('pente de tendance = MM20(t) − MM20(t−5)', () => {
    const closes = Array.from({ length: 30 }, (_, i) => 100 + i); // +1 par bougie
    expect(trendSlope(closes, 29)).toBeCloseTo(5, 10);
  });

  it('snapshot complet sur 40 bougies', () => {
    const candles = fromCloses(Array.from({ length: 40 }, (_, i) => 100 + Math.sin(i)));
    const snap = snapshot(candles);
    expect(snap.t).toBe(39);
    for (const value of [snap.sma5, snap.sma20, snap.rsi, snap.support, snap.resistance, snap.averageVolume, snap.trendSlope]) {
      expect(value).not.toBeNull();
    }
  });
});
