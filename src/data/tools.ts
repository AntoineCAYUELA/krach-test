// Textes des 15 Outils (GDD 6). Les nombres viennent de CONFIG.

import { CONFIG } from '../config.ts';
import { fmt, pct } from '../format.ts';
import type { Rarity, ToolId } from '../engine/types.ts';

export interface ToolDef {
  id: ToolId;
  name: string;
  rarity: Rarity;
  price: number;
  effect: string;
  concept: string;
}

const T = CONFIG.tools;

/** Chance de base selon la distance du take-profit, en unités u (GDD 2.7). */
const baseChance = (takeUnits: number) => CONFIG.forecast.stopUnits / (CONFIG.forecast.stopUnits + takeUnits);

export const TOOLS: Record<ToolId, ToolDef> = {
  stopLoss: {
    id: 'stopLoss', name: 'Stop-loss discipliné', rarity: T.stopLoss.rarity, price: T.stopLoss.price,
    effect: `Un trade fermé au stop-loss ne retire que ${fmt(T.stopLoss.lossFactor * 100, 0)} % de sa perte à la Performance, au lieu de ${fmt(CONFIG.scoring.lossFactor * 100, 0)} %. +${T.stopLoss.primesPerStop} P par position fermée au stop-loss.`,
    concept: 'Une perte coupée au stop-loss est une perte maîtrisée : elle fait partie du métier.',
  },
  takeProfit: {
    id: 'takeProfit', name: 'Take-profit méthodique', rarity: T.takeProfit.rarity, price: T.takeProfit.price,
    effect: `Take-profit à ${fmt(T.takeProfit.takeUnits, 0)} u au lieu de ${fmt(CONFIG.forecast.takeUnits, 1)} u : ratio risque/rendement de ${fmt(T.takeProfit.takeUnits / CONFIG.forecast.stopUnits, 0)}, la chance de base passe de ${pct(baseChance(CONFIG.forecast.takeUnits), 0)} à ${pct(baseChance(T.takeProfit.takeUnits), 0)}.`,
    concept: 'Viser plus loin rapporte plus par trade gagnant, mais on gagne moins souvent.',
  },
  lowCostBroker: {
    id: 'lowCostBroker', name: 'Courtier low-cost', rarity: T.lowCostBroker.rarity, price: T.lowCostBroker.price,
    effect: `Frais : ${pct(CONFIG.costs.feePerSide)} → ${pct(T.lowCostBroker.feePerSide)} par côté.`,
    concept: 'Les frais de courtage réduisent chaque P&L.',
  },
  marketMaker: {
    id: 'marketMaker', name: 'Teneur de marché', rarity: T.marketMaker.rarity, price: T.marketMaker.price,
    effect: `Spread : ${pct(CONFIG.costs.spread)} → ${pct(T.marketMaker.spread)}.`,
    concept: 'Le spread est un coût caché payé à chaque trade.',
  },
  candleReader: {
    id: 'candleReader', name: 'Lecteur de chandeliers', rarity: T.candleReader.rarity, price: T.candleReader.price,
    effect: `+${fmt(T.candleReader.multiPerCard, 0)} Multi par carte Chandelier valide jouée.`,
    concept: 'Les figures de chandeliers résument la bataille acheteurs/vendeurs.',
  },
  rsiOscillator: {
    id: 'rsiOscillator', name: 'Oscillateur RSI', rarity: T.rsiOscillator.rarity, price: T.rsiOscillator.price,
    effect: `Seuils RSI : ${T.rsiOscillator.oversold}/${T.rsiOscillator.overbought} au lieu de ${CONFIG.cards.rsiOversold}/${CONFIG.cards.rsiOverbought}.`,
    concept: 'Élargir les seuils donne plus de signaux, mais moins fiables.',
  },
  calendar: {
    id: 'calendar', name: 'Calendrier économique', rarity: T.calendar.rarity, price: T.calendar.price,
    effect: `Les news sont annoncées ${T.calendar.warningCandles} bougies à l’avance (titre et sentiment, pas le résultat).`,
    concept: 'Le calendrier économique permet d’anticiper les moments de forte volatilité.',
  },
  chartist: {
    id: 'chartist', name: 'Chartiste', rarity: T.chartist.rarity, price: T.chartist.price,
    effect: `+${fmt(T.chartist.multiPerCard, 1)} Multi par carte Niveau valide jouée.`,
    concept: 'Les supports et résistances sont des zones où le prix réagit souvent.',
  },
  leverage: {
    id: 'leverage', name: 'Effet de levier', rarity: T.leverage.rarity, price: T.leverage.price,
    effect: `Taille Agressif : levier ×${CONFIG.sizes.aggressive.leverage} → ×${CONFIG.sizes.aggressive.toolLeverage}.`,
    concept: 'Le levier multiplie gains ET pertes : à ×5, chaque stop-loss coûte environ 15 % du capital.',
  },
  shortSeller: {
    id: 'shortSeller', name: 'Vendeur à découvert', rarity: T.shortSeller.rarity, price: T.shortSeller.price,
    effect: `+${T.shortSeller.multiBonus} Multi sur les positions short.`,
    concept: 'Le short permet de gagner quand le prix baisse.',
  },
  trendFollower: {
    id: 'trendFollower', name: 'Suiveur de tendance', rarity: T.trendFollower.rarity, price: T.trendFollower.price,
    effect: `×${fmt(T.trendFollower.multiFactor, 1)} Multi si la direction correspond au signe de la pente de tendance (MM20).`,
    concept: '« The trend is your friend » : trader dans le sens de la tendance.',
  },
  scalper: {
    id: 'scalper', name: 'Scalpeur', rarity: T.scalper.rarity, price: T.scalper.price,
    effect: `Débloque les positions d’${CONFIG.seance.scalpDuration} bougie (1 ordre, ${CONFIG.seance.scalpDuration} bougie de temps, stop-loss et take-profit plus proches : u × √(1/3)). +${T.scalper.multiBonus} Multi sur ces positions.`,
    concept: 'Le scalping multiplie les trades courts ; les frais pèsent lourd.',
  },
  twoPercentRule: {
    id: 'twoPercentRule', name: 'Règle des 2 %', rarity: T.twoPercentRule.rarity, price: T.twoPercentRule.price,
    effect: `×${T.twoPercentRule.multiFactor} Multi si le risque du trade (notionnel × distance du stop-loss) ≤ ${pct(T.twoPercentRule.maxRiskPct, 0)} du capital.`,
    concept: 'Gestion du risque : ne jamais risquer plus de 1 à 2 % du capital par trade.',
  },
  tradingJournal: {
    id: 'tradingJournal', name: 'Carnet de trading', rarity: T.tradingJournal.rarity, price: T.tradingJournal.price,
    effect: `+${fmt(T.tradingJournal.multiPerWin, 1)} Multi permanent à chaque trade gagnant joué avec au moins ${T.tradingJournal.minValidCards} cartes valides. Plafond : +${T.tradingJournal.cap}.`,
    concept: 'Le journal de trading fait progresser par l’analyse de ses trades.',
  },
  quantAnalyst: {
    id: 'quantAnalyst', name: 'Analyste quant', rarity: T.quantAnalyst.rarity, price: T.quantAnalyst.price,
    effect: `×${T.quantAnalyst.multiFactor} Multi si le setup contient des cartes valides d’au moins ${T.quantAnalyst.minFamilies} familles.`,
    concept: 'L’analyse quantitative combine des signaux indépendants.',
  },
};

export const TOOL_IDS = Object.keys(TOOLS) as ToolId[];

export const RARITY_NAMES: Record<Rarity, string> = { common: 'Commun', uncommon: 'Peu commun', rare: 'Rare' };
