// Un test par Outil (GDD 6) et un test par synergie chiffrée.
import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config.ts';
import { cardContext } from '../src/engine/cards.ts';
import { riskUnit } from '../src/engine/forecast.ts';
import { classifySetup, computeMulti, type MultiInput } from '../src/engine/scoring.ts';
import { allowedDurations, currentCosts, minDuration, openPosition, previewPosition, sizeOrder, upcomingNews, type RunState } from '../src/engine/run.ts';
import type { Candle, CardId, ToolId } from '../src/engine/types.ts';
import { candle } from './helpers.ts';
import { flatHistory, order, scriptedRun, startedRun, steadyFuture } from './runHelpers.ts';

function multi(tools: ToolId[], cards: CardId[], overrides: Partial<MultiInput> = {}): number {
  return computeMulti({
    setup: classifySetup(cards),
    direction: 'long',
    tools,
    trendSlope: 0,
    duration: 3,
    twoPercentOk: false,
    journalBonus: 0,
    formationBonus: 0,
    ...overrides,
  }).total;
}

/** 3 bougies dont la première descend sous le stop-loss (97,097) sans gap. */
const stopFuture = (): Candle[] => [candle(100, 100.2, 96, 96.5), candle(96.5, 97, 96, 96.6), candle(96.6, 97, 96, 96.8)];

/** Espérance de gain avant frais et spread : chance × gain brut + (1 − chance) × perte brute. */
function grossExpectancy(run: RunState): number {
  const view = previewPosition(run, order());
  const { entryPrice, notional, stopPrice, takePrice } = view.preview;
  const c = view.chance.value;
  return c * notional * (takePrice! / entryPrice - 1) + (1 - c) * notional * (stopPrice! / entryPrice - 1);
}

describe('les 15 Outils', () => {
  it('1. Stop-loss discipliné : perte au stop × 0,25 au lieu de × 0,5, et +1 P', () => {
    const run = scriptedRun(flatHistory(), stopFuture(), ['stopLoss']);
    const primes = run.primes;
    const record = openPosition(run, order());
    expect(record.trade.exitReason).toBe('stopLoss');
    expect(record.score.performance).toBeCloseTo(record.score.result * 0.25, 10);
    expect(record.primesBonus).toBe(1);
    expect(run.primes).toBe(primes + 1);

    const without = openPosition(scriptedRun(flatHistory(), stopFuture()), order());
    expect(without.score.performance).toBeCloseTo(without.score.result * 0.5, 10);
    expect(without.primesBonus).toBe(0);
  });

  it('1. Stop-loss discipliné : une perte sans stop touché garde le facteur 0,5, sans bonus', () => {
    const run = scriptedRun(flatHistory(), steadyFuture(-0.005), ['stopLoss']);
    const record = openPosition(run, order());
    expect(record.trade.exitReason).toBe('time');
    expect(record.score.result).toBeLessThan(0);
    expect(record.score.performance).toBeCloseTo(record.score.result * 0.5, 10);
    expect(record.primesBonus).toBe(0);
  });

  it('2. Take-profit méthodique : take-profit à 2 u, chance de base 33 % et aucun bonus de Multi', () => {
    expect(previewPosition(scriptedRun(flatHistory(), steadyFuture(0.025)), order()).preview.takePrice).toBeCloseTo(100.1 * 1.045, 10);
    const run = scriptedRun(flatHistory(), steadyFuture(0.025), ['takeProfit']);
    const view = previewPosition(run, order());
    expect(view.preview.takePrice).toBeCloseTo(100.1 * 1.06, 10);
    expect(view.chance.base).toBeCloseTo(1 / 3, 12);
    const record = openPosition(run, order());
    expect(record.trade.exitReason).toBe('takeProfit');
    expect(record.multi.total).toBe(1);
  });

  it('3. Courtier low-cost : frais 0,10 % → 0,04 % par côté', () => {
    expect(currentCosts(startedRun()).feePerSide).toBe(0.001);
    expect(currentCosts(startedRun(1, ['lowCostBroker'])).feePerSide).toBe(0.0004);
  });

  it('4. Teneur de marché : spread 0,20 % → 0,08 %', () => {
    expect(currentCosts(startedRun()).spread).toBe(0.002);
    expect(currentCosts(startedRun(1, ['marketMaker'])).spread).toBe(0.0008);
  });

  it('5. Lecteur de chandeliers : +1 Multi par carte Chandelier valide', () => {
    expect(multi(['candleReader'], ['hammer'])).toBe(1.5 + 1);
    expect(multi(['candleReader'], ['hammer', 'bullishEngulfing'])).toBe(2 + 2);
    expect(multi(['candleReader'], ['rsiOversold'])).toBe(1.5);
  });

  it('6. Oscillateur RSI : seuils 35/65', () => {
    const candles = flatHistory();
    expect(cardContext(candles, []).rsiOversold).toBe(30);
    expect(cardContext(candles, ['rsiOscillator']).rsiOversold).toBe(35);
    expect(cardContext(candles, ['rsiOscillator']).rsiOverbought).toBe(65);
  });

  it('7. Calendrier économique : news annoncées 2 bougies à l’avance', () => {
    const news = { headline: 'TEST : résultats', sentiment: 'positive' as const, gap: 0.04 };
    const future: Candle[] = [candle(100, 101, 99, 100), { ...candle(104, 105, 103, 104), news }];
    expect(upcomingNews(scriptedRun(flatHistory(), future))).toEqual([]);
    const announced = upcomingNews(scriptedRun(flatHistory(), future, ['calendar']));
    expect(announced).toEqual([{ inCandles: 2, headline: 'TEST : résultats', sentiment: 'positive' }]);
  });

  it('8. Chartiste : +1,5 Multi par carte Niveau valide', () => {
    expect(multi(['chartist'], ['supportBounce'])).toBe(1.5 + 1.5);
    expect(multi(['chartist'], ['supportBounce', 'bullishBreakout'])).toBe(2 + 3);
  });

  it('9. Effet de levier : taille Agressif ×2 → ×5, les autres tailles inchangées', () => {
    expect(sizeOrder(startedRun(), 'aggressive').leverage).toBe(2);
    const run = startedRun(1, ['leverage']);
    expect(sizeOrder(run, 'aggressive')).toEqual({ stake: 1000, leverage: 5 });
    expect(sizeOrder(run, 'normal').leverage).toBe(2);
    expect(sizeOrder(run, 'prudent').leverage).toBe(1);
  });

  it('10. Vendeur à découvert : +1 Multi sur les shorts uniquement', () => {
    expect(multi(['shortSeller'], [], { direction: 'short' })).toBe(2);
    expect(multi(['shortSeller'], [], { direction: 'long' })).toBe(1);
  });

  it('11. Suiveur de tendance : ×1,5 dans le sens de la pente de MM20', () => {
    expect(multi(['trendFollower'], ['hammer'], { trendSlope: 0.5 })).toBe(1.5 * 1.5);
    expect(multi(['trendFollower'], ['hammer'], { trendSlope: -0.5 })).toBe(1.5);
    expect(multi(['trendFollower'], [], { trendSlope: -0.5, direction: 'short' })).toBe(1.5);
  });

  it('12. Scalpeur : positions d’1 bougie, u × √(1/3) et +1 Multi sur elles', () => {
    expect(allowedDurations(startedRun())).toEqual([3]);
    const run = scriptedRun(flatHistory(), steadyFuture(0.01, 3), ['scalper']);
    expect(allowedDurations(run)).toContain(1);
    expect(minDuration(run)).toBe(1);
    const record = openPosition(run, order({ duration: 1 }));
    expect(record.trade.candles).toHaveLength(1);
    expect(record.trade.order.stopLossPct).toBeCloseTo(0.03 / Math.sqrt(3), 12);
    expect(run.seance!.candlesLeft).toBe(CONFIG.seance.candles - 1);
    expect(record.multi.total).toBe(1 + 1);
  });

  it('13. Règle des 2 % : ×2 si notionnel × distance du stop ≤ 2 % du capital', () => {
    const run = scriptedRun(flatHistory(), steadyFuture(0.01), ['twoPercentRule']);
    expect(previewPosition(run, order({ size: 'prudent' })).twoPercentOk).toBe(true); // 500 × 3 % = 15 $
    expect(previewPosition(run, order({ size: 'prudent' })).multi.total).toBe(2);
    expect(previewPosition(run, order({ size: 'normal' })).twoPercentOk).toBe(false); // 1 000 × 3 % = 30 $
    expect(previewPosition(run, order({ size: 'aggressive' })).twoPercentOk).toBe(false);
  });

  it('14. Carnet de trading : +0,5 Multi par trade gagnant à 2 cartes valides, plafond +4', () => {
    expect(multi(['tradingJournal'], [], { journalBonus: 1.5 })).toBe(2.5);
    expect(multi([], [], { journalBonus: 1.5 })).toBe(1);
    // Trade gagnant avec 2 cartes valides (Cassure haussière + Pic de volume, bougie verte au volume ×3).
    const history = [...flatHistory().slice(0, 39), candle(100, 101.5, 99.9, 101.2, 30000)];
    const run = scriptedRun(history, steadyFuture(0.01, 3, 101.2), ['tradingJournal'], ['bullishBreakout', 'volumeSpike', 'hammer', 'hammer', 'hammer']);
    run.journalBonus = 3.8;
    const record = openPosition(run, order({ cardIndices: [0, 1] }));
    expect(record.setup.validCards).toHaveLength(2);
    expect(record.pnlNet).toBeGreaterThan(0);
    expect(run.journalBonus).toBe(CONFIG.tools.tradingJournal.cap);
  });

  it('15. Analyste quant : ×2 si au moins 2 familles', () => {
    expect(multi(['quantAnalyst'], ['hammer', 'rsiOversold'])).toBe(2.5 * 2);
    expect(multi(['quantAnalyst'], ['hammer', 'bullishEngulfing'])).toBe(2);
  });
});

describe('synergies chiffrées (GDD 6)', () => {
  it('1. Règle des 2 % + taille Prudent : même Performance qu’un trade Normal, pour la moitié du risque', () => {
    const run = scriptedRun(flatHistory(), steadyFuture(0.01), ['twoPercentRule']);
    const prudent = previewPosition(run, order({ size: 'prudent' }));
    const normal = previewPosition(run, order({ size: 'normal' }));
    expect(prudent.riskPct).toBeCloseTo(normal.riskPct / 2, 3);
    expect(prudent.riskPct).toBeLessThan(0.02);
    expect(prudent.gainAtTake * prudent.multi.total).toBeCloseTo(normal.gainAtTake * normal.multi.total, 1);
  });

  it('2. Effet de levier + Stop-loss discipliné : un stop à ×5 coûte environ 15 % du capital, pénalité divisée par 2', () => {
    const run = scriptedRun(flatHistory(), stopFuture(), ['leverage', 'stopLoss']);
    const view = previewPosition(run, order({ size: 'aggressive' }));
    expect(view.preview.notional).toBe(5000);
    expect(view.riskPct).toBeGreaterThan(0.15);
    expect(view.riskPct).toBeLessThan(0.17);
    const record = openPosition(run, order({ size: 'aggressive' }));
    expect(record.trade.exitReason).toBe('stopLoss');
    expect(record.score.performance).toBeCloseTo(record.score.result * 0.25, 10);
  });

  it('3. Take-profit méthodique + bonnes cartes : espérance avant frais = (1 + ratio) × avantage × u × N', () => {
    const plain = scriptedRun(flatHistory(), steadyFuture(0.01));
    const tool = scriptedRun(flatHistory(), steadyFuture(0.01), ['takeProfit']);
    plain.seance!.analystBoost = true; // avantage de 10 points de chance
    tool.seance!.analystBoost = true;
    expect(grossExpectancy(plain)).toBeCloseTo((1 + 1.5) * 0.1 * 0.03 * 1000, 8);
    expect(grossExpectancy(tool)).toBeCloseTo((1 + 2) * 0.1 * 0.03 * 1000, 8);
    expect(grossExpectancy(tool) / grossExpectancy(plain)).toBeCloseTo(1.2, 8);
  });

  it('4. Scalpeur + Courtier + Teneur : u ≈ 1,7 % sur NXC, coût aller-retour 0,40 % → 0,16 %', () => {
    expect(riskUnit(0.015, 1)).toBeCloseTo(0.0173, 4);
    const roundTrip = (tools: ToolId[]) => {
      const c = currentCosts(startedRun(1, tools));
      return c.spread + 2 * c.feePerSide;
    };
    expect(roundTrip(['scalper'])).toBeCloseTo(0.004, 12);
    expect(roundTrip(['scalper', 'lowCostBroker', 'marketMaker'])).toBeCloseTo(0.0016, 12);
  });

  it('5. Chartiste + Lecteur de chandeliers + Analyste quant : ×10', () => {
    expect(multi(['chartist', 'candleReader', 'quantAnalyst'], ['supportBounce', 'hammer'])).toBe(10);
  });

  it('6. Vendeur à découvert + Suiveur de tendance : short isolé en baisse ×3,75', () => {
    expect(multi(['shortSeller', 'trendFollower'], ['rsiOverbought'], { direction: 'short', trendSlope: -1 })).toBe(3.75);
  });
});
