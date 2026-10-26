import { describe, expect, it } from 'vitest';
import { GLOSSARY } from '../src/data/glossary.ts';
import { MAX_TIER, createProgress, markSeen, recordWin } from '../src/engine/progress.ts';

describe('progression', () => {
  it('débloque le palier suivant et garde le record', () => {
    const p = createProgress();
    expect(p.unlocked).toBe(1);
    expect(recordWin(p, 1, 1400)).toBe(true);
    expect(p.unlocked).toBe(2);
    expect(recordWin(p, 1, 1200)).toBe(false);
    expect(p.records[1]).toBe(1400);
    recordWin(p, MAX_TIER, 2000);
    expect(p.unlocked).toBe(MAX_TIER);
  });

  it('ne montre la bulle d\'un terme qu\'une fois', () => {
    const p = createProgress();
    expect(markSeen(p, 'long')).toBe(true);
    expect(markSeen(p, 'long')).toBe(false);
  });

  it('a des termes de glossaire uniques', () => {
    const ids = GLOSSARY.map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const g of GLOSSARY) expect(g.definition.length).toBeGreaterThan(10);
  });
});
