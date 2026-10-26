// Sauvegarde dans le navigateur (GDD v3, section 9). Chaque accès est protégé :
// navigation privée ou stockage bloqué ne doivent jamais casser le jeu.
import { createProgress, type Progress } from '../engine/progress.ts';
import type { RunState } from '../engine/run.ts';

const KEYS = {
  run: 'krach-test/v3/run',
  progress: 'krach-test/v3/progress',
  settings: 'krach-test/v3/settings',
};

export interface Settings {
  muted: boolean;
  /** Animation rapide (tests automatiques, joueurs pressés). */
  fast: boolean;
}

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // stockage indisponible : la partie continue sans sauvegarde
  }
}

export function loadRun(): RunState | null {
  const run = read<RunState>(KEYS.run);
  return run && run.version === 1 ? run : null;
}

export const saveRun = (run: RunState): void => write(KEYS.run, run);

export function clearRun(): void {
  try {
    localStorage.removeItem(KEYS.run);
  } catch {
    // rien à faire
  }
}

export function loadProgress(): Progress {
  const p = read<Progress>(KEYS.progress);
  return p && p.version === 1 ? p : createProgress();
}

export const saveProgress = (p: Progress): void => write(KEYS.progress, p);

export function loadSettings(): Settings {
  return { muted: false, fast: false, ...read<Partial<Settings>>(KEYS.settings) };
}

export const saveSettings = (s: Settings): void => write(KEYS.settings, s);
