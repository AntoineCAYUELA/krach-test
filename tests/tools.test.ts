// Un test par Outil (GDD 6) et un test par synergie chiffrée.
import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config.ts';
import { cardContext } from '../src/engine/cards.ts';
import { classifySetup, computeMulti, type MultiInput } from '../src/engine/scoring.ts';
import { allowedDurations, allowedLeverages, currentCosts, minDuration, openPosition, previewPosition, upcomingNews } from '../src/engine/run.ts';
import { previewTrade } from '../src/engine/trade.ts';
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
    exitByToolTakeProfit: false,
    twoPercentOk: false,
    journalBonus: 0,
    formationBonus: 0,
    ...overrides,
  }).total;
}

describe('les 15 Outils', () => {
  it('1. Stop-loss discipliné : stop automatique à −5 %, +1 P quand il se déclenche', () => {
    const future: Candle[] = [candle(100, 100.2, 94, 94.5), candle(94.5, 95, 94, 94.6), candle(94.6, 95, 94, 94.8)];
    const run = scriptedRun(flatHistory(), future, ['stopLoss']);
    const primes = run.primes;
    const record = openPosition(run, order());
    expect(record.trade.stopPrice).toBeCloseTo(100.1 * 0.95, 10);
    expect(record.trade.exitReason).toBe('stopLoss');
    expect(record.primesBonus).toBe(1);
    expect(run.primes).toBe(primes + 1);
  });

  it('1. Stop-loss discipliné : un stop joueur plus proche est prioritaire, sans bonus', () => {
    const future: Candle[] = [candle(100, 100.2, 97, 97.5), ...steadyFuture(0, 2, 97.5)];
    const run = scriptedRun(flatHistory(), future, ['stopLoss']);
    const record = openPosition(run, order({ stopLossPct: 0.02 }));
    expect(record.trade.stopPrice).toBeCloseTo(100.1 * 0.98, 10);
    expect(record.trade.exitReason).toBe('stopLoss');
    expect(record.primesBonus).toBe(0);
  });

  it('2. Take-profit méthodique : take-profit à +4 % et +1 Multi quand il se déclenche', () => {
    const run = scriptedRun(flatHistory(), steadyFuture(0.02), ['takeProfit']);
    const record = openPosition(run, order());
    expect(record.trade.takePrice).toBeCloseTo(100.1 * 1.04, 10);
    expect(record.trade.exitReason).toBe('takeProfit');
    expect(record.multi.total).toBe(1 + 1);
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

  it('9. Effet de levier : levier maximal ×2 → ×5', () => {
    expect(Math.max(...allowedLeverages(startedRun()))).toBe(2);
    expect(Math.max(...allowedLeverages(startedRun(1, ['leverage'])))).toBe(5);
    expect(previewPosition(startedRun(), order({ leverage: 5 })).error).toBe('Levier non autorisé');
    expect(previewPosition(startedRun(1, ['leverage']), order({ leverage: 5 })).error).toBeNull();
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

  it('12. Scalpeur : positions d’1 bougie et +1 Multi sur elles', () => {
    expect(allowedDurations(startedRun())).toEqual([3]);
    const run = scriptedRun(flatHistory(), steadyFuture(0.01, 3), ['scalper']);
    expect(allowedDurations(run)).toContain(1);
    expect(minDuration(run)).toBe(1);
    const record = openPosition(run, order({ duration: 1 }));
    expect(record.trade.candles).toHaveLength(1);
    expect(run.seance!.candlesLeft).toBe(CONFIG.seance.candles - 1);
    expect(record.multi.total).toBe(1 + 1);
  });

  it('13. Règle des 2 % : ×2 si notionnel × distance du stop ≤ 2 % du capital', () => {
    const run = startedRun(1, ['twoPercentRule']);
    expect(previewPosition(run, order({ stake: 400, stopLossPct: 0.05 })).twoPercentOk).toBe(true);
    expect(previewPosition(run, order({ stake: 400, stopLossPct: 0.05 })).multi.total).toBe(2);
    expect(previewPosition(run, order({ stake: 401, stopLossPct: 0.05 })).twoPercentOk).toBe(false);
    expect(previewPosition(run, order({ stake: 100, stopLossPct: null })).twoPercentOk).toBe(false);
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
  it('1. Stop-loss discipliné + Règle des 2 % : notionnel ≤ 400 $ pour 1 000 $ de capital', () => {
    const run = startedRun(1, ['stopLoss', 'twoPercentRule']);
    expect(previewPosition(run, order({ stake: 200, leverage: 2 })).twoPercentOk).toBe(true);
    expect(previewPosition(run, order({ stake: 250, leverage: 2 })).twoPercentOk).toBe(false);
  });

  it('2. Effet de levier + Stop-loss discipliné : perte ≈ 25 % de la mise au lieu de 100 %', () => {
    const costs = { spread: 0.002, feePerSide: 0.001 };
    const withStop = previewTrade(100, { direction: 'long', stake: 200, leverage: 5, stopLossPct: 0.05, takeProfitPct: null, duration: 3 }, costs);
    expect(withStop.lossAtStop! / 200).toBeGreaterThan(-0.27);
    expect(withStop.lossAtStop! / 200).toBeLessThan(-0.25);
    const noStop = previewTrade(100, { direction: 'long', stake: 200, leverage: 5, stopLossPct: null, takeProfitPct: null, duration: 3 }, costs);
    expect(noStop.liquidationPrice / noStop.entryPrice).toBeCloseTo(0.84, 10);
  });

  it('3. Scalpeur + Courtier + Teneur : coût aller-retour 0,40 % → 0,16 %', () => {
    const roundTrip = (tools: ToolId[]) => {
      const c = currentCosts(startedRun(1, tools));
      return c.spread + 2 * c.feePerSide;
    };
    expect(roundTrip(['scalper'])).toBeCloseTo(0.004, 12);
    expect(roundTrip(['scalper', 'lowCostBroker', 'marketMaker'])).toBeCloseTo(0.0016, 12);
  });

  it('4. Chartiste + Lecteur de chandeliers + Analyste quant : ×10', () => {
    expect(multi(['chartist', 'candleReader', 'quantAnalyst'], ['supportBounce', 'hammer'])).toBe(10);
  });

  it('5. Vendeur à découvert + Suiveur de tendance : short isolé en baisse ×3,75', () => {
    expect(multi(['shortSeller', 'trendFollower'], ['rsiOverbought'], { direction: 'short', trendSlope: -1 })).toBe(3.75);
  });
});
