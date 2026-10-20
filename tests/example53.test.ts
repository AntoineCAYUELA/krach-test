// Rejoue l'exemple chiffré du GDD (section 5.3) avec des bougies injectées.
import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config.ts';
import { cardContext, checkCard } from '../src/engine/cards.ts';
import { createScriptedMarket } from '../src/engine/market.ts';
import { addPerformance, classifySetup, computeMulti, scoreTrade } from '../src/engine/scoring.ts';
import { resolveTrade, type TradeOrder } from '../src/engine/trade.ts';
import type { Candle, CardId } from '../src/engine/types.ts';
import { candle } from './helpers.ts';

/**
 * 40 bougies d'historique : baisse régulière (2 baisses de 0,40 pour 1 hausse de 0,30, RSI ≈ 27),
 * un Low à 49,60 qui sert de support, puis une dernière bougie close à 50,00 dont le Low revient
 * toucher le support. Volume de la dernière bougie : 1,4 × la moyenne.
 */
function exampleHistory(): Candle[] {
  const closes: number[] = [50.3];
  const pattern = [0.4, 0.4, -0.3]; // lu à l'envers : on remonte le temps depuis la fin
  for (let i = 0; closes.length < 39; i++) closes.unshift((closes[0] as number) + (pattern[i % 3] as number));
  const history = closes.map((c, i) => {
    const o = i === 0 ? c + 0.1 : (closes[i - 1] as number);
    return candle(o, Math.max(o, c) + 0.05, Math.min(o, c) - 0.05, c);
  });
  // Le support : un Low à 49,60 deux bougies avant la fin.
  const supportCandle = history[37] as Candle;
  supportCandle.l = 49.6;
  history.push(candle(50.3, 50.35, 49.7, 50.0, 14000));
  return history;
}

const exampleFuture: Candle[] = [candle(50.0, 50.6, 49.4, 50.4), candle(50.4, 51.3, 50.2, 51.1), candle(51.1, 51.9, 50.9, 51.6)];

const losingFuture: Candle[] = [candle(50.0, 50.1, 47.0, 47.3), candle(47.3, 47.8, 47.0, 47.5), candle(47.5, 48.0, 47.2, 47.9)];

const order: TradeOrder = {
  direction: 'long',
  stake: 500,
  leverage: 2,
  stopLossPct: CONFIG.tools.stopLoss.stopPct,
  takeProfitPct: null,
  duration: 3,
};

const costs = { spread: CONFIG.costs.spread, feePerSide: CONFIG.costs.feePerSide };
const played: CardId[] = ['rsiOversold', 'supportBounce', 'volumeSpike'];

describe('exemple chiffré du GDD 5.3', () => {
  it('les cartes jouées : RSI survendu ✔, Rebond sur support ✔, Pic de volume ✘', () => {
    const ctx = cardContext(exampleHistory(), ['chartist', 'stopLoss']);
    expect(ctx.snap.rsi).toBeLessThan(30);
    expect(ctx.snap.support).toBeCloseTo(49.6, 10);
    expect(checkCard('rsiOversold', 'long', ctx).valid).toBe(true);
    expect(checkCard('supportBounce', 'long', ctx).valid).toBe(true);
    const spike = checkCard('volumeSpike', 'long', ctx);
    expect(spike.valid).toBe(false);
    expect(spike.reason).toContain('1,4');
  });

  it('trade gagnant : E = 50,05, P&L net = 27,938…, Performance = 151,752…', () => {
    const market = createScriptedMarket(exampleHistory(), exampleFuture);
    const ctx = cardContext(market.candles, ['chartist', 'stopLoss']);
    const valid = played.filter((id) => checkCard(id, 'long', ctx).valid);

    const result = resolveTrade(market, order, costs);
    expect(result.notional).toBe(1000);
    expect(result.entryPrice).toBeCloseTo(50.05, 6);
    expect(result.stopPrice).toBeCloseTo(47.5475, 6);
    expect(result.exitReason).toBe('time');
    expect(result.exitPriceAdjusted).toBeCloseTo(51.5484, 6);
    expect(result.returnPct).toBeCloseTo(0.029938061938062, 6);
    expect(result.pnlGross).toBeCloseTo(29.938061938062, 6);
    expect(result.fees).toBeCloseTo(2, 6);
    expect(result.pnlNet).toBeCloseTo(27.938061938062, 6);

    const setup = classifySetup(valid);
    expect(setup.type).toBe('confluence');
    const multi = computeMulti({
      setup,
      direction: 'long',
      tools: ['chartist', 'stopLoss'],
      trendSlope: ctx.snap.trendSlope,
      duration: 3,
      exitByToolTakeProfit: false,
      twoPercentOk: false,
      journalBonus: 0,
      formationBonus: 0,
    });
    expect(multi.total).toBe(4);

    const score = scoreTrade(result.pnlNet, valid.length, multi.total);
    expect(score.analysisPoints).toBe(10);
    expect(score.result).toBeCloseTo(37.938061938062, 6);
    expect(score.performance).toBeCloseTo(151.752247752248, 6);
    expect(score.performance).toBeGreaterThanOrEqual(CONFIG.run.quotas[2] as number);
  });

  it('variante perdante : stop à 47,5475, P&L net = −52,95, Performance = −21,475', () => {
    const market = createScriptedMarket(exampleHistory(), losingFuture);
    const result = resolveTrade(market, order, costs);
    expect(result.exitReason).toBe('stopLoss');
    expect(result.exitOffset).toBe(0);
    expect(result.exitPriceAdjusted).toBeCloseTo(47.4999525, 6);
    expect(result.returnPct).toBeCloseTo(-0.05095, 6);
    expect(result.pnlGross).toBeCloseTo(-50.95, 6);
    expect(result.pnlNet).toBeCloseTo(-52.95, 6);
    // Le temps est consommé : les 3 bougies sont jouées même après le stop.
    expect(result.candles).toHaveLength(3);

    const score = scoreTrade(result.pnlNet, 2, 4);
    expect(score.result).toBeCloseTo(-42.95, 6);
    expect(score.performance).toBeCloseTo(-21.475, 6);
    expect(addPerformance(30, score.performance)).toBeCloseTo(8.525, 6);
    expect(addPerformance(0, score.performance)).toBe(0);
  });
});
