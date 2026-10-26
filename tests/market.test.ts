import { describe, expect, it } from 'vitest';
import { createMarket, nextLead, outcomeFor, readingFor, tradeCandles } from '../src/engine/market.ts';
import { RULES } from '../src/engine/rules.ts';
import { getTier, levelFor, type Level } from '../src/engine/tiers.ts';

const clean: Level = { reversal: 0.3, clarity: 1, fake: 0, news: 0, sigma: 0.002, drift: RULES.drift, regimes: ['up', 'down', 'range'] };

describe('marché', () => {
  it('montre 12 bougies avant chaque trade et 5 pendant', () => {
    const m = createMarket(1);
    const lead = nextLead(m, clean);
    expect(lead.candles).toHaveLength(RULES.leadCandles);
    const t = tradeCandles(m, clean, lead);
    expect(t.candles).toHaveLength(RULES.tradeCandles);
    expect(m.price).toBe(t.candles[t.candles.length - 1]?.c);
  });

  it('sans faux signe ni news, la bonne lecture gagne toujours', () => {
    const m = createMarket(3);
    for (let i = 0; i < 300; i++) {
      const lead = nextLead(m, clean);
      const entry = m.price;
      tradeCandles(m, clean, lead);
      const dir = readingFor(lead) === 'long' ? 1 : -1;
      expect(dir).toBe(outcomeFor(lead));
      expect((m.price - entry) * dir).toBeGreaterThan(0);
    }
  });

  it('un retournement est toujours annoncé par un signe', () => {
    const m = createMarket(5);
    const level = levelFor(getTier(4), 9, RULES.drift);
    for (let i = 0; i < 300; i++) {
      const lead = nextLead(m, level);
      if (lead.reverses) expect(lead.sign).toBe(true);
      if (lead.sign) expect(lead.signIndex).toBe(m.history.length - 1);
      tradeCandles(m, level, lead);
    }
  });

  it('une news part contre le mouvement attendu', () => {
    const m = createMarket(9);
    const level: Level = { ...clean, news: 1 };
    for (let i = 0; i < 50; i++) {
      const lead = nextLead(m, level);
      const t = tradeCandles(m, level, lead);
      expect(t.news?.dir).toBe(-outcomeFor(lead));
    }
  });
});
