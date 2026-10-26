// Calibrage : taux de parties gagnées par palier, sans Outils ni Cartes.
// Usage : npm run sim [-- nombre de parties par cas]
import { winRate } from '../src/sim/bot.ts';
import { TIERS } from '../src/engine/tiers.ts';

const games = Number(process.argv[2] ?? 2000);
console.log(`${games} parties par cas, joueur qui lit les signes avec 0 / 10 / 20 / 30 % d'erreurs\n`);
for (const tier of TIERS) {
  const rates = [0, 0.1, 0.2, 0.3].map((e) => `${Math.round(winRate(tier.id, e, games) * 100)} %`.padStart(5));
  console.log(`${tier.name} (${tier.novelty}) : ${rates.join('  ')}`);
}
