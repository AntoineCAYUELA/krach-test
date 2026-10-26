import { describe, expect, it } from 'vitest';
import { NO_MODIFIERS, bonusTradeCost, isBigTrade, multiplier, settle } from '../src/engine/rules.ts';

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

  it('plafonne le multi à ×3, ou ×4 avec le Carnet de bord', () => {
    expect([0, 1, 2, 3, 4, 10].map((s) => multiplier(s))).toEqual([1, 1.5, 2, 2.5, 3, 3]);
    expect(multiplier(10, 4)).toBe(4);
  });

  it('fait monter le prix des trades bonus : 1, 2, 3 tickets', () => {
    expect([0, 1, 2].map(bonusTradeCost)).toEqual([1, 2, 3]);
  });

  it('repère les gros trades', () => {
    expect(isBigTrade(1000, 2, 500)).toBe(true); // série à ×2
    expect(isBigTrade(1000, 0, 30)).toBe(true); // 15 $ attendus pour 30 $ manquants
    expect(isBigTrade(1000, 0, 100)).toBe(false);
    expect(isBigTrade(1000, 1, 0)).toBe(false); // loyer déjà payé
    expect(isBigTrade(1000, 0, 500, 2)).toBe(true); // Doubler la mise
  });
});

describe('Outils et Cartes au règlement', () => {
  const mods = { ...NO_MODIFIERS };

  it('applique levier, bonus des Outils puis multi sur un gain', () => {
    // 14 $ brut × levier 2 = 28 $ ; +80 % d'Outils = 50,4 $ ; série 2 (×2) = 100,8 $
    const s = settle(1000, 'long', 250, 253.5, 2, { ...mods, lever: 2, bonus: 0.8 });
    expect(s.raw).toBeCloseTo(28, 6);
    expect(s.gain).toBeCloseTo(100.8, 6);
  });

  it('plafonne une perte avec le Stop-loss, levier compris (−1,2 %)', () => {
    const s = settle(1000, 'long', 250, 240, 3, { ...mods, lever: 2, stopLoss: true });
    expect(s.raw).toBeCloseTo(-80, 6);
    expect(s.gain).toBeCloseTo(-12, 6);
    expect(s.capped).toBe(true);
    expect(s.nextStreak).toBe(0);
  });

  it('laisse une petite perte telle quelle avec le Stop-loss', () => {
    const s = settle(1000, 'long', 250, 249, 0, { ...mods, stopLoss: true });
    expect(s.gain).toBeCloseTo(-4, 6);
    expect(s.capped).toBe(false);
  });

  it('annule une perte assurée et garde la série', () => {
    const s = settle(1000, 'short', 250, 255, 3, { ...mods, insured: true });
    expect(s.gain).toBe(0);
    expect(s.nextStreak).toBe(3);
  });

  it('divise la série par 2 avec le Sang-froid', () => {
    expect(settle(1000, 'long', 250, 249, 5, { ...mods, halfStreak: true }).nextStreak).toBe(2);
  });

  it('ne met jamais de bonus ni de multi sur une perte', () => {
    const s = settle(1000, 'long', 250, 249, 4, { ...mods, bonus: 0.8 });
    expect(s.gain).toBeCloseTo(-4, 6);
    expect(s.bonus).toBe(0);
  });
});
