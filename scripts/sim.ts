// Calibrage : taux de parties gagnées par palier, sans puis avec achats en boutique.
// Usage : npm run sim [-- nombre de parties par cas]
import { winRate } from '../src/sim/bot.ts';
import { TIERS } from '../src/engine/tiers.ts';

const games = Number(process.argv[2] ?? 1000);
const errors = [0, 0.1, 0.2, 0.3];
const row = (tier: number, shop: boolean): string =>
  errors.map((e) => `${Math.round(winRate(tier, { errorRate: e, shop }, games) * 100)} %`.padStart(5)).join('  ');

console.log(`${games} parties par cas, joueur qui lit les signes avec 0 / 10 / 20 / 30 % d'erreurs\n`);
for (const tier of TIERS) {
  console.log(`${tier.name} (${tier.novelty})`);
  console.log(`  sans boutique : ${row(tier.id, false)}`);
  if (tier.id >= 2) console.log(`  avec boutique : ${row(tier.id, true)}`);
}
