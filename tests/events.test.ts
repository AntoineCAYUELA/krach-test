// Un test par séance à événement (GDD 7.2).
import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config.ts';
import { RANDOM_EVENT_IDS } from '../src/data/events.ts';
import { advanceMarket } from '../src/engine/market.ts';
import { beginSeance, createRun, currentCosts, type RunState } from '../src/engine/run.ts';
import type { EventId, ToolId } from '../src/engine/types.ts';

function runWithEvent(event: EventId | null, tools: ToolId[] = []): RunState {
  const run = createRun(4, { events: [event, null, null, null, null, null, null, null] });
  run.tools = tools;
  beginSeance(run);
  return run;
}

describe('séances à événement', () => {
  it('les séances 2, 4 et 6 tirent 3 événements différents, la séance 8 est le Krach', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const events = createRun(seed).events;
      expect(events[7]).toBe('crash');
      const drawn = [events[1], events[3], events[5]];
      expect(new Set(drawn).size).toBe(3);
      for (const e of drawn) expect(RANDOM_EVENT_IDS).toContain(e);
      expect([events[0], events[2], events[4], events[6]]).toEqual([null, null, null, null]);
    }
  });

  it('Marché sans tendance : régime range toute la séance', () => {
    const run = runWithEvent('rangeMarket');
    for (let i = 0; i < 30; i++) advanceMarket(run.seance!.market);
    expect(run.seance!.market.candles.every((c) => c.regime === 'range')).toBe(true);
  });

  it('Jour de résultats : probabilité de news 15 %', () => {
    expect(runWithEvent('earningsDay').seance!.market.params.newsProb).toBe(0.15);
    expect(runWithEvent(null).seance!.market.params.newsProb).toBe(CONFIG.market.newsProb);
  });

  it('Frais doublés : frais et spread ×2, après les réductions des Outils', () => {
    expect(currentCosts(runWithEvent('doubleFees'))).toEqual({ spread: 0.004, feePerSide: 0.002 });
    const reduced = currentCosts(runWithEvent('doubleFees', ['lowCostBroker', 'marketMaker']));
    expect(reduced.spread).toBeCloseTo(0.0016, 12);
    expect(reduced.feePerSide).toBeCloseTo(0.0008, 12);
  });

  it('Volatilité écrasée : σ ×0,5', () => {
    const run = runWithEvent('lowVolatility');
    expect(run.seance!.market.params.sigma).toBeCloseTo(run.seance!.stock.sigma * 0.5, 12);
  });

  it('Krach : bear market forcé et σ ×1,5', () => {
    const run = runWithEvent('crash');
    expect(run.seance!.market.params.sigma).toBeCloseTo(run.seance!.stock.sigma * 1.5, 12);
    for (let i = 0; i < 30; i++) advanceMarket(run.seance!.market);
    expect(run.seance!.market.candles.every((c) => c.regime === 'bear')).toBe(true);
  });
});
