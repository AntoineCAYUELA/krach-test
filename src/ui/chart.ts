// Graphique en chandeliers dessiné en Canvas 2D (GDD 9, écrans 4 et 6).
// Trois panneaux : prix (chandeliers, MM5, MM20, support, résistance), volume, RSI.
// Bougies vertes pleines et rouges creuses : le graphique reste lisible sans les couleurs.

import { CONFIG } from '../config.ts';
import { averageVolume, resistance, rsiSeries, smaSeries, support } from '../engine/indicators.ts';
import type { Candle, Regime } from '../engine/types.ts';
import { fmt } from '../format.ts';

export const COLORS = {
  background: '#0f1420',
  grid: '#1c2433',
  text: '#8a94a8',
  up: '#26c281',
  down: '#ef5350',
  sma5: '#f5c542',
  sma20: '#5aa9e6',
  support: '#7fd1b9',
  resistance: '#f08a8a',
  rsi: '#c39bd3',
  entry: '#e6ebf5',
  liquidation: '#ff9f43',
  separator: '#56627a',
  regime: { bull: 'rgba(38, 194, 129, 0.13)', bear: 'rgba(239, 83, 80, 0.13)', range: 'rgba(138, 148, 168, 0.10)' } as Record<Regime, string>,
  /** Mêmes teintes, plus visibles, pour la légende. */
  regimeLegend: { bull: 'rgba(38, 194, 129, 0.6)', bear: 'rgba(239, 83, 80, 0.6)', range: 'rgba(138, 148, 168, 0.5)' } as Record<Regime, string>,
};

export interface ChartLayers {
  sma5: boolean;
  sma20: boolean;
  volume: boolean;
  levels: boolean;
  rsi: boolean;
}

/** Ligne horizontale de prix : entrée, stop-loss, take-profit, liquidation. */
export interface PriceLine {
  price: number;
  label: string;
  color: string;
  dashed?: boolean;
}

/** Repère sur une bougie : entrée ou sortie d'une position. */
export interface CandleMarker {
  index: number;
  price: number;
  label: string;
  color: string;
}

export interface ChartOptions {
  candles: readonly Candle[];
  /** Nombre de cases horizontales : l'axe ne bouge pas pendant la séance. */
  slots: number;
  layers: ChartLayers;
  /** Index de la première bougie de la séance (ligne verticale « Début de séance »). */
  separatorIndex?: number;
  /** Seuils RSI affichés (30/70, ou 35/65 avec l'Oscillateur RSI). */
  rsiLevels?: readonly [number, number];
  lines?: PriceLine[];
  markers?: CandleMarker[];
  /** Bougies d'une position en cours, surlignées. */
  highlight?: { from: number; to: number };
  /** Fond coloré selon le régime réel (bilan de séance uniquement). */
  showRegimes?: boolean;
  hoverIndex?: number | null;
}

export interface ChartLayout {
  left: number;
  slotWidth: number;
  slots: number;
}

const AXIS_WIDTH = 66;
const PAD = 8;

/** Arrondi « joli » d'un pas de graduation (1, 2, 2,5 ou 5 × 10^n). */
function niceStep(range: number, ticks: number): number {
  const raw = range / ticks;
  const power = 10 ** Math.floor(Math.log10(raw));
  const unit = raw / power;
  const nice = unit < 1.5 ? 1 : unit < 2.25 ? 2 : unit < 3.5 ? 2.5 : unit < 7.5 ? 5 : 10;
  return nice * power;
}

export function drawChart(canvas: HTMLCanvasElement, options: ChartOptions): ChartLayout {
  const dpr = window.devicePixelRatio || 1;
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
  }
  const ctx = canvas.getContext('2d');
  const layout: ChartLayout = { left: PAD, slotWidth: (width - PAD - AXIS_WIDTH) / options.slots, slots: options.slots };
  if (!ctx || width === 0 || height === 0) return layout;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = COLORS.background;
  ctx.fillRect(0, 0, width, height);
  ctx.font = '11px system-ui, sans-serif';
  ctx.textBaseline = 'middle';

  const { candles, layers } = options;
  if (candles.length === 0) return layout;

  // Répartition verticale des panneaux.
  const volumeShare = layers.volume ? 0.16 : 0;
  const rsiShare = layers.rsi ? 0.2 : 0;
  const usable = height - PAD * 2;
  const priceHeight = usable * (1 - volumeShare - rsiShare) - (layers.volume ? 6 : 0) - (layers.rsi ? 6 : 0);
  const priceTop = PAD;
  const volumeTop = priceTop + priceHeight + 6;
  const volumeHeight = usable * volumeShare;
  const rsiTop = volumeTop + volumeHeight + (layers.volume ? 6 : 0);
  const rsiHeight = usable * rsiShare;
  const right = width - AXIS_WIDTH;
  const xOf = (i: number) => layout.left + (i + 0.5) * layout.slotWidth;

  // Fond par régime, surlignage de la position, curseur.
  if (options.showRegimes) {
    candles.forEach((c, i) => {
      ctx.fillStyle = COLORS.regime[c.regime];
      ctx.fillRect(layout.left + i * layout.slotWidth, priceTop, layout.slotWidth + 0.5, usable);
    });
  }
  if (options.highlight) {
    const { from, to } = options.highlight;
    ctx.fillStyle = 'rgba(230, 235, 245, 0.06)';
    ctx.fillRect(layout.left + from * layout.slotWidth, priceTop, (to - from + 1) * layout.slotWidth, usable);
  }
  if (options.hoverIndex !== undefined && options.hoverIndex !== null && options.hoverIndex < candles.length) {
    ctx.fillStyle = 'rgba(230, 235, 245, 0.08)';
    ctx.fillRect(layout.left + options.hoverIndex * layout.slotWidth, priceTop, layout.slotWidth, usable);
  }

  // Échelle de prix : toutes les bougies affichées, plus les lignes proches.
  let min = Infinity;
  let max = -Infinity;
  for (const c of candles) {
    min = Math.min(min, c.l);
    max = Math.max(max, c.h);
  }
  const span = max - min || max * 0.01;
  const reach = span * 0.35;
  for (const line of options.lines ?? []) {
    if (line.price >= min - reach && line.price <= max + reach) {
      min = Math.min(min, line.price);
      max = Math.max(max, line.price);
    }
  }
  const margin = (max - min) * 0.06;
  min -= margin;
  max += margin;
  const yOf = (price: number) => priceTop + ((max - price) / (max - min)) * priceHeight;

  // Grille et axe des prix.
  const step = niceStep(max - min, 6);
  const decimals = step < 0.1 ? 3 : 2;
  ctx.strokeStyle = COLORS.grid;
  ctx.lineWidth = 1;
  ctx.fillStyle = COLORS.text;
  ctx.textAlign = 'left';
  for (let p = Math.ceil(min / step) * step; p <= max; p += step) {
    const y = Math.round(yOf(p)) + 0.5;
    ctx.beginPath();
    ctx.moveTo(layout.left, y);
    ctx.lineTo(right, y);
    ctx.stroke();
    ctx.fillText(fmt(p, decimals), right + 6, y);
  }

  // Séparation historique / séance.
  if (options.separatorIndex !== undefined && options.separatorIndex < options.slots) {
    const x = Math.round(layout.left + options.separatorIndex * layout.slotWidth) + 0.5;
    ctx.save();
    ctx.setLineDash([3, 4]);
    ctx.strokeStyle = COLORS.separator;
    ctx.beginPath();
    ctx.moveTo(x, priceTop);
    ctx.lineTo(x, priceTop + usable);
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = COLORS.text;
    ctx.fillText('Début de séance', x + 4, priceTop + 8);
  }

  // Support et résistance de la dernière bougie (fenêtre des 20 bougies précédentes).
  const last = candles.length - 1;
  if (layers.levels) {
    const window = CONFIG.indicators.levelWindow;
    const levels: [number | null, string, string][] = [
      [support(candles, last), 'Support', COLORS.support],
      [resistance(candles, last), 'Résistance', COLORS.resistance],
    ];
    for (const [level, label, color] of levels) {
      if (level === null) continue;
      const y = Math.round(yOf(level)) + 0.5;
      ctx.save();
      ctx.setLineDash([6, 4]);
      ctx.strokeStyle = color;
      ctx.beginPath();
      ctx.moveTo(layout.left + Math.max(0, last - window) * layout.slotWidth, y);
      ctx.lineTo(right, y);
      ctx.stroke();
      ctx.restore();
      // Étiquette au début de la ligne : la droite est réservée aux lignes de la position.
      ctx.fillStyle = color;
      ctx.fillText(label, layout.left + Math.max(0, last - window) * layout.slotWidth + 4, y + (label === 'Support' ? 9 : -9));
    }
  }

  // Chandeliers.
  const bodyWidth = Math.max(1, Math.min(14, layout.slotWidth * 0.62));
  candles.forEach((c, i) => {
    const x = Math.round(xOf(i)) + 0.5;
    const up = c.c >= c.o;
    const color = up ? COLORS.up : COLORS.down;
    const top = yOf(Math.max(c.o, c.c));
    const bottom = yOf(Math.min(c.o, c.c));
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, yOf(c.h));
    ctx.lineTo(x, top);
    ctx.moveTo(x, bottom);
    ctx.lineTo(x, yOf(c.l));
    ctx.stroke();
    const bodyHeight = Math.max(1, bottom - top);
    const bx = Math.round(x - bodyWidth / 2) + 0.5;
    if (up) {
      ctx.fillStyle = color;
      ctx.fillRect(bx - 0.5, top, bodyWidth, bodyHeight);
    } else {
      ctx.strokeRect(bx, top + 0.5, bodyWidth - 1, Math.max(0.5, bodyHeight - 1));
    }
    if (c.news) {
      ctx.fillStyle = c.news.sentiment === 'positive' ? COLORS.up : COLORS.down;
      ctx.textAlign = 'center';
      ctx.fillText('N', x, yOf(c.h) - 9);
      ctx.textAlign = 'left';
    }
  });

  // Moyennes mobiles.
  const drawSeries = (series: readonly (number | null)[], color: string, toY: (v: number) => number) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    let started = false;
    series.forEach((v, i) => {
      if (v === null) return;
      if (started) ctx.lineTo(xOf(i), toY(v));
      else ctx.moveTo(xOf(i), toY(v));
      started = true;
    });
    ctx.stroke();
    ctx.lineWidth = 1;
  };
  if (layers.sma5) drawSeries(smaSeries(candles, CONFIG.indicators.smaShort), COLORS.sma5, yOf);
  if (layers.sma20) drawSeries(smaSeries(candles, CONFIG.indicators.smaLong), COLORS.sma20, yOf);

  // Lignes de la position : dans l'échelle, ou signalées au bord si elles sont trop loin.
  const tags: { y: number; text: string; color: string }[] = [];
  for (const line of options.lines ?? []) {
    const inside = line.price >= min && line.price <= max;
    const y = inside ? Math.round(yOf(line.price)) + 0.5 : line.price > max ? priceTop + 8 : priceTop + priceHeight - 8;
    if (inside) {
      ctx.save();
      ctx.strokeStyle = line.color;
      if (line.dashed) ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(layout.left, y);
      ctx.lineTo(right, y);
      ctx.stroke();
      ctx.restore();
    }
    tags.push({ y, text: `${line.label} ${fmt(line.price)}${inside ? '' : line.price > max ? ' ↑' : ' ↓'}`, color: line.color });
  }
  // Étiquettes empilées sans se chevaucher, dans la hauteur du panneau des prix.
  tags.sort((a, b) => a.y - b.y);
  for (let i = 1; i < tags.length; i++) {
    const previous = tags[i - 1] as (typeof tags)[number];
    const tag = tags[i] as (typeof tags)[number];
    tag.y = Math.max(tag.y, previous.y + 16);
  }
  const overflow = tags.length > 0 ? (tags[tags.length - 1] as (typeof tags)[number]).y - (priceTop + priceHeight - 8) : 0;
  for (const tag of tags) {
    if (overflow > 0) tag.y -= overflow;
    const textWidth = ctx.measureText(tag.text).width + 8;
    ctx.fillStyle = COLORS.background;
    ctx.fillRect(right - textWidth - 2, tag.y - 8, textWidth, 16);
    ctx.fillStyle = tag.color;
    ctx.textAlign = 'right';
    ctx.fillText(tag.text, right - 6, tag.y);
    ctx.textAlign = 'left';
  }

  // Repères d'entrée et de sortie.
  for (const marker of options.markers ?? []) {
    const x = xOf(marker.index);
    const y = yOf(marker.price);
    ctx.fillStyle = marker.color;
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillText(marker.label, x + 7, y - 9);
  }

  // Étiquette du dernier prix.
  const lastClose = (candles[last] as Candle).c;
  const lastY = yOf(lastClose);
  const lastUp = (candles[last] as Candle).c >= (candles[last] as Candle).o;
  ctx.fillStyle = lastUp ? COLORS.up : COLORS.down;
  ctx.fillRect(right + 2, lastY - 8, AXIS_WIDTH - 4, 16);
  ctx.fillStyle = COLORS.background;
  ctx.fillText(fmt(lastClose), right + 6, lastY);

  // Volume.
  if (layers.volume) {
    let maxVolume = 0;
    for (const c of candles) maxVolume = Math.max(maxVolume, c.v);
    const vy = (v: number) => volumeTop + volumeHeight - (v / maxVolume) * volumeHeight;
    candles.forEach((c, i) => {
      const up = c.c >= c.o;
      const x = Math.round(xOf(i) - bodyWidth / 2) + 0.5;
      const y = vy(c.v);
      ctx.strokeStyle = up ? COLORS.up : COLORS.down;
      ctx.fillStyle = up ? 'rgba(38, 194, 129, 0.55)' : 'rgba(239, 83, 80, 0.12)';
      ctx.fillRect(x, y, bodyWidth - 1, volumeTop + volumeHeight - y);
      if (!up) ctx.strokeRect(x, y, bodyWidth - 1, volumeTop + volumeHeight - y);
    });
    const avg = averageVolume(candles, last);
    if (avg !== null) {
      const y = Math.round(vy(avg)) + 0.5;
      ctx.save();
      ctx.setLineDash([4, 3]);
      ctx.strokeStyle = COLORS.text;
      ctx.beginPath();
      ctx.moveTo(layout.left, y);
      ctx.lineTo(right, y);
      ctx.stroke();
      ctx.restore();
    }
    ctx.fillStyle = COLORS.text;
    ctx.fillText('Volume', right + 6, volumeTop + 8);
    if (avg !== null) ctx.fillText('- - moy.', right + 6, volumeTop + 22);
  }

  // RSI.
  if (layers.rsi) {
    const [low, high] = options.rsiLevels ?? [CONFIG.cards.rsiOversold, CONFIG.cards.rsiOverbought];
    const ry = (v: number) => rsiTop + ((100 - v) / 100) * rsiHeight;
    ctx.strokeStyle = COLORS.grid;
    ctx.strokeRect(layout.left + 0.5, rsiTop + 0.5, right - layout.left, rsiHeight);
    ctx.save();
    ctx.setLineDash([4, 3]);
    ctx.strokeStyle = COLORS.text;
    for (const level of [low, high]) {
      const y = Math.round(ry(level)) + 0.5;
      ctx.beginPath();
      ctx.moveTo(layout.left, y);
      ctx.lineTo(right, y);
      ctx.stroke();
      ctx.fillStyle = COLORS.text;
      ctx.fillText(String(level), right + 6, y);
    }
    ctx.restore();
    drawSeries(rsiSeries(candles), COLORS.rsi, ry);
    ctx.fillStyle = COLORS.rsi;
    ctx.fillText('RSI 14', layout.left + 4, rsiTop + 9);
  }

  return layout;
}

/** Index de la bougie sous l'abscisse x (en pixels CSS), ou null. */
export function candleIndexAt(layout: ChartLayout, x: number): number | null {
  const index = Math.floor((x - layout.left) / layout.slotWidth);
  return index >= 0 && index < layout.slots ? index : null;
}
