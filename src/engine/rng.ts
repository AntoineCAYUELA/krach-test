// Générateur pseudo-aléatoire reproductible (GDD 2.4 « Aléatoire reproductible »).
// mulberry32 : un seul entier 32 bits d'état, donc facile à sauvegarder en JSON.

export interface RngState {
  s: number;
}

export function createRng(seed: number): RngState {
  return { s: seed >>> 0 };
}

/** Nombre flottant dans [0, 1). */
export function nextFloat(rng: RngState): number {
  rng.s = (rng.s + 0x6d2b79f5) >>> 0;
  let t = rng.s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Entier dans [0, n). */
export function nextInt(rng: RngState, n: number): number {
  return Math.floor(nextFloat(rng) * n);
}

export function uniform(rng: RngState, min: number, max: number): number {
  return min + (max - min) * nextFloat(rng);
}

/** Loi normale centrée réduite (méthode de Box-Muller). */
export function gaussian(rng: RngState): number {
  const u1 = 1 - nextFloat(rng); // dans (0, 1], évite log(0)
  const u2 = nextFloat(rng);
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

export function pick<T>(rng: RngState, items: readonly T[]): T {
  if (items.length === 0) throw new Error('pick: liste vide');
  return items[nextInt(rng, items.length)] as T;
}

/** Tirage pondéré : les poids n'ont pas besoin de sommer à 1. */
export function weightedPick<T>(rng: RngState, entries: readonly (readonly [T, number])[]): T {
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = nextFloat(rng) * total;
  for (const [item, weight] of entries) {
    roll -= weight;
    if (roll < 0) return item;
  }
  const last = entries[entries.length - 1];
  if (!last) throw new Error('weightedPick: liste vide');
  return last[0];
}

/** Mélange de Fisher-Yates, sur place. */
export function shuffle<T>(rng: RngState, items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = nextInt(rng, i + 1);
    const tmp = items[i] as T;
    items[i] = items[j] as T;
    items[j] = tmp;
  }
  return items;
}

/**
 * Graine dérivée (hachage FNV-1a) : chaque flux de hasard (marché de la séance 3, boutique 2…)
 * a sa propre graine. Ainsi, la même graine de run donne les mêmes marchés quels que soient
 * les choix du joueur.
 */
export function deriveSeed(seed: number, ...parts: (string | number)[]): number {
  const text = [seed, ...parts].join(':');
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Graine aléatoire pour une nouvelle partie (hors moteur : n'est jamais appelée par les règles). */
export function randomSeed(): number {
  return Math.floor(Math.random() * 4294967296) >>> 0;
}
