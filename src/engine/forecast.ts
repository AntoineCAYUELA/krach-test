// Prévision affichée sur le ticket (GDD 2.7) : contexte de marché, chance de toucher le take-profit,
// distances du stop-loss et du take-profit. Le marché respecte exactement la chance affichée,
// sauf quand une news fait sauter un niveau par un gap (GDD 5.2).

import { CONFIG } from '../config.ts';
import { CARDS } from './cards.ts';
import type { IndicatorSnapshot } from './indicators.ts';
import type { CardId, Direction, MarketContext } from './types.ts';

export const CONTEXT_NAMES: Record<MarketContext, string> = {
  up: 'Tendance haussière',
  down: 'Tendance baissière',
  flat: 'Sans tendance',
};

/** Direction de la tendance du contexte, ou null sans tendance. */
export function contextDirection(context: MarketContext): Direction | null {
  return context === 'up' ? 'long' : context === 'down' ? 'short' : null;
}

/** Contexte visible : pente de MM20 rapportée à MM20, et position du Close par rapport à MM20. */
export function marketContext(snap: IndicatorSnapshot, close: number): MarketContext {
  if (snap.sma20 === null || snap.trendSlope === null) return 'flat';
  const slope = snap.trendSlope / snap.sma20;
  const threshold = CONFIG.forecast.trendThreshold;
  if (slope >= threshold && close > snap.sma20) return 'up';
  if (slope <= -threshold && close < snap.sma20) return 'down';
  return 'flat';
}

export interface CardBonus {
  /** En points de pourcentage (12 = +12 %). */
  value: number;
  why: string;
}

/** Bonus d'une carte valide jouée dans `direction`, selon son rôle et le contexte (GDD 2.7). */
export function cardBonus(id: CardId, direction: Direction, context: MarketContext): CardBonus {
  const F = CONFIG.forecast;
  const trend = contextDirection(context);
  if (CARDS[id].role === 'reversal') {
    if (trend === null) return { value: F.reversal.flat, why: 'retournement sans tendance' };
    if (trend === direction) return { value: F.reversal.withTrend, why: 'repli dans la tendance' };
    return { value: F.reversal.againstTrend, why: 'retournement contre la tendance' };
  }
  if (trend === null) return { value: F.continuation.flat, why: 'sans tendance, souvent un faux signal' };
  if (trend === direction) return { value: F.continuation.withTrend, why: 'dans le sens de la tendance' };
  return { value: F.continuation.againstTrend, why: 'contre la tendance' };
}

export interface ChanceTerm {
  label: string;
  /** En points de pourcentage. */
  value: number;
  card?: CardId;
}

export interface Chance {
  context: MarketContext;
  /** Chance de base = stop / (stop + take), en fraction (0,4 avec un ratio de 1,5). */
  base: number;
  terms: ChanceTerm[];
  /** Chance finale, bornée entre min et max (fraction). */
  value: number;
}

export interface ChanceInput {
  context: MarketContext;
  direction: Direction;
  /** Cartes valides jouées (les invalides ne comptent pas). */
  validCards: readonly CardId[];
  stopUnits: number;
  takeUnits: number;
  /** Bonus du Rapport d'analyste, en points. */
  extraBonus?: { label: string; value: number };
}

export function computeChance(input: ChanceInput): Chance {
  const F = CONFIG.forecast;
  const base = input.stopUnits / (input.stopUnits + input.takeUnits);
  const terms: ChanceTerm[] = input.validCards.map((id) => {
    const bonus = cardBonus(id, input.direction, input.context);
    return { label: `${CARDS[id].name} (${bonus.why})`, value: bonus.value, card: id };
  });
  const families = new Set(input.validCards.map((id) => CARDS[id].family)).size;
  if (families > 1) terms.push({ label: `Confluence de ${families} familles`, value: F.confluencePerFamily * (families - 1) });
  if (input.extraBonus) terms.push({ label: input.extraBonus.label, value: input.extraBonus.value });
  const raw = base + terms.reduce((sum, t) => sum + t.value, 0) / 100;
  return { context: input.context, base, terms, value: Math.min(F.max, Math.max(F.min, raw)) };
}

/** Unité de risque u (fraction du prix d'entrée) : 2 σ sur 3 bougies, × √(durée / 3) sinon. */
export function riskUnit(sigma: number, duration: number): number {
  return CONFIG.forecast.unitSigmas * sigma * Math.sqrt(duration / CONFIG.seance.tradeDuration);
}
