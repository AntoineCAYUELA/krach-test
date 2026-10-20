// Fabrique de runs pour les tests : une run réelle dont on peut remplacer le marché par un marché scripté.
import { createScriptedMarket } from '../src/engine/market.ts';
import { beginSeance, createRun, type PositionInput, type RunState } from '../src/engine/run.ts';
import type { Candle, CardId, ToolId } from '../src/engine/types.ts';
import { candle, fromCloses } from './helpers.ts';

export function startedRun(seed = 1, tools: ToolId[] = []): RunState {
  const run = createRun(seed);
  run.tools = [...tools];
  beginSeance(run);
  return run;
}

/** Run en séance avec un marché scripté, une main imposée et des Outils. */
export function scriptedRun(history: Candle[], future: Candle[], tools: ToolId[] = [], hand: CardId[] = []): RunState {
  const run = startedRun(1, tools);
  const seance = run.seance!;
  seance.market = createScriptedMarket(history, future);
  if (hand.length > 0) seance.hand = [...hand];
  return run;
}

/** Historique plat à 100 (40 bougies) et 3 bougies futures qui montent ou baissent régulièrement. */
export function flatHistory(): Candle[] {
  return fromCloses(Array<number>(40).fill(100));
}

export function steadyFuture(stepPct: number, count = 3, start = 100): Candle[] {
  const out: Candle[] = [];
  let price = start;
  for (let i = 0; i < count; i++) {
    const next = price * (1 + stepPct);
    out.push(candle(price, Math.max(price, next) * 1.0005, Math.min(price, next) * 0.9995, next));
    price = next;
  }
  return out;
}

export function order(overrides: Partial<PositionInput> = {}): PositionInput {
  return { direction: 'long', stake: 500, leverage: 1, stopLossPct: null, takeProfitPct: null, duration: 3, cardIndices: [], ...overrides };
}
