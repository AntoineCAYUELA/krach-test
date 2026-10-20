// Déroulé d'une séance et d'une run (GDD 2, 4, 8), boutique (GDD 6).
import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config.ts';
import { TOOLS } from '../src/data/tools.ts';
import {
  beginSeance,
  createRun,
  discardCards,
  finishSummary,
  leaveEntracte,
  leaveShop,
  openPosition,
  passCandle,
  type RunState,
} from '../src/engine/run.ts';
import { buyConsumable, buyTool, rerollCost, rerollShop, sellTool } from '../src/engine/shop.ts';
import type { Candle } from '../src/engine/types.ts';
import { candle } from './helpers.ts';
import { flatHistory, order, scriptedRun, startedRun, steadyFuture } from './runHelpers.ts';

/** Gagne la séance en cours en ramenant son quota à 0, puis passe une bougie. */
function winSeance(run: RunState): void {
  run.seance!.quota = 0;
  passCandle(run);
}

describe('séance', () => {
  it('démarre avec les ressources du GDD 2.2', () => {
    const run = startedRun();
    const s = run.seance!;
    expect([s.orders, s.discards, s.candlesLeft, s.hand.length, s.drawPile.length]).toEqual([5, 3, 24, 7, 13]);
    expect(s.market.candles).toHaveLength(40);
  });

  it('passer coûte 1 bougie ; la séance est perdue quand il reste moins de 3 bougies', () => {
    const run = startedRun();
    for (let i = 0; i < 21; i++) passCandle(run);
    expect(run.seance!.candlesLeft).toBe(3);
    expect(run.phase).toBe('seance');
    passCandle(run);
    expect(run.phase).toBe('defeat');
    expect(run.defeatCause).toBe('quota');
  });

  it('défausser coûte 1 défausse et repioche autant de cartes', () => {
    const run = startedRun();
    const s = run.seance!;
    discardCards(run, [0, 1]);
    expect(s.discards).toBe(2);
    expect(s.hand).toHaveLength(7);
    expect(s.discardPile).toHaveLength(2);
    expect(s.drawPile).toHaveLength(11);
  });

  it('la pioche vide se reforme avec la défausse', () => {
    const run = startedRun();
    const s = run.seance!;
    s.discards = 10;
    for (let i = 0; i < 4; i++) discardCards(run, [0, 1, 2, 3, 4, 5, 6]);
    expect(s.hand).toHaveLength(7);
    expect(s.hand.length + s.drawPile.length + s.discardPile.length).toBe(20);
  });

  it('une position consomme 1 ordre et 3 bougies, et met à jour capital et Performance', () => {
    const run = scriptedRun(flatHistory(), steadyFuture(0.01));
    const record = openPosition(run, order());
    expect(run.seance!.orders).toBe(4);
    expect(run.seance!.candlesLeft).toBe(21);
    expect(run.capital).toBeCloseTo(1000 + record.pnlNet, 10);
    expect(record.pnlNet).toBeGreaterThan(0);
    expect(run.seance!.performance).toBeCloseTo(record.score.performance, 10);
  });

  it('une perte réduit la Performance de séance sans la rendre négative', () => {
    const run = scriptedRun(flatHistory(), steadyFuture(-0.01));
    openPosition(run, order());
    expect(run.capital).toBeLessThan(1000);
    expect(run.seance!.performance).toBe(0);
  });

  it('quota atteint : séance gagnée, Primes = base + ordres restants + intérêts', () => {
    const run = scriptedRun(flatHistory(), steadyFuture(0.01));
    run.seance!.quota = 1;
    const primes = run.primes;
    openPosition(run, order());
    expect(run.phase).toBe('summary');
    const rewards = run.seance!.rewards!;
    expect(rewards.base).toBe(CONFIG.rewards.normalSeance);
    expect(rewards.unusedOrders).toBe(4);
    expect(rewards.interest).toBe(4); // capital > 1 000 $ : 4 tranches de 250 $
    expect(run.primes).toBe(primes + rewards.total);
  });

  it('les intérêts sont plafonnés à +4 P et une séance à événement rapporte 5 P', () => {
    const run = createRun(1, { events: ['earningsDay', null, null, null, null, null, null, null] });
    beginSeance(run);
    run.capital = 5000;
    winSeance(run);
    expect(run.seance!.rewards).toMatchObject({ base: 5, interest: 4 });
  });

  it('le stop-loss automatique limite la perte d’une position', () => {
    const future: Candle[] = [candle(100, 100, 55, 58), candle(58, 59, 57, 58), candle(58, 59, 57, 58)];
    const run = scriptedRun(flatHistory(), future);
    const record = openPosition(run, order({ size: 'aggressive' }));
    expect(record.trade.exitReason).toBe('stopLoss');
    expect(record.trade.exitPrice).toBeCloseTo(100.1 * 0.97, 10);
    expect(run.capital).toBeGreaterThan(900);
  });

  it('capital sous 10 $ : compte liquidé, run perdue (gap de news à ×5)', () => {
    const future: Candle[] = [candle(55, 56, 54, 55), candle(55, 56, 54, 55), candle(55, 56, 54, 55)];
    const run = scriptedRun(flatHistory(), future, ['leverage']);
    const record = openPosition(run, order({ size: 'aggressive' }));
    expect(record.trade.exitReason).toBe('liquidation');
    expect(run.capital).toBe(0);
    expect(run.phase).toBe('defeat');
    expect(run.defeatCause).toBe('liquidation');
  });

  it('refuse les ordres hors règles', () => {
    const run = startedRun();
    expect(() => openPosition(run, order({ cardIndices: [0, 1, 2, 3] }))).toThrow('3 cartes');
    expect(() => openPosition(run, order({ cardIndices: [1, 1] }))).toThrow('deux fois');
    expect(() => openPosition(run, order({ duration: 1 }))).toThrow('Durée');
    run.capital = 15; // Prudent : mise de 7,50 $
    expect(() => openPosition(run, order({ size: 'prudent' }))).toThrow('Mise minimale');
  });

  it('le capital persiste d’une séance à l’autre', () => {
    const run = startedRun();
    run.capital = 1234;
    winSeance(run);
    finishSummary(run);
    leaveEntracte(run);
    leaveShop(run);
    expect(run.seanceIndex).toBe(1);
    expect(run.seance!.capitalAtStart).toBe(1234);
    expect(run.phase).toBe('briefing');
  });

  it('la même graine donne le même marché ; défausser ou passer ne le change pas', () => {
    const a = startedRun(77);
    const b = startedRun(77);
    discardCards(b, [0]);
    expect(a.seance!.market.candles).toEqual(b.seance!.market.candles);
    passCandle(a);
    passCandle(b);
    expect(a.seance!.market.candles).toEqual(b.seance!.market.candles);
  });

  it('la même graine et les mêmes ordres donnent les mêmes trades', () => {
    const play = () => {
      const run = startedRun(77);
      const records = [openPosition(run, order()), openPosition(run, order({ direction: 'short', size: 'prudent' }))];
      return { records: records.map((r) => [r.chance.value, r.trade.exitReason, r.pnlNet]), candles: run.seance!.market.candles };
    };
    expect(play()).toEqual(play());
  });

  it('victoire après la séance 8', () => {
    const run = startedRun();
    for (let i = 0; i < 8; i++) {
      if (i > 0) beginSeance(run);
      winSeance(run);
      finishSummary(run);
      if (i < 7) {
        leaveEntracte(run);
        leaveShop(run);
      }
    }
    expect(run.phase).toBe('victory');
    expect(run.history).toHaveLength(8);
  });
});

describe('boutique', () => {
  function shopRun(): RunState {
    const run = startedRun(9);
    winSeance(run);
    finishSummary(run);
    leaveEntracte(run);
    run.primes = 100;
    return run;
  }

  it('propose 2 Outils non possédés, sans doublon, et 2 consommables', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const run = startedRun(seed);
      run.tools = ['stopLoss', 'chartist'];
      winSeance(run);
      finishSummary(run);
      leaveEntracte(run);
      const tools = run.shop!.tools;
      expect(tools).toHaveLength(2);
      expect(tools[0]).not.toBe(tools[1]);
      for (const t of tools) expect(['stopLoss', 'chartist']).not.toContain(t);
      expect(run.shop!.consumables).toHaveLength(2);
      expect(run.shop!.consumables[0]).not.toBe(run.shop!.consumables[1]);
    }
  });

  it('achat, revente à moitié prix arrondie à l’inférieur', () => {
    const run = shopRun();
    const id = run.shop!.tools[0]!;
    buyTool(run, 0);
    expect(run.tools).toEqual([id]);
    expect(run.primes).toBe(100 - TOOLS[id].price);
    const before = run.primes;
    sellTool(run, 0);
    expect(run.primes).toBe(before + Math.floor(TOOLS[id].price / 2));
  });

  it('5 emplacements d’Outils et 2 de consommables au maximum', () => {
    const run = shopRun();
    run.tools = ['stopLoss', 'takeProfit', 'lowCostBroker', 'marketMaker', 'candleReader'];
    expect(() => buyTool(run, 0)).toThrow('pleins');
    run.consumables = ['hedge', 'hedge'];
    expect(() => buyConsumable(run, 0)).toThrow('pleins');
  });

  it('relance : 2 P puis +1 P à chaque relance', () => {
    const run = shopRun();
    expect(rerollCost(run.shop!)).toBe(2);
    rerollShop(run);
    expect(run.primes).toBe(98);
    expect(rerollCost(run.shop!)).toBe(3);
    rerollShop(run);
    expect(run.primes).toBe(95);
  });

  it('refuse un achat sans assez de Primes', () => {
    const run = shopRun();
    run.primes = 0;
    expect(() => buyTool(run, 0)).toThrow('Primes');
  });
});
