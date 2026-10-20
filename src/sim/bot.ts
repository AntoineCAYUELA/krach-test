// Robot naïf d'équilibrage : portage de tools/simulation-python/g.py (GDD 7.3).
// Il mise toujours 100 % du capital, joue les cartes valides sans lire le régime et défausse le reste.

import { CONFIG } from '../config.ts';
import { checkCard } from '../engine/cards.ts';
import { classifySetup, computeMulti } from '../engine/scoring.ts';
import {
  beginSeance,
  createRun,
  discardCards,
  finishSummary,
  handContext,
  leaveEntracte,
  leaveShop,
  openPosition,
  passCandle,
  type RunState,
} from '../engine/run.ts';
import type { Direction, EventId, ToolId } from '../engine/types.ts';

export interface Build {
  name: string;
  /** Outils possédés à chaque séance (le robot ne passe pas par la boutique). */
  tools: ToolId[][];
  leverage: number[];
}

const S: ToolId = 'stopLoss';

/** Les 4 constructions de run9.py. */
export const BUILDS: Build[] = [
  { name: 'Aucun Outil', tools: Array.from({ length: 8 }, () => []), leverage: Array<number>(8).fill(2) },
  {
    name: 'Communs seulement',
    tools: [[], [S], [S, 'lowCostBroker'], [S, 'lowCostBroker', 'candleReader'], [S, 'lowCostBroker', 'candleReader', 'marketMaker'],
      [S, 'lowCostBroker', 'candleReader', 'marketMaker', 'rsiOscillator'], [S, 'lowCostBroker', 'candleReader', 'marketMaker', 'rsiOscillator'],
      [S, 'lowCostBroker', 'candleReader', 'marketMaker', 'rsiOscillator']],
    leverage: Array<number>(8).fill(2),
  },
  {
    name: 'Synergies sans levier',
    tools: [[], [S], [S, 'candleReader'], [S, 'candleReader', 'chartist'], [S, 'candleReader', 'chartist', 'trendFollower'],
      [S, 'candleReader', 'chartist', 'trendFollower', 'tradingJournal'], [S, 'candleReader', 'chartist', 'trendFollower', 'quantAnalyst'],
      [S, 'candleReader', 'chartist', 'trendFollower', 'quantAnalyst']],
    leverage: Array<number>(8).fill(2),
  },
  {
    name: 'Synergies',
    tools: [[], [S], [S, 'candleReader'], [S, 'candleReader', 'chartist'], [S, 'candleReader', 'chartist', 'leverage'],
      [S, 'candleReader', 'chartist', 'trendFollower', 'leverage'], [S, 'quantAnalyst', 'chartist', 'trendFollower', 'leverage'],
      [S, 'quantAnalyst', 'chartist', 'trendFollower', 'leverage']],
    leverage: [2, 2, 2, 2, 5, 5, 5, 5],
  },
];

/** Contraintes simulées dans le GDD 7.3 (S2 et S6 sans tendance, S4 résultats, S8 Krach). */
export const SIM_EVENTS: (EventId | null)[] = [null, 'rangeMarket', null, 'earningsDay', null, 'rangeMarket', null, 'crash'];

interface Option {
  direction: Direction;
  validIndices: number[];
  score: number;
}

function options(run: RunState): Option[] {
  const seance = run.seance;
  if (!seance) return [];
  const ctx = handContext(run);
  return (['long', 'short'] as const).map((direction) => {
    const validIndices = seance.hand
      .map((id, i) => (checkCard(id, direction, ctx).valid ? i : -1))
      .filter((i) => i >= 0)
      .slice(0, CONFIG.seance.maxPlayedCards);
    const setup = classifySetup(validIndices.map((i) => seance.hand[i]!));
    const multi = computeMulti({
      setup,
      direction,
      tools: run.tools,
      trendSlope: ctx.snap.trendSlope,
      duration: CONFIG.seance.tradeDuration,
      exitByToolTakeProfit: false,
      twoPercentOk: false,
      journalBonus: run.journalBonus,
      formationBonus: run.formations[setup.type] ?? 0,
      ...(seance.stress ? { stressState: seance.stress.state } : {}),
    });
    return { direction, validIndices, score: multi.total * (1 + validIndices.length) };
  });
}

/** Joue la séance en cours jusqu'à sa fin. */
export function playSeance(run: RunState, leverage: number): void {
  const seance = run.seance;
  if (!seance) return;
  // Le robot Python « gaspille » une défausse quand il n'a rien à jeter : on reproduit ce compteur.
  let discardsLeft = seance.discards;
  while (run.phase === 'seance' && seance.status === 'playing') {
    const opts = options(run);
    const best = opts.reduce((a, b) => (b.score > a.score ? b : a));
    const nValid = best.validIndices.length;
    const slack = seance.candlesLeft - CONFIG.seance.tradeDuration * seance.orders;
    let chosen: Option | null = null;

    if (nValid >= 2 || (nValid === 1 && discardsLeft === 0 && slack < 1)) {
      chosen = best;
    } else if (discardsLeft > 0) {
      const usable = new Set(opts.flatMap((o) => o.validIndices));
      // Cartes valides dans une direction mais au-delà des 3 premières : le robot les garde aussi.
      const ctx = handContext(run);
      seance.hand.forEach((id, i) => {
        if (checkCard(id, 'long', ctx).valid || checkCard(id, 'short', ctx).valid) usable.add(i);
      });
      const toDiscard = seance.hand.map((_, i) => i).filter((i) => !usable.has(i));
      discardsLeft--;
      if (toDiscard.length > 0 && seance.discards > 0) discardCards(run, toDiscard);
      continue;
    } else if (slack >= 1) {
      passCandle(run);
      continue;
    } else {
      chosen = best;
      if (nValid === 0) {
        const slope = handContext(run).snap.trendSlope ?? 0;
        const direction: Direction = slope > 0 ? 'long' : 'short';
        chosen = opts.find((o) => o.direction === direction) ?? best;
      }
    }

    const stake = run.capital;
    const lev = leverage;
    let finalStake = stake;
    if (run.tools.includes('twoPercentRule') && run.tools.includes('stopLoss')) {
      finalStake = Math.min(run.capital, (CONFIG.tools.twoPercentRule.maxRiskPct * run.capital) / CONFIG.tools.stopLoss.stopPct / lev);
    }
    openPosition(run, {
      direction: chosen.direction,
      stake: finalStake,
      leverage: lev,
      stopLossPct: null,
      takeProfitPct: null,
      duration: CONFIG.seance.tradeDuration,
      cardIndices: chosen.validIndices,
    });
  }
}

export interface RunOutcome {
  /** Résultat de chaque séance jouée (true = réussie). */
  results: boolean[];
  capital: number;
}

/** Run du GDD 7.3 : la vie du trader (GDD 13) est désactivée. */
export function simulateRun(seed: number, build: Build): RunOutcome {
  const run = createRun(seed, { events: SIM_EVENTS, life: false });
  const results: boolean[] = [];
  for (let i = 0; i < CONFIG.run.seanceCount; i++) {
    run.tools = [...(build.tools[i] ?? [])];
    beginSeance(run);
    playSeance(run, build.leverage[i] ?? 2);
    const won = run.phase === 'summary';
    results.push(won);
    if (!won) break;
    finishSummary(run);
    if (run.phase === 'entracte') leaveEntracte(run);
    if (run.phase === 'shop') leaveShop(run);
  }
  return { results, capital: run.capital };
}

/** Taux de réussite par séance, parmi les runs qui atteignent cette séance. */
export function passRates(outcomes: readonly RunOutcome[]): { rate: number; reached: number }[] {
  return Array.from({ length: CONFIG.run.seanceCount }, (_, i) => {
    const reached = outcomes.filter((o) => o.results.length > i);
    const passed = reached.filter((o) => o.results[i]).length;
    return { rate: reached.length > 0 ? passed / reached.length : NaN, reached: reached.length };
  });
}
