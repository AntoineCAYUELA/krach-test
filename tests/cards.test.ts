import { describe, expect, it } from 'vitest';
import { CARDS, cardContext, checkCard, startingDeck } from '../src/engine/cards.ts';
import type { Candle, CardId, Direction, ToolId } from '../src/engine/types.ts';
import { candle, fromCloses } from './helpers.ts';

const flat = (n = 39) => Array<number>(n).fill(100);
const declining = (n = 39) => Array.from({ length: n }, (_, i) => 110 - (15 * i) / (n - 1));
const rising = (n = 39) => Array.from({ length: n }, (_, i) => 90 + (15 * i) / (n - 1));

/** Historique de 39 bougies + une dernière bougie choisie. */
function withLast(closes: number[], last: Candle): Candle[] {
  return [...fromCloses(closes), last];
}

function check(id: CardId, direction: Direction, candles: Candle[], tools: ToolId[] = []) {
  return checkCard(id, direction, cardContext(candles, tools));
}

describe('deck de départ (GDD 2.6)', () => {
  it('contient 20 cartes avec les bons exemplaires', () => {
    const deck = startingDeck();
    expect(deck).toHaveLength(20);
    for (const id of Object.keys(CARDS) as CardId[]) {
      expect(deck.filter((c) => c === id)).toHaveLength(CARDS[id].startingCount);
    }
  });
});

describe('conditions des cartes Signal (GDD 2.6)', () => {
  it('Marteau', () => {
    const hammer = candle(95, 95.25, 94.5, 95.2);
    expect(check('hammer', 'long', withLast(declining(), hammer)).valid).toBe(true);
    // Même bougie après une hausse : Close > MM20, pas de baisse préalable.
    expect(check('hammer', 'long', withLast(rising(), candle(105, 105.25, 104.5, 105.2))).valid).toBe(false);
    // Mèche basse trop courte.
    expect(check('hammer', 'long', withLast(declining(), candle(95, 95.25, 94.95, 95.2))).valid).toBe(false);
    expect(check('hammer', 'short', withLast(declining(), hammer)).valid).toBe(false);
  });

  it('Étoile filante', () => {
    const star = candle(105, 105.6, 104.85, 104.9);
    expect(check('shootingStar', 'short', withLast(rising(), star)).valid).toBe(true);
    expect(check('shootingStar', 'short', withLast(declining(), candle(95, 95.6, 94.85, 94.9))).valid).toBe(false);
  });

  it('Avalement haussier et baissier', () => {
    const base = fromCloses(flat(38));
    const bull = [...base, candle(101, 101.1, 99.9, 100), candle(99.9, 101.3, 99.8, 101.2)];
    expect(check('bullishEngulfing', 'long', bull).valid).toBe(true);
    const weak = [...base, candle(101, 101.1, 99.9, 100), candle(100.1, 100.6, 100, 100.5)];
    expect(check('bullishEngulfing', 'long', weak).valid).toBe(false);
    const bear = [...base, candle(100, 101.1, 99.9, 101), candle(101.1, 101.2, 99.7, 99.8)];
    expect(check('bearishEngulfing', 'short', bear).valid).toBe(true);
    expect(check('bearishEngulfing', 'short', bull).valid).toBe(false);
  });

  it('RSI survendu et suracheté, seuils de l’Oscillateur RSI', () => {
    const down = fromCloses(declining(40));
    const up = fromCloses(rising(40));
    expect(check('rsiOversold', 'long', down).valid).toBe(true);
    expect(check('rsiOversold', 'long', up).valid).toBe(false);
    expect(check('rsiOverbought', 'short', up).valid).toBe(true);
    expect(check('rsiOverbought', 'short', down).valid).toBe(false);

    // RSI ≈ 33,6 (5 hausses de 1 pour 9 baisses de 1,1) : invalide avec 30, valide avec l'Oscillateur (35).
    const closes: number[] = [100];
    for (let i = 1; i < 40; i++) closes.push((closes[i - 1] as number) + (i % 3 === 0 ? 1 : -1.1));
    const mixed = fromCloses(closes);
    const rsi = cardContext(mixed, []).snap.rsi ?? 0;
    expect(rsi).toBeGreaterThan(30);
    expect(rsi).toBeLessThan(35);
    expect(check('rsiOversold', 'long', mixed).valid).toBe(false);
    expect(check('rsiOversold', 'long', mixed, ['rsiOscillator']).valid).toBe(true);
  });

  it('Golden cross et Death cross', () => {
    const golden = fromCloses([...flat(34), 98, 98, 98, 101, 103, 105]);
    expect(check('goldenCross', 'long', golden).valid).toBe(true);
    expect(check('goldenCross', 'long', fromCloses(rising(40))).valid).toBe(false); // pas de croisement récent
    const death = fromCloses([...flat(34), 102, 102, 102, 99, 97, 95]);
    expect(check('deathCross', 'short', death).valid).toBe(true);
    expect(check('deathCross', 'short', golden).valid).toBe(false);
  });

  it('Rebond sur support et Rejet de résistance', () => {
    const bounce = withLast(flat(), candle(100, 100.1, 99.5, 100));
    expect(check('supportBounce', 'long', bounce).valid).toBe(true); // Low 99,5 ≤ 99,8 × 1,01
    expect(check('supportBounce', 'long', withLast(flat(), candle(100, 101.5, 99.6, 99.7))).valid).toBe(false); // Close sous le support
    const history = fromCloses(flat());
    (history[30] as Candle).h = 103;
    const rejection = [...history, candle(101.5, 102.5, 101.2, 101.8)];
    expect(check('resistanceRejection', 'short', rejection).valid).toBe(true);
    expect(check('resistanceRejection', 'short', [...history, candle(100, 100.2, 99.9, 100)]).valid).toBe(false);
  });

  it('Cassures haussière et baissière', () => {
    expect(check('bullishBreakout', 'long', withLast(flat(), candle(100, 101.2, 99.9, 101))).valid).toBe(true);
    expect(check('bullishBreakout', 'long', withLast(flat(), candle(100, 100.1, 99.9, 100))).valid).toBe(false);
    expect(check('bearishBreakout', 'short', withLast(flat(), candle(100, 100.1, 98.8, 99))).valid).toBe(true);
    expect(check('bearishBreakout', 'short', withLast(flat(), candle(100, 100.1, 99.9, 100))).valid).toBe(false);
  });

  it('Pic de volume : direction donnée par la couleur de la bougie', () => {
    const green = withLast(flat(), candle(100, 101, 99.9, 100.8, 25000));
    expect(check('volumeSpike', 'long', green).valid).toBe(true);
    expect(check('volumeSpike', 'short', green).valid).toBe(false);
    expect(check('volumeSpike', 'long', withLast(flat(), candle(100, 101, 99.9, 100.8, 15000))).valid).toBe(false);
  });

  it('Volume confirmant : direction donnée par les 3 dernières bougies', () => {
    const history = fromCloses([...flat(37), 100.5, 101, 101.5]);
    for (const c of history.slice(-3)) c.v = 14000;
    expect(check('volumeConfirmation', 'long', history).valid).toBe(true);
    expect(check('volumeConfirmation', 'short', history).valid).toBe(false);
    const quiet = fromCloses([...flat(37), 100.5, 101, 101.5]);
    expect(check('volumeConfirmation', 'long', quiet).valid).toBe(false);
  });

  it('chaque refus a une raison lisible', () => {
    const candles = withLast(flat(), candle(100, 100.1, 99.9, 100));
    for (const id of Object.keys(CARDS) as CardId[]) {
      for (const direction of ['long', 'short'] as const) {
        expect(check(id, direction, candles).reason.length).toBeGreaterThan(5);
      }
    }
  });
});
