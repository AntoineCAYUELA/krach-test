// Progression entre les parties (GDD v3, section 9) : paliers débloqués et records.

export interface Progress {
  version: 1;
  /** Plus haut palier jouable (1 au départ). */
  unlocked: number;
  /** Record par palier : plus gros capital de fin de partie gagnée. */
  records: Record<number, number>;
  /** Paliers gagnés au moins une fois. */
  beaten: number[];
  /** Termes du glossaire déjà expliqués par une bulle. */
  seenTerms: string[];
}

export const MAX_TIER = 5;

export function createProgress(): Progress {
  return { version: 1, unlocked: 1, records: {}, beaten: [], seenTerms: [] };
}

/** Partie gagnée : record éventuel et déblocage du palier suivant. Renvoie true si c'est un nouveau record. */
export function recordWin(progress: Progress, tier: number, capital: number): boolean {
  if (!progress.beaten.includes(tier)) progress.beaten.push(tier);
  progress.unlocked = Math.min(MAX_TIER, Math.max(progress.unlocked, tier + 1));
  const previous = progress.records[tier] ?? 0;
  if (capital > previous) {
    progress.records[tier] = capital;
    return true;
  }
  return false;
}

/** Marque un terme comme vu ; renvoie true la première fois. */
export function markSeen(progress: Progress, termId: string): boolean {
  if (progress.seenTerms.includes(termId)) return false;
  progress.seenTerms.push(termId);
  return true;
}
