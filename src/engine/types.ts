// Types partagés par tout le moteur de jeu.

export type Regime = 'bull' | 'bear' | 'range';
export type Direction = 'long' | 'short';

/** +1 pour long, −1 pour short : simplifie les formules symétriques (GDD 5.1). */
export function directionSign(direction: Direction): 1 | -1 {
  return direction === 'long' ? 1 : -1;
}

export interface NewsEvent {
  headline: string;
  sentiment: 'positive' | 'negative';
  /** Gap réellement appliqué à l'ouverture, signé (ex. −0.042 = −4,2 %). */
  gap: number;
}

/** Une bougie OHLC + volume (GDD 2.4). Le régime est caché au joueur pendant la séance. */
export interface Candle {
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
  regime: Regime;
  news?: NewsEvent;
}

export type CardFamily = 'candlestick' | 'indicator' | 'level' | 'volume';

/** Rôle d'une carte (GDD 2.7) : retournement du prix, ou continuation du mouvement. */
export type CardRole = 'reversal' | 'continuation';

/** Contexte de marché affiché (GDD 2.7), calculé sur le graphique visible. */
export type MarketContext = 'up' | 'down' | 'flat';

/** Les 3 tailles de position du ticket (GDD 2.3). */
export const SIZE_IDS = ['prudent', 'normal', 'aggressive'] as const;
export type SizeId = (typeof SIZE_IDS)[number];

export type CardId =
  | 'hammer'
  | 'shootingStar'
  | 'bullishEngulfing'
  | 'bearishEngulfing'
  | 'rsiOversold'
  | 'rsiOverbought'
  | 'goldenCross'
  | 'deathCross'
  | 'supportBounce'
  | 'resistanceRejection'
  | 'bullishBreakout'
  | 'bearishBreakout'
  | 'volumeSpike'
  | 'volumeConfirmation';

export type SetupType = 'feeling' | 'single' | 'double' | 'confluence' | 'triple' | 'totalConfluence';

export type ToolId =
  | 'stopLoss'
  | 'takeProfit'
  | 'lowCostBroker'
  | 'marketMaker'
  | 'candleReader'
  | 'rsiOscillator'
  | 'calendar'
  | 'chartist'
  | 'leverage'
  | 'shortSeller'
  | 'trendFollower'
  | 'scalper'
  | 'twoPercentRule'
  | 'tradingJournal'
  | 'quantAnalyst';

export type ConsumableId = 'analystReport' | 'training' | 'signalPack' | 'hedge' | 'extraOrder' | 'crystalBall';

export type EventId = 'rangeMarket' | 'earningsDay' | 'doubleFees' | 'lowVolatility' | 'crash';

/** GDD 13 : poste, logement et activités, dans l'ordre des améliorations. */
export const SETUP_IDS = ['laptop', 'tower', 'dualScreen'] as const;
export type SetupId = (typeof SETUP_IDS)[number];
export const HOME_IDS = ['studio', 't2', 'loft'] as const;
export type HomeId = (typeof HOME_IDS)[number];
export const ACTIVITY_IDS = ['evening', 'spa', 'weekend', 'trip'] as const;
export type ActivityId = (typeof ACTIVITY_IDS)[number];

export type Rarity = 'common' | 'uncommon' | 'rare';
