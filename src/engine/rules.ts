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

/** Multi de série : ×1, ×1,5, ×2… plafonné à ×3. */
export function multiplier(streak: number): number {
  return Math.min(RULES.multiMax, 1 + RULES.multiStep * streak);
}

export interface Settlement {
  raw: number;
  multi: number;
  gain: number;
  nextStreak: number;
}

/**
 * P&L brut = capital × (sortie / entrée − 1) × sens (+1 long, −1 short).
 * Un gain est multiplié par la série ; une perte compte telle quelle et remet la série à 0.
 */
export function settle(capital: number, direction: Direction, entry: number, exit: number, streak: number): Settlement {
  const sign = direction === 'long' ? 1 : -1;
  const raw = capital * (exit / entry - 1) * sign;
  const multi = raw > 0 ? multiplier(streak) : 1;
  return { raw, multi, gain: raw * multi, nextStreak: raw > 0 ? streak + 1 : 0 };
}

/** Prix en tickets du k-ième trade bonus de la partie (1, puis 2, puis 3…). */
export function bonusTradeCost(alreadyBought: number): number {
  return alreadyBought + 1;
}

/**
 * Gros trade (bible, section 8) : la série est à ×2 ou plus, ou un trade moyen
 * rapporterait au moins la moitié de ce qui manque pour payer le loyer.
 * Un trade moyen bouge le prix d'environ 1,5 % (5 bougies × 0,29 %).
 */
export function isBigTrade(capital: number, streak: number, remaining: number): boolean {
  const multi = multiplier(streak);
  if (multi >= 2) return true;
  if (remaining <= 0) return false;
  return capital * 0.015 * multi >= remaining * 0.5;
}
