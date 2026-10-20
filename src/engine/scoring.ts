// Formule de score (GDD 5.1) : setup, multiplicateur de conviction et Performance.

import { CONFIG } from '../config.ts';
import { CARDS } from './cards.ts';
import { STRESS_NAMES, stressMultiFactor, type StressState } from './life.ts';
import type { CardFamily, CardId, Direction, SetupType, ToolId } from './types.ts';

export const SETUP_NAMES: Record<SetupType, string> = {
  feeling: 'Trade au feeling',
  single: 'Signal isolé',
  double: 'Double signal',
  confluence: 'Confluence',
  triple: 'Triple signal',
  totalConfluence: 'Confluence totale',
};

export const SETUP_TYPES = Object.keys(SETUP_NAMES) as SetupType[];

export interface SetupResult {
  type: SetupType;
  baseMulti: number;
  validCards: CardId[];
  families: CardFamily[];
}

/** Classe le setup d'après les cartes valides jouées (les invalides sont ignorées). */
export function classifySetup(validCards: readonly CardId[]): SetupResult {
  const cards = validCards.slice(0, CONFIG.seance.maxPlayedCards);
  const families = [...new Set(cards.map((id) => CARDS[id].family))];
  let type: SetupType;
  if (cards.length === 0) type = 'feeling';
  else if (cards.length === 1) type = 'single';
  else if (cards.length === 2) type = families.length === 1 ? 'double' : 'confluence';
  else type = families.length === 3 ? 'totalConfluence' : 'triple';
  return { type, baseMulti: CONFIG.scoring.setupMulti[type], validCards: cards, families };
}

export interface MultiTerm {
  label: string;
  kind: 'add' | 'mul';
  value: number;
}

export interface MultiBreakdown {
  base: number;
  terms: MultiTerm[];
  total: number;
}

export interface MultiInput {
  setup: SetupResult;
  direction: Direction;
  tools: readonly ToolId[];
  /** Pente de tendance (MM20) à l'entrée. */
  trendSlope: number | null;
  /** Durée de la position en bougies (1 = scalping). */
  duration: number;
  /** La position a été fermée par le take-profit de l'Outil Take-profit méthodique. */
  exitByToolTakeProfit: boolean;
  /** Condition de la Règle des 2 % remplie (stop présent et risque ≤ 2 % du capital). */
  twoPercentOk: boolean;
  /** Bonus permanent du Carnet de trading. */
  journalBonus: number;
  /** Bonus permanent de Formation pour ce type de setup. */
  formationBonus: number;
  /** État de stress de la séance (GDD 13.2) ; absent si la vie du trader est désactivée. */
  stressState?: StressState;
}

/** Multi total = (Multi de setup + somme des bonus additifs) × produit des bonus multiplicatifs. */
export function computeMulti(input: MultiInput): MultiBreakdown {
  const T = CONFIG.tools;
  const has = (id: ToolId) => input.tools.includes(id);
  const terms: MultiTerm[] = [];
  const countFamily = (family: CardFamily) => input.setup.validCards.filter((id) => CARDS[id].family === family).length;

  if (input.formationBonus > 0) terms.push({ label: 'Formation', kind: 'add', value: input.formationBonus });
  if (has('tradingJournal') && input.journalBonus > 0) terms.push({ label: 'Carnet de trading', kind: 'add', value: input.journalBonus });
  if (has('candleReader') && countFamily('candlestick') > 0)
    terms.push({ label: 'Lecteur de chandeliers', kind: 'add', value: T.candleReader.multiPerCard * countFamily('candlestick') });
  if (has('chartist') && countFamily('level') > 0) terms.push({ label: 'Chartiste', kind: 'add', value: T.chartist.multiPerCard * countFamily('level') });
  if (has('shortSeller') && input.direction === 'short') terms.push({ label: 'Vendeur à découvert', kind: 'add', value: T.shortSeller.multiBonus });
  if (has('scalper') && input.duration === CONFIG.seance.scalpDuration) terms.push({ label: 'Scalpeur', kind: 'add', value: T.scalper.multiBonus });
  if (has('takeProfit') && input.exitByToolTakeProfit) terms.push({ label: 'Take-profit méthodique', kind: 'add', value: T.takeProfit.multiBonus });

  const slope = input.trendSlope ?? 0;
  const withTrend = (slope > 0 && input.direction === 'long') || (slope < 0 && input.direction === 'short');
  if (has('trendFollower') && withTrend) terms.push({ label: 'Suiveur de tendance', kind: 'mul', value: T.trendFollower.multiFactor });
  if (has('twoPercentRule') && input.twoPercentOk) terms.push({ label: 'Règle des 2 %', kind: 'mul', value: T.twoPercentRule.multiFactor });
  if (has('quantAnalyst') && input.setup.families.length >= T.quantAnalyst.minFamilies)
    terms.push({ label: 'Analyste quant', kind: 'mul', value: T.quantAnalyst.multiFactor });
  if (input.stressState && input.stressState !== 'calm')
    terms.push({ label: `Stress : ${STRESS_NAMES[input.stressState].toLowerCase()}`, kind: 'mul', value: stressMultiFactor(input.stressState) });

  const additive = terms.filter((t) => t.kind === 'add').reduce((sum, t) => sum + t.value, 0);
  const factor = terms.filter((t) => t.kind === 'mul').reduce((prod, t) => prod * t.value, 1);
  return { base: input.setup.baseMulti, terms, total: (input.setup.baseMulti + additive) * factor };
}

export interface TradeScore {
  analysisPoints: number;
  /** Résultat = Points d'analyse + P&L net. */
  result: number;
  /** Performance du trade : Résultat × Multi si ≥ 0, Résultat × 0,5 sinon (pénalité sans Multi). */
  performance: number;
}

export function scoreTrade(pnlNet: number, validCardCount: number, multiTotal: number): TradeScore {
  const analysisPoints = CONFIG.scoring.analysisPointsPerCard * validCardCount;
  const result = analysisPoints + pnlNet;
  const performance = result >= 0 ? result * multiTotal : result * CONFIG.scoring.lossFactor;
  return { analysisPoints, result, performance };
}

/** La Performance de séance ne descend jamais sous 0. */
export function addPerformance(seancePerformance: number, tradePerformance: number): number {
  return Math.max(0, seancePerformance + tradePerformance);
}
