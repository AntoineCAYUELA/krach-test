// Règles chiffrées du GDD v3 (sections 2 et 5) : un seul endroit pour équilibrer.

export const RULES = {
  startCapital: 1000,
  startPrice: 248.5,
  tradesPerSeance: 10,
  leadCandles: 12,
  signCandles: 3,
  tradeCandles: 5,
  rangeAmplitude: 0.011,
  drift: 0.0029,
  multiStep: 0.5,
  multiMax: 3,
} as const;

export type Direction = 'long' | 'short';

/** Multi de série : ×1, ×1,5, ×2… plafonné à ×3 (×4 avec le Carnet de bord). */
export function multiplier(streak: number, max: number = RULES.multiMax): number {
  return Math.min(max, 1 + RULES.multiStep * streak);
}

/** Effets des Outils et Cartes sur le règlement d'un trade (GDD v3, section 6). */
export interface Modifiers {
  /** Levier de la carte Doubler la mise (1 sinon). */
  lever: number;
  /** Bonus des Outils sur un gain, additionnés : +30 % et +50 % = 0,8. */
  bonus: number;
  multiMax: number;
  /** Stop-loss : une perte est plafonnée à −0,6 % du capital (× levier). */
  stopLoss: boolean;
  /** Assurance : une perte est annulée et la série gardée. */
  insured: boolean;
  /** Sang-froid : après une perte, la série est divisée par 2. */
  halfStreak: boolean;
}

export const NO_MODIFIERS: Modifiers = { lever: 1, bonus: 0, multiMax: RULES.multiMax, stopLoss: false, insured: false, halfStreak: false };

export const STOP_LOSS = 0.006;

export interface Settlement {
  /** P&L brut, levier compris. */
  raw: number;
  multi: number;
  gain: number;
  nextStreak: number;
  /** Bonus des Outils appliqué au gain (0 sur une perte). */
  bonus: number;
  /** La perte a été réduite par le Stop-loss. */
  capped: boolean;
  /** La perte a été annulée par l'Assurance. */
  insured: boolean;
}

/**
 * P&L brut = capital × (sortie / entrée − 1) × sens (+1 long, −1 short) × levier.
 * Un gain prend le bonus des Outils puis le multi de série. Une perte prend le plafond du
 * Stop-loss, jamais le multi, et remet la série à 0.
 */
export function settle(
  capital: number, direction: Direction, entry: number, exit: number, streak: number, mods: Modifiers = NO_MODIFIERS,
): Settlement {
  const sign = direction === 'long' ? 1 : -1;
  const raw = capital * (exit / entry - 1) * sign * mods.lever;
  if (raw > 0) {
    const multi = multiplier(streak, mods.multiMax);
    return { raw, multi, gain: raw * (1 + mods.bonus) * multi, nextStreak: streak + 1, bonus: mods.bonus, capped: false, insured: false };
  }
  if (mods.insured) return { raw, multi: 1, gain: 0, nextStreak: streak, bonus: 0, capped: false, insured: true };
  const floor = -STOP_LOSS * capital * mods.lever;
  const capped = mods.stopLoss && raw < floor;
  return {
    raw,
    multi: 1,
    gain: capped ? floor : raw,
    nextStreak: mods.halfStreak ? Math.floor(streak / 2) : 0,
    bonus: 0,
    capped,
    insured: false,
  };
}

/** Prix en tickets du k-ième trade bonus de la partie (1, puis 2, puis 3…). */
export function bonusTradeCost(alreadyBought: number): number {
  return alreadyBought + 1;
}

/**
 * Gros trade (bible, section 8) : Doubler la mise jouée, la série est à ×2 ou plus, ou un trade moyen
 * rapporterait au moins la moitié de ce qui manque pour payer le loyer.
 * Un trade moyen bouge le prix d'environ 1,5 % (5 bougies × 0,29 %).
 */
export function isBigTrade(capital: number, streak: number, remaining: number, lever = 1, multiMax: number = RULES.multiMax): boolean {
  if (lever > 1) return true;
  const multi = multiplier(streak, multiMax);
  if (multi >= 2) return true;
  if (remaining <= 0) return false;
  return capital * 0.015 * multi >= remaining * 0.5;
}
