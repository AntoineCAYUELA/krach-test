// Accès au localStorage, protégé : en navigation privée ou si le stockage est bloqué,
// le jeu fonctionne sans sauvegarde (le bouton « Continuer » est alors masqué).

import type { RunState } from '../engine/run.ts';

const PREFIX = 'krach-test/';

function probe(): boolean {
  try {
    const key = `${PREFIX}probe`;
    localStorage.setItem(key, '1');
    localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

export const storageAvailable = probe();

function read<T>(key: string): T | null {
  if (!storageAvailable) return null;
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw === null ? null : (JSON.parse(raw) as T);
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  if (!storageAvailable) return;
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // Quota dépassé ou stockage bloqué : on continue sans sauvegarde.
  }
}

function remove(key: string): void {
  if (!storageAvailable) return;
  try {
    localStorage.removeItem(PREFIX + key);
  } catch {
    // Rien à faire.
  }
}

// --- Run en cours

export function loadRun(): RunState | null {
  const run = read<RunState>('run');
  return run && run.version === 1 ? run : null;
}

export function saveRun(run: RunState | null): void {
  if (!run || run.phase === 'victory' || run.phase === 'defeat') remove('run');
  else write('run', run);
}

// --- Termes du glossaire déjà rencontrés

export function loadSeenTerms(): Set<string> {
  return new Set(read<string[]>('seen-terms') ?? []);
}

export function saveSeenTerms(seen: Set<string>): void {
  write('seen-terms', [...seen]);
}

// --- Réglages

export interface Settings {
  fastAnimation: boolean;
  chart: { sma5: boolean; sma20: boolean; volume: boolean; levels: boolean; rsi: boolean };
}

export const DEFAULT_SETTINGS: Settings = {
  fastAnimation: false,
  chart: { sma5: true, sma20: true, volume: true, levels: true, rsi: true },
};

export function loadSettings(): Settings {
  const saved = read<Partial<Settings>>('settings');
  return { ...DEFAULT_SETTINGS, ...saved, chart: { ...DEFAULT_SETTINGS.chart, ...saved?.chart } };
}

export function saveSettings(settings: Settings): void {
  write('settings', settings);
}

// --- Premier lancement (avertissement de risque et tutoriel)

export function isOnboarded(): boolean {
  return read<boolean>('onboarded') === true;
}

export function setOnboarded(): void {
  write('onboarded', true);
}

export function clearAll(): void {
  for (const key of ['run', 'seen-terms', 'settings', 'onboarded']) remove(key);
}
