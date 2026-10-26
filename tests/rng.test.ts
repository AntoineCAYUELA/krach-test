import { describe, expect, it } from 'vitest';
import { createRng, nextFloat, nextInt } from '../src/engine/rng.ts';

describe('générateur aléatoire', () => {
  it('donne la même suite pour la même graine', () => {
    const a = createRng(42);
    const b = createRng(42);
    const sa = Array.from({ length: 20 }, () => nextFloat(a));
    const sb = Array.from({ length: 20 }, () => nextFloat(b));
    expect(sa).toEqual(sb);
    expect(new Set(sa).size).toBe(20);
  });

  it('reste dans les bornes', () => {
    const r = createRng(7);
    for (let i = 0; i < 1000; i++) {
      const f = nextFloat(r);
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(1);
      const n = nextInt(r, 3);
      expect([0, 1, 2]).toContain(n);
    }
  });
});
