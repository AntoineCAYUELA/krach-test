// Les 14 cartes Signal et leurs conditions de validité (GDD 2.6).
// Une carte est valide si sa condition est vraie sur la dernière bougie close ET si sa direction
// correspond à celle de la position.

import { CONFIG } from '../config.ts';
import { fmt } from '../format.ts';
import { snapshot, sma, type IndicatorSnapshot } from './indicators.ts';
import type { Candle, CardFamily, CardId, Direction, ToolId } from './types.ts';

/** Direction d'une carte : fixe, ou déduite de la bougie t / des 3 dernières bougies. */
export type CardDirection = Direction | 'lastCandle' | 'lastThree';

export interface CardDef {
  id: CardId;
  name: string;
  family: CardFamily;
  direction: CardDirection;
  /** Condition lisible, affichée sur la carte. */
  rule: string;
  /** Exemplaires dans le deck de départ. */
  startingCount: number;
}

const C = CONFIG.cards;

export const CARDS: Record<CardId, CardDef> = {
  hammer: { id: 'hammer', name: 'Marteau', family: 'candlestick', direction: 'long', rule: `Mèche basse ≥ ${C.wickBodyRatio} × corps, mèche haute ≤ corps, Close < MM20`, startingCount: 1 },
  shootingStar: { id: 'shootingStar', name: 'Étoile filante', family: 'candlestick', direction: 'short', rule: `Mèche haute ≥ ${C.wickBodyRatio} × corps, mèche basse ≤ corps, Close > MM20`, startingCount: 1 },
  bullishEngulfing: { id: 'bullishEngulfing', name: 'Avalement haussier', family: 'candlestick', direction: 'long', rule: 'Bougie rouge puis verte dont le corps englobe le précédent', startingCount: 1 },
  bearishEngulfing: { id: 'bearishEngulfing', name: 'Avalement baissier', family: 'candlestick', direction: 'short', rule: 'Bougie verte puis rouge dont le corps englobe le précédent', startingCount: 1 },
  rsiOversold: { id: 'rsiOversold', name: 'RSI survendu', family: 'indicator', direction: 'long', rule: `RSI < ${C.rsiOversold}`, startingCount: 2 },
  rsiOverbought: { id: 'rsiOverbought', name: 'RSI suracheté', family: 'indicator', direction: 'short', rule: `RSI > ${C.rsiOverbought}`, startingCount: 2 },
  goldenCross: { id: 'goldenCross', name: 'Golden cross', family: 'indicator', direction: 'long', rule: `MM5 passe au-dessus de MM20 (sur les ${CONFIG.indicators.crossLookback} dernières bougies)`, startingCount: 1 },
  deathCross: { id: 'deathCross', name: 'Death cross', family: 'indicator', direction: 'short', rule: `MM5 passe sous MM20 (sur les ${CONFIG.indicators.crossLookback} dernières bougies)`, startingCount: 1 },
  supportBounce: { id: 'supportBounce', name: 'Rebond sur support', family: 'level', direction: 'long', rule: 'Le Low touche le support (±1 %) et le Close reste au-dessus', startingCount: 2 },
  resistanceRejection: { id: 'resistanceRejection', name: 'Rejet de résistance', family: 'level', direction: 'short', rule: 'Le High touche la résistance (±1 %) et le Close reste en dessous', startingCount: 2 },
  bullishBreakout: { id: 'bullishBreakout', name: 'Cassure haussière', family: 'level', direction: 'long', rule: 'Close au-dessus de la résistance', startingCount: 1 },
  bearishBreakout: { id: 'bearishBreakout', name: 'Cassure baissière', family: 'level', direction: 'short', rule: 'Close sous le support', startingCount: 1 },
  volumeSpike: { id: 'volumeSpike', name: 'Pic de volume', family: 'volume', direction: 'lastCandle', rule: `Volume ≥ ${C.volumeSpikeRatio} × moyenne ; long si bougie verte, short si rouge`, startingCount: 2 },
  volumeConfirmation: { id: 'volumeConfirmation', name: 'Volume confirmant', family: 'volume', direction: 'lastThree', rule: `Volume moyen des ${C.volumeConfirmCandles} dernières bougies ≥ ${fmt(C.volumeConfirmRatio, 1)} × moyenne, dans le sens du prix`, startingCount: 2 },
};

export const CARD_IDS = Object.keys(CARDS) as CardId[];

export const FAMILY_NAMES: Record<CardFamily, string> = {
  candlestick: 'Chandelier',
  indicator: 'Indicateur',
  level: 'Niveau',
  volume: 'Volume',
};

/** Deck de départ de 20 cartes (GDD 2.6). */
export function startingDeck(): CardId[] {
  return CARD_IDS.flatMap((id) => Array<CardId>(CARDS[id].startingCount).fill(id));
}

/** Tout ce dont une carte a besoin pour être évaluée. */
export interface CardContext {
  candles: readonly Candle[];
  closes: readonly number[];
  snap: IndicatorSnapshot;
  rsiOversold: number;
  rsiOverbought: number;
}

export function cardContext(candles: readonly Candle[], tools: readonly ToolId[]): CardContext {
  const oscillator = tools.includes('rsiOscillator');
  return {
    candles,
    closes: candles.map((c) => c.c),
    snap: snapshot(candles),
    rsiOversold: oscillator ? CONFIG.tools.rsiOscillator.oversold : C.rsiOversold,
    rsiOverbought: oscillator ? CONFIG.tools.rsiOscillator.overbought : C.rsiOverbought,
  };
}

export interface CardCheck {
  valid: boolean;
  /** Raison en une ligne, affichée sous la carte (GDD 2.3 étape 2). */
  reason: string;
}

const DIR_NAME: Record<Direction, string> = { long: 'long', short: 'short' };

function at(candles: readonly Candle[], i: number): Candle {
  const candle = candles[i];
  if (!candle) throw new Error(`Bougie ${i} absente`);
  return candle;
}

/** Évalue une carte pour une direction donnée, sur la dernière bougie close. */
export function checkCard(id: CardId, direction: Direction, ctx: CardContext): CardCheck {
  const def = CARDS[id];
  if ((def.direction === 'long' || def.direction === 'short') && def.direction !== direction) {
    return { valid: false, reason: `Carte ${DIR_NAME[def.direction]} : inutilisable en ${DIR_NAME[direction]}` };
  }
  const { candles, snap } = ctx;
  const t = candles.length - 1;
  const cur = at(candles, t);
  const body = Math.abs(cur.c - cur.o);
  const lowerWick = Math.min(cur.o, cur.c) - cur.l;
  const upperWick = cur.h - Math.max(cur.o, cur.c);
  const sma20 = snap.sma20 ?? NaN;

  switch (id) {
    case 'hammer':
    case 'shootingStar': {
      const isHammer = id === 'hammer';
      const longWick = isHammer ? lowerWick : upperWick;
      const shortWick = isHammer ? upperWick : lowerWick;
      const wickOk = longWick >= C.wickBodyRatio * body && shortWick <= body;
      const contextOk = isHammer ? cur.c < sma20 : cur.c > sma20;
      const ratio = body > 0 ? longWick / body : Infinity;
      const ratioText = Number.isFinite(ratio) ? `${fmt(ratio, 1)} × corps` : 'corps nul';
      if (!wickOk) return { valid: false, reason: `Mèche ${isHammer ? 'basse' : 'haute'} = ${ratioText}, il faut ≥ ${C.wickBodyRatio} et l'autre mèche ≤ corps` };
      if (!contextOk) return { valid: false, reason: `Close ${isHammer ? '≥' : '≤'} MM20 (${fmt(sma20)}) : pas de ${isHammer ? 'baisse' : 'hausse'} préalable` };
      return { valid: true, reason: `Mèche ${isHammer ? 'basse' : 'haute'} = ${ratioText}, Close ${isHammer ? '<' : '>'} MM20` };
    }
    case 'bullishEngulfing':
    case 'bearishEngulfing': {
      const prev = at(candles, t - 1);
      const bullish = id === 'bullishEngulfing';
      const prevOk = bullish ? prev.c < prev.o : prev.c > prev.o;
      const curOk = bullish ? cur.c > cur.o : cur.c < cur.o;
      const engulfs = bullish ? cur.o <= prev.c && cur.c >= prev.o : cur.o >= prev.c && cur.c <= prev.o;
      if (!prevOk) return { valid: false, reason: `La bougie précédente n'est pas ${bullish ? 'rouge' : 'verte'}` };
      if (!curOk) return { valid: false, reason: `La dernière bougie n'est pas ${bullish ? 'verte' : 'rouge'}` };
      if (!engulfs) return { valid: false, reason: 'Le corps n’englobe pas celui de la bougie précédente' };
      return { valid: true, reason: `Avalement ${bullish ? 'haussier' : 'baissier'} confirmé` };
    }
    case 'rsiOversold': {
      const value = snap.rsi ?? NaN;
      return value < ctx.rsiOversold
        ? { valid: true, reason: `RSI = ${fmt(value, 1)} < ${ctx.rsiOversold}` }
        : { valid: false, reason: `RSI = ${fmt(value, 1)}, il faut < ${ctx.rsiOversold}` };
    }
    case 'rsiOverbought': {
      const value = snap.rsi ?? NaN;
      return value > ctx.rsiOverbought
        ? { valid: true, reason: `RSI = ${fmt(value, 1)} > ${ctx.rsiOverbought}` }
        : { valid: false, reason: `RSI = ${fmt(value, 1)}, il faut > ${ctx.rsiOverbought}` };
    }
    case 'goldenCross':
    case 'deathCross': {
      const closes = ctx.closes;
      const { smaShort, smaLong, crossLookback } = CONFIG.indicators;
      const diff = (i: number) => (sma(closes, smaShort, i) ?? NaN) - (sma(closes, smaLong, i) ?? NaN);
      const now = diff(t);
      const before: number[] = [];
      for (let i = t - crossLookback; i < t; i++) before.push(diff(i));
      const golden = id === 'goldenCross';
      const nowOk = golden ? now > 0 : now < 0;
      const crossed = golden ? before.some((d) => d <= 0) : before.some((d) => d >= 0);
      if (!nowOk) return { valid: false, reason: `MM5 ${golden ? 'sous' : 'au-dessus de'} MM20 actuellement` };
      if (!crossed) return { valid: false, reason: `Pas de croisement sur les ${crossLookback} dernières bougies` };
      return { valid: true, reason: `MM5 vient de passer ${golden ? 'au-dessus de' : 'sous'} MM20` };
    }
    case 'supportBounce': {
      const level = snap.support ?? NaN;
      const touches = cur.l <= level * (1 + C.levelTolerance);
      const holds = cur.c > level;
      if (!touches) return { valid: false, reason: `Low ${fmt(cur.l)} trop loin du support ${fmt(level)}` };
      if (!holds) return { valid: false, reason: `Close ${fmt(cur.c)} sous le support ${fmt(level)} : cassure, pas rebond` };
      return { valid: true, reason: `Low ${fmt(cur.l)} touche le support ${fmt(level)}, Close au-dessus` };
    }
    case 'resistanceRejection': {
      const level = snap.resistance ?? NaN;
      const touches = cur.h >= level * (1 - C.levelTolerance);
      const holds = cur.c < level;
      if (!touches) return { valid: false, reason: `High ${fmt(cur.h)} trop loin de la résistance ${fmt(level)}` };
      if (!holds) return { valid: false, reason: `Close ${fmt(cur.c)} au-dessus de la résistance ${fmt(level)} : cassure, pas rejet` };
      return { valid: true, reason: `High ${fmt(cur.h)} touche la résistance ${fmt(level)}, Close en dessous` };
    }
    case 'bullishBreakout': {
      const level = snap.resistance ?? NaN;
      return cur.c > level
        ? { valid: true, reason: `Close ${fmt(cur.c)} > résistance ${fmt(level)}` }
        : { valid: false, reason: `Close ${fmt(cur.c)}, il faut > résistance ${fmt(level)}` };
    }
    case 'bearishBreakout': {
      const level = snap.support ?? NaN;
      return cur.c < level
        ? { valid: true, reason: `Close ${fmt(cur.c)} < support ${fmt(level)}` }
        : { valid: false, reason: `Close ${fmt(cur.c)}, il faut < support ${fmt(level)}` };
    }
    case 'volumeSpike': {
      const avg = snap.averageVolume ?? NaN;
      const ratio = cur.v / avg;
      const candleDirection: Direction = cur.c > cur.o ? 'long' : 'short';
      if (ratio < C.volumeSpikeRatio) return { valid: false, reason: `Volume = ${fmt(ratio, 1)} × moyenne, il faut ≥ ${C.volumeSpikeRatio}` };
      if (candleDirection !== direction) return { valid: false, reason: `Bougie ${cur.c > cur.o ? 'verte' : 'rouge'} : le signal est ${candleDirection}` };
      return { valid: true, reason: `Volume = ${fmt(ratio, 1)} × moyenne, bougie ${cur.c > cur.o ? 'verte' : 'rouge'}` };
    }
    case 'volumeConfirmation': {
      const avg = snap.averageVolume ?? NaN;
      const n = C.volumeConfirmCandles;
      let recent = 0;
      for (let i = t - n + 1; i <= t; i++) recent += at(candles, i).v;
      const ratio = recent / n / avg;
      const priceDirection: Direction = cur.c > at(candles, t - n).c ? 'long' : 'short';
      if (ratio < C.volumeConfirmRatio) return { valid: false, reason: `Volume récent = ${fmt(ratio, 2)} × moyenne, il faut ≥ ${fmt(C.volumeConfirmRatio, 1)}` };
      if (priceDirection !== direction) return { valid: false, reason: `Le prix ${priceDirection === 'long' ? 'monte' : 'baisse'} : le signal est ${priceDirection}` };
      return { valid: true, reason: `Volume récent = ${fmt(ratio, 2)} × moyenne, prix en ${priceDirection === 'long' ? 'hausse' : 'baisse'}` };
    }
  }
}
