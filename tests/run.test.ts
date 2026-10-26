import { describe, expect, it } from 'vitest';
import { readingFor } from '../src/engine/market.ts';
import {
  beginTrade, buyBonusTrade, cashOut, createRun, finishTrade, keepTrading, nextSeance, quota, seanceGain, startSeance,
  type RunState,
} from '../src/engine/run.ts';
import { RULES } from '../src/engine/rules.ts';
import { playRun } from '../src/sim/bot.ts';

const opposite = (d: 'long' | 'short'): 'long' | 'short' => (d === 'long' ? 'short' : 'long');

/** Joue bien jusqu'à atteindre le loyer avec des trades restants. */
function playToCashout(run: RunState): void {
  startSeance(run);
  while (run.phase === 'trading') {
    const lead = beginTrade(run);
    finishTrade(run, lead, readingFor(lead));
  }
}

describe('partie', () => {
  it('démarre avec 1000 $ et 10 trades', () => {
    const run = createRun(1, 1);
    expect(run.phase).toBe('intro');
    startSeance(run);
    expect(run.capital).toBe(RULES.startCapital);
    expect(run.tradesLeft).toBe(RULES.tradesPerSeance);
  });

  it('encaisser donne un ticket par trade restant', () => {
    const run = createRun(1, 2);
    playToCashout(run);
    expect(run.phase).toBe('cashout');
    expect(seanceGain(run)).toBeGreaterThanOrEqual(quota(run));
    const left = run.tradesLeft;
    expect(left).toBeGreaterThan(0);
    cashOut(run);
    expect(run.tickets).toBe(left);
    expect(run.lastCashOut).toBe(left);
    expect(run.phase).toBe('seanceWon');
    nextSeance(run);
    expect(run.seance).toBe(1);
    expect(run.phase).toBe('intro');
  });

  it('continuer garde les trades restants', () => {
    const run = createRun(1, 2);
    playToCashout(run);
    const left = run.tradesLeft;
    keepTrading(run);
    expect(run.phase).toBe('trading');
    expect(run.tradesLeft).toBe(left);
  });

  it('sans ticket, rater le loyer fait perdre', () => {
    const run = createRun(1, 3);
    startSeance(run);
    while (run.phase === 'trading') {
      const lead = beginTrade(run);
      finishTrade(run, lead, opposite(readingFor(lead)));
    }
    expect(run.phase).toBe('lost');
  });

  it('les trades bonus coûtent de plus en plus cher', () => {
    const run = createRun(1, 4);
    run.phase = 'bonus';
    run.tickets = 5;
    buyBonusTrade(run);
    expect(run.tickets).toBe(4);
    expect(run.tradesLeft).toBe(1);
    run.phase = 'bonus';
    buyBonusTrade(run);
    expect(run.tickets).toBe(2);
    run.phase = 'bonus';
    run.tickets = 2;
    expect(() => buyBonusTrade(run)).toThrow();
  });

  it('refuse une action hors de sa phase', () => {
    const run = createRun(1, 5);
    expect(() => beginTrade(run)).toThrow();
    expect(() => cashOut(run)).toThrow();
  });

  it('reprend une sauvegarde au même trade', () => {
    const run = createRun(3, 6);
    startSeance(run);
    const lead = beginTrade(run);
    finishTrade(run, lead, readingFor(lead));
    expect(run.phase).toBe('trading');
    const copy = JSON.parse(JSON.stringify(run)) as RunState;
    expect(beginTrade(copy)).toEqual(beginTrade(run));
  });

  it('un joueur parfait gagne le palier 1', () => {
    expect(playRun(1, 1000, 0).phase).toBe('won');
  });
});
