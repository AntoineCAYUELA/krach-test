// Simulation de la vie du trader (GDD 13.7) : effet du stress, des activités, du poste et du logement
// sur les taux de réussite du robot naïf.
// Usage : node scripts/sim-stress.ts [nombre de runs par cas, 3000 par défaut]
// Le robot joue chaque séance comme dans npm run sim, sans regarder son stress,
// et dépense son épargne à l'entracte selon une politique fixe.

import { CONFIG } from '../src/config.ts';
import { nextUpgrade, type Upgrade } from '../src/engine/life.ts';
import { beginSeance, buyUpgrade, chooseActivity, createRun, finishSummary, leaveEntracte, leaveShop, type RunState } from '../src/engine/run.ts';
import { ACTIVITY_IDS } from '../src/engine/types.ts';
import { BUILDS, passRates, playSeance, SIM_EVENTS, type Build, type RunOutcome } from '../src/sim/bot.ts';

type Policy = 'sans le système' | 'stress ignoré' | 'activités' | 'poste, puis activités' | 'logement, puis activités' | 'voyage dès 70';
const POLICIES: Policy[] = ['sans le système', 'stress ignoré', 'activités', 'poste, puis activités', 'logement, puis activités', 'voyage dès 70'];

/** Stress visé après l'entracte. */
const TARGET = 40;
const TRIP_FROM = 70;

/** Entracte du robot. Renvoie vrai s'il part en voyage (la boutique est alors sautée). */
function spend(run: RunState, policy: Policy): boolean {
  const life = run.life!;
  if (policy === 'stress ignoré') return false;
  const comfort: Upgrade[] | null = policy === 'poste, puis activités' ? ['setup', 'home'] : policy === 'logement, puis activités' ? ['home', 'setup'] : null;
  if (comfort && life.stress < TARGET) {
    const kind = comfort.find((k) => nextUpgrade(life, k) !== null);
    const next = kind ? nextUpgrade(life, kind) : null;
    if (kind && next && life.savings >= next.price) buyUpgrade(run, kind);
  }
  if (life.stress < TARGET) return false;
  const affordable = ACTIVITY_IDS.filter((id) => life.savings >= CONFIG.life.activities[id].price);
  if (policy === 'voyage dès 70' && life.stress >= TRIP_FROM && affordable.includes('trip')) {
    chooseActivity(run, 'trip');
    return true;
  }
  const local = affordable.filter((id) => id !== 'trip');
  const enough = local.find((id) => life.stress - CONFIG.life.activities[id].relief < TARGET);
  const activity = enough ?? local[local.length - 1];
  if (activity) chooseActivity(run, activity);
  return false;
}

interface Outcome extends RunOutcome {
  stress: number[];
  states: string[];
  spent: number;
}

function simulate(seed: number, build: Build, policy: Policy): Outcome {
  const run = createRun(seed, { events: SIM_EVENTS, life: policy !== 'sans le système' });
  const results: boolean[] = [];
  const stress: number[] = [];
  const states: string[] = [];
  let skippedShops = 0;
  let spent = 0;
  for (let i = 0; i < CONFIG.run.seanceCount; i++) {
    // Le robot ne passe pas par la boutique : chaque Voyage retarde sa construction d'une séance.
    const step = Math.max(0, i - skippedShops);
    run.tools = [...(build.tools[step] ?? [])];
    beginSeance(run);
    const seance = run.seance!;
    stress.push(seance.stress?.start ?? 0);
    states.push(seance.stress?.state ?? 'calm');
    playSeance(run, build.leverage[step] ?? 2);
    const won = run.phase === 'summary';
    results.push(won);
    if (!won) break;
    finishSummary(run);
    if (run.phase === 'entracte') {
      const before = run.life!.savings;
      if (spend(run, policy)) skippedShops++;
      spent += before - run.life!.savings;
      leaveEntracte(run);
    }
    if (run.phase === 'shop') leaveShop(run);
  }
  return { results, capital: run.capital, stress, states, spent };
}

const pct = (part: number, total: number) => (total > 0 ? `${Math.round((part / total) * 100)}`.padStart(3) : '  —');

const runs = Number(process.argv[2] ?? 3000);
const start = Date.now();
for (const build of BUILDS) {
  console.log(`\n${build.name}`);
  for (const policy of POLICIES) {
    const outcomes = Array.from({ length: runs }, (_, seed) => simulate(seed + 1, build, policy));
    const rates = passRates(outcomes);
    const cells = rates.map((r) => (Number.isNaN(r.rate) ? '  —' : `${Math.round(r.rate * 100)}`.padStart(3))).join(' |');
    const wins = outcomes.filter((o) => o.results.length === CONFIG.run.seanceCount && o.results.every(Boolean)).length;
    const spent = outcomes.reduce((a, o) => a + o.spent, 0) / runs;
    console.log(`  ${policy.padEnd(25)} ${cells}   victoires ${((wins / runs) * 100).toFixed(1).padStart(4)} %   dépensé ${Math.round(spent)} €   runs en S8 : ${rates[7]!.reached}`);
    if (policy === 'sans le système') continue;
    const column = <T>(pick: (o: Outcome) => T[], i: number) => outcomes.map((o) => pick(o)[i]).filter((v): v is T => v !== undefined);
    const series = (format: (i: number) => string) => Array.from({ length: CONFIG.run.seanceCount }, (_, i) => format(i)).join(' ');
    const avg = series((i) => {
      const v = column((o) => o.stress, i);
      return v.length ? `${Math.round(v.reduce((a, b) => a + b, 0) / v.length)}`.padStart(3) : '  —';
    });
    const share = (state: string) =>
      series((i) => {
        const v = column((o) => o.states, i);
        return pct(v.filter((s) => s === state || (state === 'nervous' && s === 'tilt')).length, v.length);
      });
    console.log(`  ${''.padEnd(25)} stress au départ ${avg}   nerveux ou tilt % ${share('nervous')}   tilt % ${share('tilt')}`);
  }
}
console.log(`\n${runs} runs par cas, ${((Date.now() - start) / 1000).toFixed(1)} s.`);
