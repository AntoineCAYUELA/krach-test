// Joueur automatique pour calibrer les quotas : il lit les signes correctement,
// sauf une part d'erreurs choisie, encaisse dès le quota et achète des trades bonus s'il peut.
import { readingFor } from '../engine/market.ts';
import { createRng, nextFloat } from '../engine/rng.ts';
import {
  beginTrade, buyBonusTrade, cashOut, createRun, finishTrade, nextSeance, startSeance, type RunState,
} from '../engine/run.ts';

/** Joue une partie complète ; renvoie l'état final (phase « won » ou « lost »). */
export function playRun(tier: number, seed: number, errorRate: number): RunState {
  const run = createRun(tier, seed);
  const errors = createRng(seed ^ 0x9e3779b9);
  for (let guard = 0; guard < 10_000; guard++) {
    switch (run.phase) {
      case 'intro':
        startSeance(run);
        break;
      case 'trading': {
        const lead = beginTrade(run);
        let dir = readingFor(lead);
        if (nextFloat(errors) < errorRate) dir = dir === 'long' ? 'short' : 'long';
        finishTrade(run, lead, dir);
        break;
      }
      case 'cashout':
        cashOut(run);
        break;
      case 'bonus':
        buyBonusTrade(run);
        break;
      case 'seanceWon':
        nextSeance(run);
        break;
      case 'won':
      case 'lost':
        return run;
    }
  }
  throw new Error('Partie sans fin');
}

export function winRate(tier: number, errorRate: number, games: number, firstSeed = 1000): number {
  let won = 0;
  for (let i = 0; i < games; i++) if (playRun(tier, firstSeed + i, errorRate).phase === 'won') won++;
  return won / games;
}
