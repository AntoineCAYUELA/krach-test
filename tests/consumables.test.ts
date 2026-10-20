// Un test par consommable (GDD 6.1).
import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config.ts';
import { CARD_IDS } from '../src/engine/cards.ts';
import { peekFuture } from '../src/engine/market.ts';
import { canUseConsumable, openPosition, previewPosition, signalPackOffers, useConsumable } from '../src/engine/run.ts';
import { flatHistory, order, scriptedRun, startedRun, steadyFuture } from './runHelpers.ts';

describe('les 6 consommables', () => {
  it('Rapport d’analyste : +10 % de chance sur le prochain trade seulement', () => {
    const run = scriptedRun(flatHistory(), steadyFuture(0.01, 6));
    const before = previewPosition(run, order()).chance.value;
    run.consumables = ['analystReport', 'analystReport'];
    const outcome = useConsumable(run, 0);
    expect(outcome.message).toContain('+10 %');
    expect(canUseConsumable(run, 'analystReport')).toBe(false);
    const boosted = previewPosition(run, order()).chance;
    expect(boosted.value).toBeCloseTo(before + 0.1, 12);
    expect(boosted.terms).toContainEqual({ label: 'Rapport d’analyste', value: 10 });
    const record = openPosition(run, order());
    expect(record.chance.value).toBeCloseTo(before + 0.1, 12);
    expect(run.seance!.analystBoost).toBe(false);
    expect(previewPosition(run, order()).chance.value).toBeCloseTo(before, 12);
  });

  it('Formation : +0,5 Multi permanent sur le setup choisi', () => {
    const run = startedRun();
    run.consumables = ['training', 'training'];
    useConsumable(run, 0, { setupType: 'feeling' });
    useConsumable(run, 0, { setupType: 'feeling' });
    expect(run.formations.feeling).toBe(1);
    expect(previewPosition(run, order()).multi.total).toBe(1 + 1);
  });

  it('Pack de signaux : ajoute une carte proposée, ou en retire une', () => {
    const run = startedRun();
    run.consumables = ['signalPack', 'signalPack'];
    const offers = signalPackOffers(run);
    expect(offers).toHaveLength(CONFIG.consumables.signalPack.choices);
    expect(new Set(offers).size).toBe(offers.length);
    const deckSize = run.deck.length;
    useConsumable(run, 0, { addCard: offers[0]! });
    expect(run.deck).toHaveLength(deckSize + 1);
    expect(run.seance!.drawPile).toContain(offers[0]);
    useConsumable(run, 0, { removeCard: 'hammer' });
    expect(run.deck.filter((id) => id === 'hammer')).toHaveLength(offers[0] === 'hammer' ? 1 : 0);
    run.consumables = ['signalPack'];
    const notOffered = CARD_IDS.find((id) => !signalPackOffers(run).includes(id))!;
    expect(() => useConsumable(run, 0, { addCard: notOffered })).toThrow('non proposée');
  });

  it('Couverture : le P&L net du prochain trade est divisé par 2', () => {
    const plain = scriptedRun(flatHistory(), steadyFuture(0.01));
    const hedged = scriptedRun(flatHistory(), steadyFuture(0.01));
    hedged.consumables = ['hedge'];
    useConsumable(hedged, 0);
    expect(canUseConsumable(hedged, 'hedge')).toBe(false);
    const a = openPosition(plain, order());
    const b = openPosition(hedged, order());
    expect(b.hedged).toBe(true);
    expect(b.pnlNet).toBeCloseTo(a.pnlNet * 0.5, 10);
    expect(hedged.capital).toBeCloseTo(CONFIG.run.startingCapital + a.pnlNet * 0.5, 10);
    expect(hedged.seance!.hedgeActive).toBe(false);
  });

  it('Ordre supplémentaire : +1 ordre', () => {
    const run = startedRun();
    run.consumables = ['extraOrder'];
    useConsumable(run, 0);
    expect(run.seance!.orders).toBe(CONFIG.seance.orders + 1);
  });

  it('Boule de cristal : montre l’issue du prochain trade, sans changer le marché', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const plain = startedRun(seed);
      const run = startedRun(seed);
      const next = peekFuture(run.seance!.market, 0)!;
      expect(previewPosition(run, order()).crystal).toBeNull();
      run.consumables = ['crystalBall'];
      useConsumable(run, 0);
      expect(peekFuture(run.seance!.market, 0)).toEqual(next);
      const crystal = previewPosition(run, order()).crystal;
      expect(crystal).toBe(run.seance!.roll < previewPosition(run, order()).chance.value ? 'takeProfit' : 'stopLoss');
      const record = openPosition(run, order());
      if (!record.trade.gapped) expect(record.trade.exitReason).toBe(crystal);
      expect(record.trade.candles).toEqual(openPosition(plain, order()).trade.candles);
      expect(run.seance!.crystalBall).toBe(false);
    }
  });

  it('en boutique, seuls Formation et Pack de signaux sont utilisables', () => {
    const run = startedRun();
    run.phase = 'shop';
    expect(canUseConsumable(run, 'training')).toBe(true);
    expect(canUseConsumable(run, 'signalPack')).toBe(true);
    expect(canUseConsumable(run, 'hedge')).toBe(false);
    expect(canUseConsumable(run, 'crystalBall')).toBe(false);
  });
});
