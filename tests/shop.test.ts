import { describe, expect, it } from 'vitest';
import { CARDS, TOOLS, unlockedItems } from '../src/data/items.ts';
import { readingFor } from '../src/engine/market.ts';
import { createRng } from '../src/engine/rng.ts';
import {
  beginTrade, canPlayCard, cashOut, createRun, finishTrade, nextSeance, playCard, startSeance, toolBonus, type RunState,
} from '../src/engine/run.ts';
import {
  SHOP, buyCard, buyTool, canBuyTool, leaveShop, reroll, rerollCost, rollOffer, sellTool,
} from '../src/engine/shop.ts';

const all = unlockedItems([1, 2, 3, 4]);

/** Joue bien jusqu'à la boutique du mois 2 d'un palier 2. */
function toShop(seed = 11): RunState {
  const run = createRun(2, seed, all);
  startSeance(run);
  while (run.phase === 'trading') {
    const deal = beginTrade(run);
    finishTrade(run, deal, readingFor(deal.lead));
  }
  if (run.phase === 'cashout') cashOut(run);
  nextSeance(run);
  return run;
}

describe('déblocages', () => {
  it('suit la table du GDD', () => {
    const start = unlockedItems([]);
    expect(start.tools).toHaveLength(6);
    expect(start.cards.sort()).toEqual(['insurance', 'leverage', 'tickets']);
    expect(unlockedItems([1]).tools).toContain('contrarian');
    expect(unlockedItems([1]).cards).toContain('analyst');
    expect(unlockedItems([1, 2, 3, 4]).tools).toHaveLength(TOOLS.length);
    expect(unlockedItems([1, 2, 3, 4]).cards).toHaveLength(CARDS.length);
  });
});

describe('boutique', () => {
  it('propose 3 Outils non possédés et 2 Cartes différentes', () => {
    const luck = createRng(1);
    for (let i = 0; i < 50; i++) {
      const offer = rollOffer(luck, all, ['range', 'trend']);
      expect(offer.tools).toHaveLength(3);
      expect(new Set(offer.tools).size).toBe(3);
      expect(offer.tools).not.toContain('range');
      expect(offer.cards).toHaveLength(2);
      expect(new Set(offer.cards).size).toBe(2);
    }
  });

  it('tire surtout des Outils Communs', () => {
    const luck = createRng(2);
    let common = 0;
    let total = 0;
    for (let i = 0; i < 400; i++) {
      const id = rollOffer(luck, all, []).tools[0];
      total++;
      if (TOOLS.find((t) => t.id === id)?.rarity === 'common') common++;
    }
    expect(common / total).toBeGreaterThan(0.6);
    expect(common / total).toBeLessThan(0.8);
  });

  it('ouvre entre deux mois à partir du palier 2 seulement', () => {
    const run = toShop();
    expect(run.phase).toBe('shop');
    expect(run.seance).toBe(1);
    leaveShop(run);
    expect(run.phase).toBe('intro');

    const p1 = createRun(1, 3);
    startSeance(p1);
    while (p1.phase === 'trading') {
      const deal = beginTrade(p1);
      finishTrade(p1, deal, readingFor(deal.lead));
    }
    if (p1.phase === 'cashout') cashOut(p1);
    nextSeance(p1);
    expect(p1.phase).toBe('intro');
  });

  it('paie avec le capital, revend à moitié prix et garde 100 $ au moins', () => {
    const run = toShop();
    const id = run.shop?.offer.tools[0];
    if (!id) throw new Error('offre vide');
    const before = run.capital;
    const price = TOOLS.find((t) => t.id === id)?.price ?? 0;
    buyTool(run, id);
    expect(run.capital).toBeCloseTo(before - price, 6);
    expect(run.tools).toContain(id);
    expect(run.shop?.offer.tools).not.toContain(id);
    sellTool(run, id);
    expect(run.capital).toBeCloseTo(before - price / 2, 6);

    run.capital = 150;
    const next = run.shop?.offer.tools[0];
    if (next) expect(canBuyTool(run, next)).toBe(false);
  });

  it('limite à 5 Outils et 2 Cartes', () => {
    const run = toShop();
    run.capital = 10_000;
    run.tools = ['stop-loss', 'trend', 'range', 'loupe', 'interest'];
    run.shop = { offer: { tools: ['contrarian'], cards: ['leverage', 'insurance'] }, rerolls: 0 };
    expect(canBuyTool(run, 'contrarian')).toBe(false);
    run.hand = ['tickets'];
    buyCard(run, 'leverage');
    expect(() => buyCard(run, 'insurance')).toThrow();
    expect(run.hand).toHaveLength(SHOP.maxCards);
  });

  it('fait monter le prix des relances', () => {
    const run = toShop();
    run.capital = 1000;
    expect(rerollCost(run)).toBe(20);
    reroll(run);
    expect(run.capital).toBe(980);
    expect(rerollCost(run)).toBe(30);
  });

  it('ne change pas le marché quand on achète', () => {
    const a = toShop(21);
    const b = toShop(21);
    a.capital = b.capital = 5000;
    const id = a.shop?.offer.tools[0];
    if (id) buyTool(a, id);
    leaveShop(a);
    leaveShop(b);
    startSeance(a);
    startSeance(b);
    expect(beginTrade(a).lead.candles).toEqual(beginTrade(b).lead.candles);
  });
});

describe('Cartes et Outils en jeu', () => {
  function trading(tools: RunState['tools'] = [], hand: RunState['hand'] = [], seed = 5, tier = 4): RunState {
    const run = createRun(tier, seed, all);
    run.tools = tools;
    run.hand = hand;
    startSeance(run);
    return run;
  }

  it('joue chaque Carte une fois, avant le choix', () => {
    const run = trading([], ['tickets', 'overtime']);
    const deal = beginTrade(run);
    playCard(run, deal, 'tickets');
    expect(run.tickets).toBe(2);
    expect(canPlayCard(run, deal, 'tickets')).toBe(false);
    playCard(run, deal, 'overtime');
    expect(run.tradesLeft).toBe(11);
    expect(run.hand).toEqual([]);
  });

  it("donne la suite avec le Rapport d'analyste", () => {
    const run = trading([], ['analyst']);
    const deal = beginTrade(run);
    playCard(run, deal, 'analyst');
    expect(deal.hints.analyst).toBe(deal.lead.reverses ? 'reverse' : 'continue');
  });

  it('montre la 1re bougie avec le Terminal pro', () => {
    const run = trading(['terminal']);
    const deal = beginTrade(run);
    const peek = deal.hints.peek;
    const out = finishTrade(run, deal, 'long');
    expect(out.trade.candles[0]).toEqual(peek);
  });

  it('dit toujours vrai avec le Détecteur, et la Loupe montre la bougie du signe', () => {
    const run = trading(['detector', 'loupe'], [], 9, 3);
    let seen = 0;
    for (let i = 0; i < 400 && run.phase !== 'lost' && run.phase !== 'won'; i++) {
      if (run.phase === 'cashout') cashOut(run);
      if (run.phase === 'seanceWon') { nextSeance(run); leaveShop(run); }
      if (run.phase === 'intro') startSeance(run);
      if (run.phase !== 'trading') break;
      const deal = beginTrade(run);
      if (deal.lead.sign) expect(deal.hints.flash).toBe(deal.lead.signIndex);
      if (deal.hints.verdict) {
        seen++;
        expect(deal.hints.verdict).toBe(deal.lead.fake ? 'douteux' : 'fiable');
      }
      finishTrade(run, deal, readingFor(deal.lead));
    }
    expect(seen).toBeGreaterThan(0);
  });

  it('annule la news avec le Démenti', () => {
    for (let seed = 1; seed < 400; seed++) {
      const run = trading([], ['denial'], seed, 4);
      const deal = beginTrade(run);
      if (!deal.plan.news) continue;
      playCard(run, deal, 'denial');
      const out = finishTrade(run, deal, 'long');
      expect(out.denied).toBe(true);
      expect(out.trade.news).toBeNull();
      expect(out.trade.candles).toEqual(deal.plan.base);
      return;
    }
    throw new Error('aucune news trouvée');
  });

  it('additionne les bonus des Outils dans les bons cas', () => {
    const run = trading(['trend', 'range', 'contrarian']);
    const lead = beginTrade(run).lead;
    const bonus = toolBonus(run, lead, readingFor(lead));
    if (lead.regime === 'range') expect(bonus).toBe(0.5);
    else if (!lead.sign) expect(bonus).toBe(0.3);
    else expect(bonus).toBe(lead.reverses ? 0.6 : 0);
  });

  it('verse les intérêts et le Ticket d\'or', () => {
    const run = createRun(2, 7, all);
    run.tools = ['interest', 'golden-ticket'];
    startSeance(run);
    expect(run.capital).toBeCloseTo(1020, 6);
    expect(run.seanceStartCapital).toBeCloseTo(1020, 6);
    while (run.phase === 'trading') {
      const deal = beginTrade(run);
      finishTrade(run, deal, readingFor(deal.lead));
    }
    const left = run.tradesLeft;
    cashOut(run);
    expect(run.tickets).toBe(left + 1);
  });
});
