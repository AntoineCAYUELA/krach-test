// Ouverture et résolution d'une position (GDD 5.1 et 5.2).
// En jeu, l'issue (take-profit ou stop-loss) est tirée avec la chance affichée, puis le marché
// génère un chemin qui la respecte (GDD 2.7). Sur un marché scripté (tests), les bougies sont
// fixées et l'ordre de vérification à chaque bougie s'applique : gap à l'ouverture, stop-loss,
// liquidation, take-profit.

import { CONFIG } from '../config.ts';
import { advanceMarket, advanceMarketForTrade, lastCandle, type MarketState } from './market.ts';
import { directionSign, type Candle, type Direction } from './types.ts';

export interface TradeCosts {
  /** Spread total (ex. 0,002 = 0,20 %), payé moitié à l'entrée, moitié à la sortie. */
  spread: number;
  /** Frais de courtage par côté, en fraction du notionnel. */
  feePerSide: number;
}

export interface TradeOrder {
  direction: Direction;
  /** Mise (marge) en $. */
  stake: number;
  leverage: number;
  /** Distance du stop-loss en fraction du prix d'entrée (0,05 = −5 %), ou null. */
  stopLossPct: number | null;
  /** Distance du take-profit en fraction du prix d'entrée, ou null. */
  takeProfitPct: number | null;
  /** Durée en bougies (3, ou 1 avec le Scalpeur). */
  duration: number;
}

export type ExitReason = 'time' | 'stopLoss' | 'takeProfit' | 'liquidation';

export interface TradePreview {
  entryPrice: number;
  notional: number;
  fees: number;
  stopPrice: number | null;
  takePrice: number | null;
  liquidationPrice: number;
  /** Perte nette si le stop-loss est touché (négative), ou null sans stop. */
  lossAtStop: number | null;
}

export interface TradeResult extends TradePreview {
  order: TradeOrder;
  /** Prix de sortie avant spread (Close, niveau du stop/TP, Open en cas de gap). */
  exitPrice: number;
  /** Prix de sortie ajusté du spread. */
  exitPriceAdjusted: number;
  exitReason: ExitReason;
  /** Le stop a été sauté par un gap à l'ouverture (slippage). */
  gapped: boolean;
  /** Index (0 à duration − 1) de la bougie où la position a été fermée. */
  exitOffset: number;
  /** Rendement r (GDD 5.1). */
  returnPct: number;
  pnlGross: number;
  pnlNet: number;
  /** Les bougies jouées pendant la position (toujours `duration` bougies). */
  candles: Candle[];
}

function entryPrice(close: number, direction: Direction, costs: TradeCosts): number {
  return close * (1 + (directionSign(direction) * costs.spread) / 2);
}

/** Prix auquel la perte latente atteint le seuil de liquidation (80 % de la mise). */
export function liquidationPrice(entry: number, direction: Direction, leverage: number): number {
  return entry * (1 - (directionSign(direction) * CONFIG.trade.liquidationThreshold) / leverage);
}

function netPnl(notional: number, entry: number, exit: number, direction: Direction, costs: TradeCosts) {
  const d = directionSign(direction);
  const exitAdjusted = exit * (1 - (d * costs.spread) / 2);
  const returnPct = d * (exitAdjusted / entry - 1);
  const pnlGross = notional * returnPct;
  const fees = 2 * costs.feePerSide * notional;
  return { exitAdjusted, returnPct, pnlGross, fees, pnlNet: pnlGross - fees };
}

/** Aperçu du ticket d'ordre (GDD 2.3 étape 4) au prix de la dernière bougie close. */
export function previewTrade(close: number, order: TradeOrder, costs: TradeCosts): TradePreview {
  const d = directionSign(order.direction);
  const entry = entryPrice(close, order.direction, costs);
  const notional = order.stake * order.leverage;
  const stopPrice = order.stopLossPct === null ? null : entry * (1 - d * order.stopLossPct);
  const takePrice = order.takeProfitPct === null ? null : entry * (1 + d * order.takeProfitPct);
  const liquidation = liquidationPrice(entry, order.direction, order.leverage);
  let lossAtStop: number | null = null;
  if (stopPrice !== null) {
    // Si le stop est au-delà du prix de liquidation, c'est la liquidation qui arrive d'abord.
    const stopBeyondLiquidation = d * (stopPrice - liquidation) <= 0;
    lossAtStop = stopBeyondLiquidation ? -order.stake : netPnl(notional, entry, stopPrice, order.direction, costs).pnlNet;
  }
  return { entryPrice: entry, notional, fees: 2 * costs.feePerSide * notional, stopPrice, takePrice, liquidationPrice: liquidation, lossAtStop };
}

/**
 * Ouvre la position au Close de la dernière bougie, fait avancer le marché de `duration` bougies
 * et ferme la position. Le marché avance toujours de `duration` bougies, même si la position est
 * fermée plus tôt : le temps est consommé (GDD 2.3 étape 7).
 */
export function resolveTrade(market: MarketState, order: TradeOrder, costs: TradeCosts, win?: boolean): TradeResult {
  const d = directionSign(order.direction);
  const preview = previewTrade(lastCandle(market).c, order, costs);
  const entry = preview.entryPrice;
  let candles: Candle[] = [];

  let exitPrice: number | null = null;
  let exitReason: ExitReason = 'time';
  let gapped = false;
  let exitOffset = order.duration - 1;

  if (win !== undefined && !market.scripted && preview.stopPrice !== null && preview.takePrice !== null) {
    const path = advanceMarketForTrade(market, { direction: order.direction, stopPrice: preview.stopPrice, takePrice: preview.takePrice, win, duration: order.duration });
    candles = path.candles;
    exitPrice = path.exitPrice;
    exitReason = path.reason;
    gapped = path.gapped;
    exitOffset = path.exitOffset;
  }

  for (let k = 0; k < order.duration && candles.length < order.duration; k++) {
    const candle = advanceMarket(market);
    candles.push(candle);
    if (exitPrice !== null) continue;

    const worst = d === 1 ? candle.l : candle.h;
    const best = d === 1 ? candle.h : candle.l;

    if (preview.stopPrice !== null) {
      // 1. Gap à l'ouverture au-delà du stop : sortie au prix d'Open (slippage).
      if (d * (candle.o - preview.stopPrice) <= 0) {
        exitPrice = candle.o;
        exitReason = 'stopLoss';
        gapped = true;
        exitOffset = k;
        continue;
      }
      // 2. Stop-loss touché pendant la bougie.
      if (d * (worst - preview.stopPrice) <= 0) {
        exitPrice = preview.stopPrice;
        exitReason = 'stopLoss';
        exitOffset = k;
        continue;
      }
    }
    // 3. Liquidation : la perte latente atteint 80 % de la mise.
    if (d * (worst / entry - 1) * order.leverage <= -CONFIG.trade.liquidationThreshold) {
      exitPrice = preview.liquidationPrice;
      exitReason = 'liquidation';
      exitOffset = k;
      continue;
    }
    // 4. Take-profit.
    if (preview.takePrice !== null && d * (best - preview.takePrice) >= 0) {
      exitPrice = preview.takePrice;
      exitReason = 'takeProfit';
      exitOffset = k;
    }
  }

  // Une perte ne peut pas dépasser la mise : au-delà, la position aurait été liquidée.
  const finalExit = exitPrice ?? (candles[candles.length - 1] as Candle).c;
  const pnl = netPnl(preview.notional, entry, finalExit, order.direction, costs);
  if (exitReason !== 'liquidation' && pnl.pnlNet < -order.stake) exitReason = 'liquidation';

  if (exitReason === 'liquidation') {
    // Liquidation : toute la mise est perdue, frais inclus (GDD 5.2).
    return {
      ...preview,
      order,
      exitPrice: preview.liquidationPrice,
      exitPriceAdjusted: preview.liquidationPrice,
      exitReason,
      gapped,
      exitOffset,
      returnPct: -order.stake / preview.notional,
      pnlGross: -order.stake,
      fees: 0,
      pnlNet: -order.stake,
      candles,
    };
  }

  return {
    ...preview,
    order,
    exitPrice: finalExit,
    exitPriceAdjusted: pnl.exitAdjusted,
    exitReason,
    gapped,
    exitOffset,
    returnPct: pnl.returnPct,
    pnlGross: pnl.pnlGross,
    fees: pnl.fees,
    pnlNet: pnl.pnlNet,
    candles,
  };
}
