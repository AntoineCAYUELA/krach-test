import { describe, expect, it } from 'vitest';
import { createScriptedMarket } from '../src/engine/market.ts';
import { previewTrade, resolveTrade, type TradeOrder } from '../src/engine/trade.ts';
import { candle } from './helpers.ts';

const costs = { spread: 0.002, feePerSide: 0.001 };
const history = [candle(100, 100.5, 99.5, 100)];
const base: TradeOrder = { direction: 'long', stake: 1000, leverage: 1, stopLossPct: null, takeProfitPct: null, duration: 3 };

describe('résolution d’une position (GDD 5.2)', () => {
  it('short : gagne quand le prix baisse, spread payé à l’achat comme à la vente', () => {
    const market = createScriptedMarket(history, [candle(100, 100.5, 98, 99), candle(99, 99.5, 97, 98), candle(98, 98.5, 96, 97)]);
    const result = resolveTrade(market, { ...base, direction: 'short' }, costs);
    expect(result.entryPrice).toBeCloseTo(99.9, 10); // vente au bid
    expect(result.exitPriceAdjusted).toBeCloseTo(97 * 1.001, 10); // rachat à l'ask
    expect(result.returnPct).toBeCloseTo(1 - (97 * 1.001) / 99.9, 10);
    expect(result.pnlNet).toBeCloseTo(1000 * (1 - (97 * 1.001) / 99.9) - 2, 10);
  });

  it('take-profit touché : sortie au niveau du take-profit', () => {
    const market = createScriptedMarket(history, [candle(100, 105, 99.8, 104), candle(104, 104, 103, 103), candle(103, 103, 102, 102)]);
    const result = resolveTrade(market, { ...base, takeProfitPct: 0.04 }, costs);
    expect(result.exitReason).toBe('takeProfit');
    expect(result.exitPrice).toBeCloseTo(100.1 * 1.04, 10);
    expect(result.exitOffset).toBe(0);
  });

  it('stop-loss et take-profit dans la même bougie : le stop l’emporte', () => {
    const market = createScriptedMarket(history, [candle(100, 106, 94, 100), candle(100, 100, 100, 100), candle(100, 100, 100, 100)]);
    const result = resolveTrade(market, { ...base, stopLossPct: 0.05, takeProfitPct: 0.04 }, costs);
    expect(result.exitReason).toBe('stopLoss');
  });

  it('gap sous le stop : sortie au prix d’Open (slippage)', () => {
    const market = createScriptedMarket(history, [candle(93, 94, 92, 93.5), candle(93.5, 94, 93, 93.5), candle(93.5, 94, 93, 93.5)]);
    const result = resolveTrade(market, { ...base, stopLossPct: 0.05 }, costs);
    expect(result.exitReason).toBe('stopLoss');
    expect(result.gapped).toBe(true);
    expect(result.exitPrice).toBe(93);
  });

  it('levier ×5 sans stop : liquidation à −16 %, toute la mise est perdue', () => {
    const market = createScriptedMarket(history, [candle(100, 100, 95, 96), candle(96, 96, 83, 84), candle(84, 85, 80, 81)]);
    const order = { ...base, stake: 200, leverage: 5 };
    expect(previewTrade(100, order, costs).liquidationPrice).toBeCloseTo(100.1 * 0.84, 10);
    const result = resolveTrade(market, order, costs);
    expect(result.exitReason).toBe('liquidation');
    expect(result.exitOffset).toBe(1);
    expect(result.pnlNet).toBe(-200);
  });

  it('le levier multiplie gains et pertes dans la même proportion', () => {
    const future = [candle(100, 101, 99.5, 101), candle(101, 102, 100.5, 102), candle(102, 103, 101.5, 103)];
    const x1 = resolveTrade(createScriptedMarket(history, future), { ...base, stake: 100 }, costs);
    const x2 = resolveTrade(createScriptedMarket(history, future), { ...base, stake: 100, leverage: 2 }, costs);
    expect(x2.pnlNet).toBeCloseTo(2 * x1.pnlNet, 10);
  });

  it('aperçu : perte au stop et frais', () => {
    const preview = previewTrade(50, { ...base, stake: 500, leverage: 2, stopLossPct: 0.05 }, costs);
    expect(preview.notional).toBe(1000);
    expect(preview.fees).toBeCloseTo(2, 10);
    expect(preview.lossAtStop).toBeCloseTo(-52.95, 6);
  });
});
