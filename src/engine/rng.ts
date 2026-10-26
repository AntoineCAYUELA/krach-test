// Générateur pseudo-aléatoire reproductible (mulberry32).
// Un seul entier 32 bits d'état : la partie se sauvegarde en JSON et reprend à l'identique.

export interface Rng {
  s: number;
}

export function createRng(seed: number): Rng {
  return { s: seed >>> 0 };
}

/** Nombre flottant dans [0, 1). */
export function nextFloat(rng: Rng): number {
  rng.s = (rng.s + 0x6d2b79f5) >>> 0;
  let t = rng.s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Entier dans [0, n). */
export function nextInt(rng: Rng, n: number): number {
  return Math.floor(nextFloat(rng) * n);
}

/** Loi normale centrée réduite (Box-Muller). */
export function gauss(rng: Rng): number {
  let u = 0;
  while (u === 0) u = nextFloat(rng);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * nextFloat(rng));
}

export function pick<T>(rng: Rng, items: readonly T[]): T {
  const item = items[nextInt(rng, items.length)];
  if (item === undefined) throw new Error('pick : liste vide');
  return item;
}

export const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
