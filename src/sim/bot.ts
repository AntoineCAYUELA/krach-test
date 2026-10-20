// Robot d'équilibrage (GDD 7.3). Il lit la prévision affichée comme un joueur prudent :
// il choisit les cartes qui maximisent la Performance attendue, ouvre si l'espérance de gain
// est positive, sinon défausse les cartes inutiles ou passe ; en fin de séance, il trade quand même.
// Taille : la plus petite dont la Performance attendue, sur les ordres restants, couvre ce qui
// manque au quota ; sinon la plus grande.

import { CONFIG } from '../config.ts';
import { checkCard } from '../engine/cards.ts';
import { computeChance } from '../engine/forecast.ts';
import { classifySetup, computeMulti } from '../engine/scoring.ts';
import {
  beginSeance,
  bracketUnits,
  createRun,
  currentContext,
  discardCards,
  finishSummary,
  handContext,
  leaveEntracte,
  leaveShop,
  openPosition,
  passCandle,
  previewPosition,
  type RunState,
} from '../engine/run.ts';
import { SIZE_IDS, type Direction, type EventId, type SizeId, type ToolId } from '../engine/types.ts';

export interface Build {
  name: string;
  /** Outils possédés à chaque séance (le robot ne passe pas par la boutique). */
  tools: ToolId[][];
}

const S: ToolId = 'stopLoss';

export const BUILDS: Build[] = [
  { name: 'Aucun Outil', tools: Array.from({ length: 8 }, () => []) },
  {
    name: 'Communs seulement',
    tools: [[], [S], [S, 'lowCostBroker'], [S, 'lowCostBroker', 'candleReader'], [S, 'lowCostBroker', 'candleReader', 'marketMaker'],
      [S, 'lowCostBroker', 'candleReader', 'marketMaker', 'rsiOscillator'], [S, 'lowCostBroker', 'candleReader', 'marketMaker', 'rsiOscillator'],
      [S, 'lowCostBroker', 'candleReader', 'marketMaker', 'rsiOscillator']],
  },
  {
    name: 'Synergies',
    tools: [[], [S], [S, 'candleReader'], [S, 'candleReader', 'chartist'], [S, 'candleReader', 'chartist', 'leverage'],
      [S, 'candleReader', 'chartist', 'trendFollower', 'leverage'], [S, 'quantAnalyst', 'chartist', 'trendFollower', 'leverage'],
      [S, 'quantAnalyst', 'chartist', 'trendFollower', 'leverage']],
  },
];

/** Contraintes simulées dans le GDD 7.3 (S2 et S6 sans tendance, S4 résultats, S8 Krach). */
export const SIM_EVENTS: (EventId | null)[] = [null, 'rangeMarket', null, 'earningsDay', null, 'rangeMarket', null, 'crash'];

export interface Option {
  direction: Direction;
  cardIndices: number[];
  chance: number;
  multi: number;
  gain: number;
  loss: number;
  /** Espérance de gain en $ (capital). */
  expectancy: number;
  /** Performance attendue : chance × gain × Multi + (1 − chance) × perte × 0,5. */
  value: number;
}

function subsets(indices: number[], max: number): number[][] {
  const result: number[][] = [[]];
  for (const i of indices) {
    const n = result.length;
    for (let k = 0; k < n; k++) {
      const s = result[k] as number[];
      if (s.length < max) result.push([...s, i]);
    }
  }
  return result;
}

/** Meilleure combinaison de cartes pour chaque direction. */
export function bestOptions(run: RunState, size: SizeId, duration: number = CONFIG.seance.tradeDuration): Option[] {
  const seance = run.seance;
  if (!seance) return [];
  const ctx = handContext(run);
  const context = currentContext(run);
  const units = bracketUnits(run);
  return (['long', 'short'] as const).map((direction) => {
    const base = previewPosition(run, { direction, size, duration, cardIndices: [] });
    const valid = seance.hand.map((id, i) => (checkCard(id, direction, ctx).valid ? i : -1)).filter((i) => i >= 0);
    let best: Option | null = null;
    for (const cardIndices of subsets(valid, CONFIG.seance.maxPlayedCards)) {
      const setup = classifySetup(cardIndices.map((i) => seance.hand[i]!));
      const chance = computeChance({ context, direction, validCards: setup.validCards, stopUnits: units.stop, takeUnits: units.take }).value;
      const multi = computeMulti({
        setup,
        direction,
        tools: run.tools,
        trendSlope: ctx.snap.trendSlope,
        duration,
        twoPercentOk: base.twoPercentOk,
        journalBonus: run.journalBonus,
        formationBonus: run.formations[setup.type] ?? 0,
        ...(seance.stress ? { stressState: seance.stress.state } : {}),
      }).total;
      const value = chance * base.gainAtTake * multi + (1 - chance) * base.lossAtStop * CONFIG.scoring.lossFactor;
      const expectancy = chance * base.gainAtTake + (1 - chance) * base.lossAtStop;
      if (!best || value > best.value) best = { direction, cardIndices, chance, multi, gain: base.gainAtTake, loss: base.lossAtStop, expectancy, value };
    }
    return best as Option;
  });
}

/** Taille choisie et meilleure option pour cette taille. */
function chooseSize(run: RunState): { size: SizeId; best: Option } {
  const seance = run.seance!;
  const missing = seance.quota - seance.performance;
  let fallback: { size: SizeId; best: Option } | null = null;
  for (const size of SIZE_IDS) {
    const best = bestOptions(run, size).reduce((a, b) => (b.value > a.value ? b : a));
    if (best.value * seance.orders >= missing) return { size, best };
    if (!fallback || best.value > fallback.best.value) fallback = { size, best };
  }
  return fallback!;
}

/** Joue la séance en cours jusqu'à sa fin. */
export function playSeance(run: RunState): void {
  const seance = run.seance;
  if (!seance) return;
  while (run.phase === 'seance' && seance.status === 'playing') {
    const { size, best } = chooseSize(run);
    const slack = seance.candlesLeft - CONFIG.seance.tradeDuration * seance.orders;
    if (best.expectancy <= 0) {
      const ctx = handContext(run);
      const useless = seance.hand.map((_, i) => i).filter((i) => !checkCard(seance.hand[i]!, 'long', ctx).valid && !checkCard(seance.hand[i]!, 'short', ctx).valid);
      if (seance.discards > 0 && useless.length > 0) {
        discardCards(run, useless);
        continue;
      }
      if (slack >= 1) {
        passCandle(run);
        continue;
      }
    }
    openPosition(run, { direction: best.direction, size, duration: CONFIG.seance.tradeDuration, cardIndices: best.cardIndices });
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
    playSeance(run);
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
