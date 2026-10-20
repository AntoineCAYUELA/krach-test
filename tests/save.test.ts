// Sauvegarde et reprise (jalon 7) : l'état d'une run est un objet JSON simple.
// Une run sauvegardée puis rechargée doit continuer exactement comme l'originale.
import { describe, expect, it } from 'vitest';
import { discardCards, finishSummary, leaveEntracte, leaveShop, openPosition, passCandle, type RunState } from '../src/engine/run.ts';
import { rerollShop } from '../src/engine/shop.ts';
import { order, startedRun } from './runHelpers.ts';

function roundTrip(run: RunState): RunState {
  return JSON.parse(JSON.stringify(run)) as RunState;
}

/** Une suite d'actions qui touche à tous les hasards : pioche, marché, boutique. */
function play(run: RunState): void {
  discardCards(run, [0, 2]);
  passCandle(run);
  openPosition(run, order({ stake: 300, cardIndices: [1] }));
  run.seance!.quota = 0;
  passCandle(run);
  finishSummary(run);
  leaveEntracte(run);
  run.primes = 50;
  rerollShop(run);
  leaveShop(run);
}

describe('sauvegarde', () => {
  it('une run rechargée en pleine séance continue à l’identique', () => {
    const original = startedRun(31);
    passCandle(original);
    const restored = roundTrip(original);
    play(original);
    play(restored);
    expect(restored).toEqual(original);
  });

  it('une run rechargée en boutique propose les mêmes relances', () => {
    const original = startedRun(8);
    original.seance!.quota = 0;
    passCandle(original);
    finishSummary(original);
    leaveEntracte(original);
    original.primes = 50;
    const restored = roundTrip(original);
    rerollShop(original);
    rerollShop(restored);
    expect(restored.shop).toEqual(original.shop);
  });
});
