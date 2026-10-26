import { describe, expect, it } from 'vitest';
import { explain } from '../src/engine/explain.ts';
import { createMarket, nextLead, readingFor } from '../src/engine/market.ts';
import { RULES } from '../src/engine/rules.ts';
import type { Level } from '../src/engine/tiers.ts';

const level: Level = { reversal: 0.3, clarity: 1, fake: 0.2, news: 0, sigma: 0.002, drift: RULES.drift, regimes: ['up', 'down', 'range'] };

describe('explication après le trade', () => {
  it('donne la bonne lecture quand le joueur se trompe', () => {
    const lead = nextLead(createMarket(1), level);
    const good = readingFor(lead);
    const bad = good === 'long' ? 'short' : 'long';
    expect(explain(lead, null, good, true, level)).not.toContain('bonne lecture');
    expect(explain(lead, null, bad, false, level)).toContain(`**${good.toUpperCase()}**`);
  });

  it('signale une news comme imprévisible', () => {
    const lead = nextLead(createMarket(2), level);
    const text = explain(lead, { at: 1, dir: 1, title: 'Titre' }, 'long', false, level);
    expect(text).toContain('News surprise');
    expect(text).toContain('Titre');
  });
});
