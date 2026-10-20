// Vie du trader (GDD 13) : stress, entracte, poste, logement, Voyage et revue de marché.
import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config.ts';
import { createLife, stressState, tradeStressDelta } from '../src/engine/life.ts';
import { marketReview } from '../src/engine/review.ts';
import {
  beginSeance,
  buyUpgrade,
  chooseActivity,
  createRun,
  finishSummary,
  leaveEntracte,
  leaveShop,
  openPosition,
  passCandle,
  type RunState,
} from '../src/engine/run.ts';
import { classifySetup, computeMulti } from '../src/engine/scoring.ts';
import type { EventId } from '../src/engine/types.ts';
import { fromCloses } from './helpers.ts';
import { flatHistory, order, scriptedRun, startedRun, steadyFuture } from './runHelpers.ts';

/** Gagne la séance en cours (quota ramené à 0) et ouvre l'entracte. */
function toEntracte(run: RunState): void {
  run.seance!.quota = 0;
  passCandle(run);
  finishSummary(run);
}

describe('stress d’un trade (GDD 13.2)', () => {
  it('reprend l’exemple chiffré : PC tour, levier ×5, perte de 4 % puis gain', () => {
    const life = { ...createLife(), setup: 'tower' as const };
    expect(tradeStressDelta(life, { pnlNet: -40, capitalBefore: 1000, leverage: 5, liquidated: false })).toBe(14);
    expect(tradeStressDelta(life, { pnlNet: 40, capitalBefore: 1000, leverage: 5, liquidated: false })).toBe(6);
  });

  it('sans levier, un gain retire 2 points ; une liquidation ajoute 25 points', () => {
    const life = createLife();
    expect(tradeStressDelta(life, { pnlNet: 10, capitalBefore: 1000, leverage: 2, liquidated: false })).toBe(-2);
    // Perte de 20 % : 3 + 1,5 × 20 + 25 = 58.
    expect(tradeStressDelta(life, { pnlNet: -200, capitalBefore: 1000, leverage: 1, liquidated: true })).toBe(58);
  });

  it('paliers : calme jusqu’à 49, nerveux de 50 à 79, tilt à partir de 80', () => {
    expect([49, 50, 79, 80, 100].map(stressState)).toEqual(['calm', 'nervous', 'nervous', 'tilt', 'tilt']);
  });

  it('le stress réduit le Multi comme un Outil multiplicatif', () => {
    const setup = classifySetup(['hammer', 'rsiOversold']);
    const base = { setup, direction: 'long' as const, tools: [], trendSlope: null, duration: 3, exitByToolTakeProfit: false, twoPercentOk: false, journalBonus: 0, formationBonus: 0 };
    const calm = computeMulti({ ...base, stressState: 'calm' });
    const tilt = computeMulti({ ...base, stressState: 'tilt' });
    expect(calm.terms).toEqual([]);
    expect(tilt.terms).toEqual([{ label: 'Stress : tilt', kind: 'mul', value: 0.6 }]);
    expect(tilt.total).toBeCloseTo(calm.total * 0.6, 10);
  });
});

describe('stress pendant la run', () => {
  it('démarre à 15, calme, avec 60 € d’épargne', () => {
    const run = startedRun();
    expect(run.life).toMatchObject({ stress: 15, savings: 60, setup: 'laptop', home: 'studio' });
    expect(run.seance!.stress).toEqual({ start: 15, event: 0, state: 'calm', fatigue: null });
  });

  it('une séance à événement ajoute 10 au briefing, avant de fixer l’état', () => {
    const events: (EventId | null)[] = [null, 'rangeMarket', null, null, null, null, null, 'crash'];
    const run = createRun(3, { events });
    run.life!.stress = 45;
    beginSeance(run);
    toEntracte(run);
    leaveEntracte(run);
    leaveShop(run);
    // 45 + fatigue 10 − nuit au studio 10, puis +10 pour l'événement.
    expect(run.seance!.stress).toEqual({ start: 55, event: 10, state: 'nervous', fatigue: null });
  });

  it('chaque trade enregistre son stress ; l’état de la séance ne change pas en cours de séance', () => {
    const run = scriptedRun(flatHistory(), steadyFuture(-0.01, 6));
    run.seance!.quota = 1e9;
    const record = openPosition(run, order({ stake: 1000, leverage: 2 }));
    // Perte d'environ 6 % du capital : 3 + 1,5 × 6,x ≈ 12 à 13 points.
    expect(record.stress!.delta).toBe(Math.round(3 + 1.5 * ((-record.pnlNet / 1000) * 100)));
    expect(record.stress!.after).toBe(15 + record.stress!.delta);
    run.life!.stress = 90;
    const second = openPosition(run, order({ stake: 500, leverage: 1 }));
    expect(second.multi.terms.some((t) => t.label.startsWith('Stress'))).toBe(false);
  });

  it('nerveux au briefing : chaque trade de la séance a le malus ×0,8', () => {
    const run = scriptedRun(flatHistory(), steadyFuture(0.01, 3));
    run.seance!.stress!.state = 'nervous';
    const record = openPosition(run, order({ cardIndices: [] }));
    expect(record.multi.terms).toContainEqual({ label: 'Stress : nerveux', kind: 'mul', value: 0.8 });
    expect(record.multi.total).toBeCloseTo(0.8, 10);
  });

  it('séance réussie : fatigue de 10, réduite par le poste', () => {
    const run = startedRun();
    run.life!.setup = 'dualScreen';
    run.seance!.quota = 0;
    passCandle(run);
    expect(run.seance!.stress!.fatigue).toBe(6);
    expect(run.life!.stress).toBe(21);
  });

  it('sans la vie du trader : ni stress ni entracte', () => {
    const run = createRun(1, { life: false });
    beginSeance(run);
    expect(run.seance!.stress).toBeNull();
    const record = openPosition(run, order());
    expect(record.stress).toBeNull();
    run.seance!.quota = 0;
    passCandle(run);
    finishSummary(run);
    expect(run.phase).toBe('shop');
  });
});

describe('entracte (GDD 13.3)', () => {
  it('verse le salaire et applique la nuit au logement', () => {
    const run = startedRun();
    toEntracte(run);
    expect(run.phase).toBe('entracte');
    expect(run.entracte).toEqual({ salary: 60, stressBefore: 25, recovery: 10, activity: null });
    expect(run.life).toMatchObject({ stress: 15, savings: 120 });
  });

  it('une seule activité, payée sur l’épargne', () => {
    const run = startedRun();
    toEntracte(run);
    expect(() => chooseActivity(run, 'trip')).toThrow('Épargne insuffisante');
    chooseActivity(run, 'spa');
    expect(run.life).toMatchObject({ stress: 0, savings: 70 });
    expect(() => chooseActivity(run, 'evening')).toThrow('Une seule activité');
  });

  it('améliorations dans l’ordre, tant que l’épargne suffit', () => {
    const run = startedRun();
    toEntracte(run);
    run.life!.savings = 500;
    expect(buyUpgrade(run, 'setup')).toBe('tower');
    expect(buyUpgrade(run, 'setup')).toBe('dualScreen');
    expect(() => buyUpgrade(run, 'setup')).toThrow('dernier niveau');
    expect(buyUpgrade(run, 'home')).toBe('t2');
    expect(run.life!.savings).toBe(500 - 100 - 200 - 120);
    expect(() => buyUpgrade(run, 'home')).toThrow('Épargne insuffisante');
  });

  it('les prix et effets suivent le GDD 13.3 et 13.4', () => {
    const L = CONFIG.life;
    expect(Object.values(L.activities).map((a) => [a.price, a.relief])).toEqual([[20, 15], [50, 30], [90, 50], [150, 100]]);
    expect(Object.values(L.setups).map((s) => [s.price, s.factor])).toEqual([[0, 1], [100, 0.8], [200, 0.6]]);
    expect(Object.values(L.homes).map((h) => [h.price, h.recovery])).toEqual([[0, 10], [120, 20], [250, 30]]);
  });

  it('sans activité, l’entracte mène à la boutique', () => {
    const run = startedRun();
    toEntracte(run);
    leaveEntracte(run);
    expect(run.phase).toBe('shop');
    expect(run.shop).not.toBeNull();
  });

  it('le Voyage remet le stress à 0 et saute la boutique ; la revue de marché s’affiche jusqu’au début de la séance', () => {
    const run = startedRun();
    toEntracte(run);
    run.life!.savings = 200;
    run.life!.stress = 85;
    const primes = run.primes;
    chooseActivity(run, 'trip');
    expect(run.life).toMatchObject({ stress: 0, savings: 50, tripReview: true });
    leaveEntracte(run);
    expect(run.phase).toBe('briefing');
    expect(run.shop).toBeNull();
    expect(run.seanceIndex).toBe(1);
    expect(run.primes).toBe(primes);
    beginSeance(run);
    expect(run.life!.tripReview).toBe(false);
  });

  it('pas d’entracte après la séance 8', () => {
    const run = startedRun();
    for (let i = 0; i < 8; i++) {
      if (i > 0) beginSeance(run);
      toEntracte(run);
      if (i < 7) {
        leaveEntracte(run);
        leaveShop(run);
      }
    }
    expect(run.phase).toBe('victory');
    expect(run.entracte).toBeNull();
  });
});

describe('revue de marché (GDD 13.6)', () => {
  it('résume variation, extrêmes, tendance, RSI et news de l’historique', () => {
    const closes = Array.from({ length: 40 }, (_, i) => 50 + i * 0.1);
    const candles = fromCloses(closes);
    candles[30] = { ...candles[30]!, news: { headline: 'NXC : prévisions annuelles revues à la hausse', sentiment: 'positive', gap: 0.042 } };
    const review = marketReview(candles);
    expect(review.candleCount).toBe(40);
    expect(review.change).toBeCloseTo(53.9 / 50 - 1, 10);
    expect(review.high).toBeCloseTo(53.9 * 1.002, 10);
    expect(review.low).toBeCloseTo(50 * 0.998, 10);
    expect(review.trend).toBe('up');
    expect(review.rsi).toBe(100);
    expect(review.rsiZone).toBe('overbought');
    expect(review.news).toEqual([{ candle: 31, headline: 'NXC : prévisions annuelles revues à la hausse', gap: 0.042 }]);
  });

  it('marché plat : pas de tendance nette', () => {
    expect(marketReview(flatHistory()).trend).toBe('flat');
  });
});
