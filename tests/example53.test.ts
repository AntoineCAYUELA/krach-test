// Rejoue l'exemple chiffré du GDD (section 5.3) avec des bougies injectées.
import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config.ts';
import { cardContext, checkCard } from '../src/engine/cards.ts';
import { marketContext } from '../src/engine/forecast.ts';
import { openPosition, previewPosition, type PositionInput, type RunState } from '../src/engine/run.ts';
import { addPerformance } from '../src/engine/scoring.ts';
import type { Candle, CardId } from '../src/engine/types.ts';
import { candle } from './helpers.ts';
import { scriptedRun } from './runHelpers.ts';

/**
 * 40 bougies d'historique : 20 bougies plates autour de 50,50, une hausse jusqu'à 52,00, puis une baisse
 * (2 baisses de 0,30 pour 1 hausse de 0,30, RSI ≈ 27). La pente de MM20 reste nulle : contexte sans tendance.
 * Un Low à 49,60 sert de support ; la dernière bougie, close à 50,00, revient le toucher (Low 49,70).
 * Volume de la dernière bougie : 1,4 × la moyenne.
 */
function exampleHistory(): Candle[] {
  const closes: number[] = [];
  for (let i = 0; i < 20; i++) closes.push(i % 2 === 0 ? 50.4 : 50.6);
  for (let i = 1; i <= 6; i++) closes.push(50.5 + 0.25 * i);
  const pattern = [-0.3, -0.3, 0.3];
  for (let i = 0; closes.length < 39; i++) closes.push(Math.round(((closes[closes.length - 1] as number) + (pattern[i % 3] as number)) * 100) / 100);
  const history = closes.map((c, i) => {
    const o = i === 0 ? c : (closes[i - 1] as number);
    return candle(o, Math.max(o, c) + 0.05, Math.min(o, c) - 0.05, c);
  });
  (history[37] as Candle).l = 49.6;
  history.push(candle(50.5, 50.55, 49.7, 50.0, 14000));
  return history;
}

/** Le take-profit (52,30225) est touché à la 2e bougie, sans toucher le stop-loss. */
const winningFuture: Candle[] = [candle(50.0, 50.9, 49.9, 50.8), candle(50.8, 52.4, 50.7, 52.1), candle(52.1, 52.5, 51.8, 52.0)];

/** Le stop-loss (48,5485) est touché à la 1re bougie. */
const losingFuture: Candle[] = [candle(50.0, 50.1, 48.4, 48.6), candle(48.6, 48.9, 48.3, 48.7), candle(48.7, 49.0, 48.5, 48.8)];

const played: CardId[] = ['rsiOversold', 'supportBounce', 'volumeSpike'];
const input: PositionInput = { direction: 'long', size: 'normal', duration: 3, cardIndices: [0, 1, 2] };

/** Séance 3 (quota 120), capital 1 000 $, Chartiste, NXC (σ = 1,5 %, u = 3 %). */
function exampleRun(future: Candle[]): RunState {
  const run = scriptedRun(exampleHistory(), future, ['chartist'], [...played, 'hammer', 'hammer', 'hammer', 'hammer']);
  run.seance!.quota = CONFIG.run.quotas[2] as number;
  return run;
}

describe('exemple chiffré du GDD 5.3', () => {
  it('contexte sans tendance ; RSI survendu ✔, Rebond sur support ✔, Pic de volume ✘', () => {
    const history = exampleHistory();
    const ctx = cardContext(history, ['chartist']);
    expect(marketContext(ctx.snap, 50)).toBe('flat');
    expect(ctx.snap.rsi).toBeCloseTo(27.27, 2);
    expect(ctx.snap.support).toBeCloseTo(49.6, 10);
    expect(checkCard('rsiOversold', 'long', ctx).valid).toBe(true);
    expect(checkCard('supportBounce', 'long', ctx).valid).toBe(true);
    const spike = checkCard('volumeSpike', 'long', ctx);
    expect(spike.valid).toBe(false);
    expect(spike.reason).toContain('1,4');
  });

  it('ticket : chance 68 %, E = 50,05, gain +41,955, perte −32,97, espérance +17,98, Multi 4', () => {
    const view = previewPosition(exampleRun(winningFuture), input);
    expect(view.chance.context).toBe('flat');
    expect(view.chance.base).toBeCloseTo(0.4, 12);
    expect(view.chance.terms.map((t) => t.value)).toEqual([12, 12, 4]);
    expect(view.chance.value).toBeCloseTo(0.68, 12);
    expect(view.order).toMatchObject({ stake: 500, leverage: 2 });
    expect(view.preview.notional).toBe(1000);
    expect(view.preview.entryPrice).toBeCloseTo(50.05, 10);
    expect(view.preview.stopPrice).toBeCloseTo(48.5485, 10);
    expect(view.preview.takePrice).toBeCloseTo(52.30225, 10);
    expect(view.gainAtTake).toBeCloseTo(41.955, 10);
    expect(view.lossAtStop).toBeCloseTo(-32.97, 10);
    expect(view.expectancy).toBeCloseTo(0.68 * 41.955 - 0.32 * 32.97, 10);
    expect(view.expectancy).toBeCloseTo(17.98, 2);
    expect(view.setup.type).toBe('confluence');
    expect(view.multi.total).toBe(4);
  });

  it('take-profit touché : P&L net +41,955, Performance 167,82, séance gagnée avec 4 ordres non utilisés', () => {
    const run = exampleRun(winningFuture);
    const record = openPosition(run, input);
    expect(record.trade.exitReason).toBe('takeProfit');
    expect(record.trade.exitOffset).toBe(1);
    expect(record.trade.exitPriceAdjusted).toBeCloseTo(52.24994775, 10);
    expect(record.trade.returnPct).toBeCloseTo(0.043955, 10);
    expect(record.trade.pnlGross).toBeCloseTo(43.955, 10);
    expect(record.trade.fees).toBeCloseTo(2, 10);
    expect(record.pnlNet).toBeCloseTo(41.955, 10);
    expect(run.capital).toBeCloseTo(1041.955, 10);
    expect(record.score.result).toBeCloseTo(41.955, 10);
    expect(record.score.performance).toBeCloseTo(167.82, 10);
    expect(run.phase).toBe('summary');
    expect(run.seance!.rewards!.unusedOrders).toBe(4);
    // Le temps est consommé : les 3 bougies sont jouées même après la sortie.
    expect(record.trade.candles).toHaveLength(3);
  });

  it('variante perdante : stop-loss à 48,5485, P&L net −32,97, Performance −16,485', () => {
    const run = exampleRun(losingFuture);
    const record = openPosition(run, input);
    expect(record.trade.exitReason).toBe('stopLoss');
    expect(record.trade.exitOffset).toBe(0);
    expect(record.trade.exitPriceAdjusted).toBeCloseTo(48.4999515, 10);
    expect(record.trade.returnPct).toBeCloseTo(-0.03097, 10);
    expect(record.pnlNet).toBeCloseTo(-32.97, 10);
    expect(run.capital).toBeCloseTo(967.03, 10);
    expect(record.score.result).toBeCloseTo(-32.97, 10);
    expect(record.score.performance).toBeCloseTo(-16.485, 10);
    expect(addPerformance(30, record.score.performance)).toBeCloseTo(13.515, 10);
    expect(addPerformance(0, record.score.performance)).toBe(0);
  });
});
