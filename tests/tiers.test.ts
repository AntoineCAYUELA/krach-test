import { describe, expect, it } from 'vitest';
import { RULES } from '../src/engine/rules.ts';
import { TIERS, fakeShare, getTier, levelFor } from '../src/engine/tiers.ts';

describe('paliers', () => {
  it('reprend les quotas du GDD', () => {
    expect(TIERS.map((t) => t.quotas)).toEqual([
      [105, 130, 165],
      [165, 180, 205, 230, 255, 285],
      [150, 160, 175, 185, 200, 220, 235, 255, 275, 295],
      [100, 110, 115, 125, 135, 145, 160, 170, 185, 200],
      [195, 215, 245, 270, 305, 340],
    ]);
  });

  it('ajoute une mécanique par palier', () => {
    expect(levelFor(getTier(1), 0, RULES.drift).regimes).not.toContain('range');
    expect(levelFor(getTier(2), 0, RULES.drift).regimes).toContain('range');
    expect(fakeShare(levelFor(getTier(2), 5, RULES.drift))).toBe(0);
    expect(fakeShare(levelFor(getTier(3), 9, RULES.drift))).toBeGreaterThan(0);
    expect(levelFor(getTier(3), 9, RULES.drift).news).toBe(0);
    expect(levelFor(getTier(4), 0, RULES.drift).news).toBeGreaterThan(0);
    const crypto = levelFor(getTier(5), 0, RULES.drift);
    expect(crypto.drift).toBe(RULES.drift * 2);
    expect(getTier(5).ticker).toBe('KRYP');
  });

  it('va de la 1re à la dernière séance', () => {
    const t = getTier(1);
    expect(levelFor(t, 0, RULES.drift).reversal).toBe(0);
    expect(levelFor(t, 2, RULES.drift).reversal).toBeCloseTo(0.3, 10);
  });

  it('refuse un palier inconnu', () => {
    expect(() => getTier(6)).toThrow();
  });
});
