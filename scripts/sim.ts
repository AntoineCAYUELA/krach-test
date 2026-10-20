// Simulation headless d'équilibrage (npm run sim) : compare le robot naïf au tableau du GDD 7.3.
// Usage : node scripts/sim.ts [nombre de runs par construction, 5000 par défaut]

import { BUILDS, passRates, simulateRun } from '../src/sim/bot.ts';

/** Tableau 7.3 du GDD (en %), null = case non comparable (échantillon trop petit). */
const GDD_TABLE: Record<string, (number | null)[]> = {
  'Aucun Outil': [88, 84, 76, 66, 49, 28, 18, null],
  'Communs seulement': [88, 85, 79, 72, 60, 44, 30, 34],
  Synergies: [88, 85, 79, 72, 81, 80, 74, 74],
};

/** Cases vérifiées par le prompt : « Aucun Outil » S1 à S6, « Synergies » S1 à S8. */
const CHECKED: Record<string, number> = { 'Aucun Outil': 6, Synergies: 8 };
const TOLERANCE = 8;

const runs = Number(process.argv[2] ?? 5000);
let failures = 0;
const start = Date.now();

for (const build of BUILDS) {
  const outcomes = Array.from({ length: runs }, (_, seed) => simulateRun(seed + 1, build));
  const rates = passRates(outcomes);
  const expected = GDD_TABLE[build.name];
  const checkedUpTo = CHECKED[build.name] ?? 0;
  const cells = rates.map((r, i) => {
    const value = Number.isNaN(r.rate) ? '  —' : `${Math.round(r.rate * 100)}`.padStart(3);
    const target = expected?.[i];
    if (i < checkedUpTo && target != null) {
      const ok = Math.abs(r.rate * 100 - target) <= TOLERANCE;
      if (!ok) failures++;
      return `${value} (${target}${ok ? ' ✓' : ' ✗'})`;
    }
    return `${value}`;
  });
  console.log(`${build.name.padEnd(22)} ${cells.join(' | ')}`);
  console.log(`${''.padEnd(22)} runs atteignant chaque séance : ${rates.map((r) => r.reached).join(' / ')}`);
}

console.log(`\n${runs} runs par construction, ${((Date.now() - start) / 1000).toFixed(1)} s.`);
console.log(failures === 0 ? `Toutes les cases vérifiées sont à ±${TOLERANCE} points du GDD.` : `${failures} case(s) hors tolérance (±${TOLERANCE} points).`);
process.exit(failures === 0 ? 0 : 1);
