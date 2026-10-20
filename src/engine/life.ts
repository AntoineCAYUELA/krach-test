// Vie du trader (GDD 13) : stress, épargne, poste et logement.
// Fonctions pures sur l'état de vie ; les transitions de phase (entracte, voyage) sont dans run.ts.

import { CONFIG } from '../config.ts';
import { HOME_IDS, SETUP_IDS, type ActivityId, type HomeId, type SetupId } from './types.ts';

export type StressState = 'calm' | 'nervous' | 'tilt';

export const STRESS_NAMES: Record<StressState, string> = { calm: 'Calme', nervous: 'Nerveux', tilt: 'Tilt' };

export interface LifeState {
  stress: number;
  /** Épargne personnelle en €, distincte du capital et des Primes. */
  savings: number;
  setup: SetupId;
  home: HomeId;
  /** Retour de voyage : le prochain briefing commence par une revue de marché. */
  tripReview: boolean;
}

/** Stress d'une séance, fixé au briefing (GDD 13.2). */
export interface SeanceStress {
  /** Stress au début de la séance, après l'événement. */
  start: number;
  /** Stress ajouté par la séance à événement (0 sinon). */
  event: number;
  state: StressState;
  /** Fatigue de fin de séance, ajoutée quand la séance est réussie. */
  fatigue: number | null;
}

/** Stress pris par un trade : `delta` calculé, `after` après bornage à 0-100. */
export interface TradeStress {
  delta: number;
  after: number;
}

export interface EntracteState {
  salary: number;
  /** Stress avant la nuit au logement. */
  stressBefore: number;
  recovery: number;
  /** Une activité au plus par entracte. */
  activity: ActivityId | null;
}

export type Upgrade = 'setup' | 'home';

export function createLife(): LifeState {
  return { stress: CONFIG.life.stressStart, savings: CONFIG.life.savingsStart, setup: 'laptop', home: 'studio', tripReview: false };
}

export function clampStress(value: number): number {
  return Math.max(0, Math.min(CONFIG.life.stressMax, value));
}

export function stressState(stress: number): StressState {
  if (stress >= CONFIG.life.tilt.threshold) return 'tilt';
  if (stress >= CONFIG.life.nervous.threshold) return 'nervous';
  return 'calm';
}

/** Facteur appliqué au Multi des trades de la séance. */
export function stressMultiFactor(state: StressState): number {
  return state === 'tilt' ? CONFIG.life.tilt.multi : state === 'nervous' ? CONFIG.life.nervous.multi : 1;
}

export function setupFactor(life: LifeState): number {
  return CONFIG.life.setups[life.setup].factor;
}

/** Une hausse de stress pendant la séance est réduite par le poste ; chaque variation est arrondie. */
function seanceGain(life: LifeState, raw: number): number {
  return Math.round(raw > 0 ? raw * setupFactor(life) : raw);
}

export interface TradeStressInput {
  pnlNet: number;
  capitalBefore: number;
  leverage: number;
  liquidated: boolean;
}

/** Variation de stress d'un trade : levier + perte (ou gain), GDD 13.2. */
export function tradeStressDelta(life: LifeState, input: TradeStressInput): number {
  const L = CONFIG.life;
  let raw = L.leveragePerStep * Math.max(0, input.leverage - L.freeLeverage);
  if (input.pnlNet < 0) {
    const lossPct = input.capitalBefore > 0 ? (-input.pnlNet / input.capitalBefore) * 100 : 0;
    raw += L.lossFlat + L.lossPerCapitalPct * lossPct;
    if (input.liquidated) raw += L.liquidation;
  } else if (input.pnlNet > 0) {
    raw += L.win;
  }
  return seanceGain(life, raw);
}

export function fatigueDelta(life: LifeState): number {
  return seanceGain(life, CONFIG.life.seanceFatigue);
}

export function addStress(life: LifeState, delta: number): void {
  life.stress = clampStress(life.stress + delta);
}

/** Prochaine amélioration du poste ou du logement, ou null au dernier niveau. */
export function nextUpgrade(life: LifeState, kind: Upgrade): { id: SetupId | HomeId; price: number } | null {
  if (kind === 'setup') {
    const id = SETUP_IDS[SETUP_IDS.indexOf(life.setup) + 1];
    return id ? { id, price: CONFIG.life.setups[id].price } : null;
  }
  const id = HOME_IDS[HOME_IDS.indexOf(life.home) + 1];
  return id ? { id, price: CONFIG.life.homes[id].price } : null;
}
