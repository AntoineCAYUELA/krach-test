// Prévision (GDD 2.7) : contexte de marché, bonus des cartes, chance, unité de risque,
// et chemin des bougies pendant une position, qui respecte l'issue tirée.
import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config.ts';
import { cardBonus, computeChance, marketContext, riskUnit } from '../src/engine/forecast.ts';
import type { IndicatorSnapshot } from '../src/engine/indicators.ts';
import { advanceMarketForTrade, createMarket, lastCandle, type MarketParams } from '../src/engine/market.ts';
import { createRng, nextFloat } from '../src/engine/rng.ts';
import { resolveTrade } from '../src/engine/trade.ts';
import type { Candle, Direction } from '../src/engine/types.ts';

const snap = (sma20: number | null, trendSlope: number | null): IndicatorSnapshot => ({
  t: 39,
  sma5: null,
  sma20,
  rsi: null,
  support: null,
  resistance: null,
  averageVolume: null,
  trendSlope,
});

const params: MarketParams = { ticker: 'NXC', sigma: 0.015, baseVolume: 10000, startPrice: 50, newsProb: CONFIG.market.newsProb };

/** Niveaux d'une position de 3 bougies à u = 3 %, ratio 1,5, depuis le dernier Close. */
function levels(close: number, direction: Direction): { stopPrice: number; takePrice: number } {
  const d = direction === 'long' ? 1 : -1;
  const u = riskUnit(params.sigma, 3);
  return { stopPrice: close * (1 - d * u), takePrice: close * (1 + d * 1.5 * u) };
}

describe('contexte de marché', () => {
  it('tendance si la pente relative de MM20 dépasse ±0,6 % et que le Close est du même côté de MM20', () => {
    expect(marketContext(snap(100, 0.61), 101)).toBe('up');
    expect(marketContext(snap(100, 0.59), 101)).toBe('flat');
    expect(marketContext(snap(100, 0.61), 99)).toBe('flat');
    expect(marketContext(snap(100, -0.61), 99)).toBe('down');
    expect(marketContext(snap(100, -0.61), 101)).toBe('flat');
    expect(marketContext(snap(null, null), 100)).toBe('flat');
  });
});

describe('bonus de chance des cartes', () => {
  it('retournement : +12 sans tendance, +8 dans le sens de la tendance, 0 contre', () => {
    expect(cardBonus('hammer', 'long', 'flat').value).toBe(12);
    expect(cardBonus('hammer', 'long', 'up').value).toBe(8);
    expect(cardBonus('hammer', 'long', 'down').value).toBe(0);
    expect(cardBonus('shootingStar', 'short', 'down').value).toBe(8);
  });

  it('continuation : −6 sans tendance, +12 dans le sens de la tendance, 0 contre', () => {
    expect(cardBonus('bullishBreakout', 'long', 'flat').value).toBe(-6);
    expect(cardBonus('bullishBreakout', 'long', 'up').value).toBe(12);
    expect(cardBonus('bullishBreakout', 'long', 'down').value).toBe(0);
    expect(cardBonus('volumeSpike', 'short', 'down').value).toBe(12);
  });
});

describe('chance de toucher le take-profit', () => {
  it('base = stop / (stop + take) : 40 % avec un ratio de 1,5, 33 % avec 2', () => {
    const base = computeChance({ context: 'flat', direction: 'long', validCards: [], stopUnits: 1, takeUnits: 1.5 });
    expect(base.value).toBeCloseTo(0.4, 12);
    expect(base.terms).toEqual([]);
    expect(computeChance({ context: 'flat', direction: 'long', validCards: [], stopUnits: 1, takeUnits: 2 }).value).toBeCloseTo(1 / 3, 12);
  });

  it('confluence : +4 par famille au-delà de la première', () => {
    const sameFamily = computeChance({ context: 'flat', direction: 'long', validCards: ['hammer', 'bullishEngulfing'], stopUnits: 1, takeUnits: 1.5 });
    expect(sameFamily.value).toBeCloseTo(0.64, 12);
    const three = computeChance({ context: 'flat', direction: 'long', validCards: ['hammer', 'rsiOversold', 'supportBounce'], stopUnits: 1, takeUnits: 1.5 });
    expect(three.terms.at(-1)).toEqual({ label: 'Confluence de 3 familles', value: 8 });
    expect(three.value).toBeCloseTo(0.84, 12);
  });

  it('bornée entre 5 % et 85 %', () => {
    const high = computeChance({
      context: 'flat',
      direction: 'long',
      validCards: ['hammer', 'rsiOversold', 'supportBounce'],
      stopUnits: 1,
      takeUnits: 1.5,
      extraBonus: { label: 'Rapport d’analyste', value: 10 },
    });
    expect(high.value).toBe(CONFIG.forecast.max);
    expect(computeChance({ context: 'flat', direction: 'long', validCards: [], stopUnits: 1, takeUnits: 30 }).value).toBe(CONFIG.forecast.min);
  });

  it('unité de risque u = 2 σ sur 3 bougies, × √(1/3) sur 1 bougie', () => {
    expect(riskUnit(0.015, 3)).toBeCloseTo(0.03, 12);
    expect(riskUnit(0.02, 3)).toBeCloseTo(0.04, 12);
    expect(riskUnit(0.015, 1)).toBeCloseTo(0.03 / Math.sqrt(3), 12);
  });
});

describe('chemin d’une position', () => {
  it('le niveau tiré est touché, l’autre jamais avant la bougie de sortie, sauf gap de news', () => {
    const n = 400;
    let gaps = 0;
    for (let seed = 1; seed <= n; seed++) {
      const market = createMarket(params, seed);
      const win = seed % 2 === 0;
      const direction: Direction = seed % 4 < 2 ? 'long' : 'short';
      const { stopPrice, takePrice } = levels(lastCandle(market).c, direction);
      const before = market.candles.length;
      const path = advanceMarketForTrade(market, { direction, stopPrice, takePrice, win, duration: 3 });
      expect(path.candles).toHaveLength(3);
      expect(market.candles).toHaveLength(before + 3);
      expect(market.future).toHaveLength(CONFIG.market.lookahead);
      const exitCandle = path.candles[path.exitOffset] as Candle;
      if (path.gapped) {
        gaps++;
        expect(exitCandle.news).toBeDefined();
        expect(path.exitPrice).toBe(exitCandle.o);
        continue;
      }
      expect(path.reason).toBe(win ? 'takeProfit' : 'stopLoss');
      expect(path.exitPrice).toBe(win ? takePrice : stopPrice);
      const lower = Math.min(stopPrice, takePrice);
      const upper = Math.max(stopPrice, takePrice);
      for (const c of path.candles.slice(0, path.exitOffset)) {
        expect(c.l).toBeGreaterThan(lower);
        expect(c.h).toBeLessThan(upper);
      }
      expect(exitCandle.l).toBeLessThanOrEqual(Math.min(exitCandle.o, exitCandle.c));
      expect(exitCandle.h).toBeGreaterThanOrEqual(Math.max(exitCandle.o, exitCandle.c));
    }
    expect(gaps / n).toBeLessThan(0.15);
  });

  it('garde les news déjà générées dans le cache', () => {
    let checked = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const market = createMarket({ ...params, newsProb: 0.3 }, seed);
      const planned = market.future.map((c) => c.news);
      const { stopPrice, takePrice } = levels(lastCandle(market).c, 'long');
      const path = advanceMarketForTrade(market, { direction: 'long', stopPrice, takePrice, win: true, duration: 3 });
      planned.forEach((news, j) => expect(path.candles[j]!.news).toEqual(news));
      checked += planned.filter(Boolean).length;
    }
    expect(checked).toBeGreaterThan(10);
  });

  it('le taux de take-profit réel suit la chance affichée, gaps de news compris (±4 points)', () => {
    const costs = { spread: CONFIG.costs.spread, feePerSide: CONFIG.costs.feePerSide };
    const rng = createRng(4242);
    for (const chance of [0.3, 0.5, 0.7]) {
      const n = 1500;
      let wins = 0;
      for (let i = 0; i < n; i++) {
        const market = createMarket(params, 10000 + i);
        const u = riskUnit(params.sigma, 3);
        const order = { direction: 'long' as const, stake: 500, leverage: 2, stopLossPct: u, takeProfitPct: 1.5 * u, duration: 3 };
        const trade = resolveTrade(market, order, costs, nextFloat(rng) < chance);
        if (trade.exitReason === 'takeProfit') wins++;
      }
      expect(Math.abs(wins / n - chance)).toBeLessThan(0.04);
    }
  });
});
