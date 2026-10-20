import { describe, expect, it } from 'vitest';
import { createRng, deriveSeed, gaussian, nextFloat, nextInt, shuffle, weightedPick } from '../src/engine/rng.ts';

describe('rng', () => {
  it('la même graine donne la même suite', () => {
    const a = createRng(42);
    const b = createRng(42);
    for (let i = 0; i < 100; i++) expect(nextFloat(a)).toBe(nextFloat(b));
  });

  it('des graines différentes donnent des suites différentes', () => {
    expect(nextFloat(createRng(1))).not.toBe(nextFloat(createRng(2)));
  });

  it('reste dans [0, 1) et les entiers dans [0, n)', () => {
    const rng = createRng(7);
    for (let i = 0; i < 10000; i++) {
      const x = nextFloat(rng);
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
      const k = nextInt(rng, 5);
      expect(k).toBeGreaterThanOrEqual(0);
      expect(k).toBeLessThan(5);
    }
  });

  it('la loi normale a une moyenne proche de 0 et un écart-type proche de 1', () => {
    const rng = createRng(123);
    const n = 50000;
    let sum = 0;
    let sumSq = 0;
    for (let i = 0; i < n; i++) {
      const z = gaussian(rng);
      sum += z;
      sumSq += z * z;
    }
    const mean = sum / n;
    const sd = Math.sqrt(sumSq / n - mean * mean);
    expect(Math.abs(mean)).toBeLessThan(0.02);
    expect(Math.abs(sd - 1)).toBeLessThan(0.02);
  });

  it('le tirage pondéré respecte les poids', () => {
    const rng = createRng(9);
    const counts = { a: 0, b: 0 };
    for (let i = 0; i < 20000; i++) counts[weightedPick(rng, [['a', 0.7], ['b', 0.3]] as const)]++;
    expect(counts.a / 20000).toBeCloseTo(0.7, 1);
  });

  it('le mélange garde les mêmes éléments', () => {
    const items = [1, 2, 3, 4, 5, 6];
    shuffle(createRng(3), items);
    expect([...items].sort()).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('les graines dérivées sont stables et distinctes', () => {
    expect(deriveSeed(10, 'market', 1)).toBe(deriveSeed(10, 'market', 1));
    expect(deriveSeed(10, 'market', 1)).not.toBe(deriveSeed(10, 'market', 2));
  });
});
