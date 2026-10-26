import { describe, expect, it } from 'vitest';
import { bonusTradeCost, isBigTrade, multiplier, settle } from '../src/engine/rules.ts';

describe('règles du trade', () => {
  it('reproduit l\'exemple du GDD : 1000 $, 250 → 253,5, série de 2 = +28 $', () => {
    const s = settle(1000, 'long', 250, 253.5, 2);
    expect(s.raw).toBeCloseTo(14, 6);
    expect(s.multi).toBe(2);
    expect(s.gain).toBeCloseTo(28, 6);
    expect(s.nextStreak).toBe(3);
  });

  it('un short gagne quand le prix baisse', () => {
    const s = settle(1000, 'short', 250, 246.5, 0);
    expect(s.gain).toBeCloseTo(14, 6);
    expect(s.nextStreak).toBe(1);
  });

  it('une perte compte telle quelle et remet la série à 0', () => {
    const s = settle(1000, 'long', 250, 246.5, 4);
    expect(s.multi).toBe(1);
    expect(s.gain).toBeCloseTo(-14, 6);
    expect(s.nextStreak).toBe(0);
  });

  it('plafonne le multi à ×3', () => {
    expect([0, 1, 2, 3, 4, 10].map(multiplier)).toEqual([1, 1.5, 2, 2.5, 3, 3]);
  });

  it('fait monter le prix des trades bonus : 1, 2, 3 tickets', () => {
    expect([0, 1, 2].map(bonusTradeCost)).toEqual([1, 2, 3]);
  });

  it('repère les gros trades', () => {
    expect(isBigTrade(1000, 2, 500)).toBe(true); // série à ×2
    expect(isBigTrade(1000, 0, 30)).toBe(true); // 15 $ attendus pour 30 $ manquants
    expect(isBigTrade(1000, 0, 100)).toBe(false);
    expect(isBigTrade(1000, 1, 0)).toBe(false); // loyer déjà payé
  });
});
