import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config.ts';
import { advanceMarket, createMarket, createScriptedMarket, peekFuture, type MarketParams } from '../src/engine/market.ts';
import { candle } from './helpers.ts';

const params: MarketParams = { ticker: 'NXC', sigma: 0.015, baseVolume: 10000, startPrice: 50, newsProb: CONFIG.market.newsProb };

describe('marché (GDD 2.4)', () => {
  it('génère 40 bougies d’historique et en garde 2 d’avance', () => {
    const market = createMarket(params, 1);
    expect(market.candles).toHaveLength(CONFIG.seance.historyCandles);
    expect(market.future).toHaveLength(CONFIG.market.lookahead);
  });

  it('la même graine donne les mêmes bougies', () => {
    const a = createMarket(params, 99);
    const b = createMarket(params, 99);
    for (let i = 0; i < 50; i++) {
      advanceMarket(a);
      advanceMarket(b);
    }
    expect(a.candles).toEqual(b.candles);
  });

  it('les bougies sont cohérentes : Low ≤ Open, Close ≤ High', () => {
    const market = createMarket(params, 5);
    for (let i = 0; i < 2000; i++) advanceMarket(market);
    for (const c of market.candles) {
      expect(c.l).toBeLessThanOrEqual(Math.min(c.o, c.c) + 1e-12);
      expect(c.h).toBeGreaterThanOrEqual(Math.max(c.o, c.c) - 1e-12);
      expect(c.v).toBeGreaterThan(0);
    }
  });

  it('l’écart-type du rendement par bougie est à ±15 % du σ configuré (hors news)', () => {
    const market = createMarket(params, 2024);
    for (let i = 0; i < 10000; i++) advanceMarket(market);
    const returns = market.candles.filter((c) => !c.news).map((c) => Math.log(c.c / c.o));
    const mean = returns.reduce((s, r) => s + r, 0) / returns.length;
    const sd = Math.sqrt(returns.reduce((s, r) => s + (r - mean) ** 2, 0) / returns.length);
    expect(sd).toBeGreaterThan(params.sigma * 0.85);
    expect(sd).toBeLessThan(params.sigma * 1.15);
  });

  it('la fréquence des news est proche de 4 % et le gap fait entre 3 et 6 %', () => {
    const market = createMarket(params, 77);
    for (let i = 0; i < 10000; i++) advanceMarket(market);
    const withNews = market.candles.filter((c) => c.news);
    expect(withNews.length / market.candles.length).toBeGreaterThan(0.03);
    expect(withNews.length / market.candles.length).toBeLessThan(0.05);
    for (const c of withNews) {
      const gap = Math.abs(c.news?.gap ?? 0);
      expect(gap).toBeGreaterThanOrEqual(CONFIG.market.newsGapMin);
      expect(gap).toBeLessThanOrEqual(CONFIG.market.newsGapMax);
    }
  });

  it('un régime forcé ne change jamais', () => {
    const market = createMarket({ ...params, forcedRegime: 'bear' }, 3);
    for (let i = 0; i < 500; i++) advanceMarket(market);
    expect(market.candles.every((c) => c.regime === 'bear')).toBe(true);
  });

  it('change de régime environ toutes les 25 bougies sans régime forcé', () => {
    const market = createMarket(params, 11);
    for (let i = 0; i < 10000; i++) advanceMarket(market);
    let switches = 0;
    for (let i = 1; i < market.candles.length; i++) {
      if (market.candles[i]?.regime !== market.candles[i - 1]?.regime) switches++;
    }
    expect(switches / market.candles.length).toBeGreaterThan(0.03);
    expect(switches / market.candles.length).toBeLessThan(0.05);
  });

  it('révéler une bougie future ne change pas la suite', () => {
    const a = createMarket(params, 8);
    const b = createMarket(params, 8);
    const peeked = peekFuture(a, 0);
    peekFuture(a, 1);
    expect(advanceMarket(a)).toEqual(peeked);
    advanceMarket(b);
    for (let i = 0; i < 20; i++) expect(advanceMarket(a)).toEqual(advanceMarket(b));
  });

  it('un marché scripté rend les bougies fournies dans l’ordre', () => {
    const future = [candle(1, 2, 0.5, 1.5), candle(1.5, 2, 1, 1.8)];
    const market = createScriptedMarket([candle(1, 1, 1, 1)], future);
    expect(advanceMarket(market)).toEqual(future[0]);
    expect(advanceMarket(market)).toEqual(future[1]);
    expect(() => advanceMarket(market)).toThrow();
  });
});
