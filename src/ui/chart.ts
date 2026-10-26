// Graphique en chandeliers, dessiné en Canvas 2D : bougies, volume, prix actuel,
// entrée et zone de P&L pendant un trade, support et résistance d'un range,
// et, après le trade, la bougie qui portait le signe entourée.
import type { Candle, RangeInfo } from '../engine/market.ts';
import type { Direction } from '../engine/rules.ts';

export const VISIBLE = 46;

export interface ChartView {
  /** Bougies affichées, dans l'ordre de l'historique du marché. */
  candles: readonly Candle[];
  /** Bougie en train de se former, dessinée après les autres. */
  forming: Candle | null;
  entry: { price: number; index: number } | null;
  direction: Direction | null;
  range: RangeInfo | null;
  /** Bougie du signe à entourer (index dans `candles`), et s'il était faux. */
  sign: { index: number; fake: boolean } | null;
  /** Loupe : bougie du signe entourée pendant le choix (index dans `candles`), quand le clignotement est allumé. */
  blink?: number | null;
  /** Terminal pro : 1re bougie du trade, dessinée en transparence après les autres. */
  peek?: Candle | null;
}

type Colors = Record<'up' | 'upHi' | 'down' | 'downHi' | 'grid' | 'line' | 'inkDim' | 'gold', string>;

function readColors(): Colors {
  const cs = getComputedStyle(document.documentElement);
  const v = (name: string): string => cs.getPropertyValue(`--${name}`).trim();
  return {
    up: v('up'), upHi: v('up-hi'), down: v('down'), downHi: v('down-hi'),
    grid: v('grid'), line: v('line'), inkDim: v('ink-dim'), gold: v('gold'),
  };
}

function niceStep(range: number, count: number): number {
  const raw = range / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const n = raw / mag;
  return (n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10) * mag;
}

export class Chart {
  private readonly ctx: CanvasRenderingContext2D;
  private colors: Colors;
  private view: ChartView | null = null;
  private readonly canvas: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D indisponible');
    this.ctx = ctx;
    this.colors = readColors();
    new ResizeObserver(() => this.resize()).observe(canvas.parentElement ?? canvas);
  }

  resize(): void {
    const r = this.canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.max(1, Math.round(r.width * dpr));
    this.canvas.height = Math.max(1, Math.round(r.height * dpr));
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.colors = readColors();
    if (this.view) this.draw(this.view);
  }

  draw(view: ChartView): void {
    this.view = view;
    const { ctx, colors: C } = this;
    const W = this.canvas.clientWidth;
    const H = this.canvas.clientHeight;
    if (!W || !H) return;
    ctx.clearRect(0, 0, W, H);
    const peek = view.forming ? null : view.peek ?? null;
    const all = view.forming ? [...view.candles, view.forming] : peek ? [...view.candles, peek] : view.candles;
    if (all.length === 0) return;
    const fs = Math.max(10, Math.min(18, W / 42));
    const axisW = fs * 4.2;
    const plotW = W - axisW - fs * 0.6;
    const volH = H * 0.16;
    const plotTop = fs * 0.6;
    const plotBot = H - volH - fs * 0.9;
    const startIdx = Math.max(0, all.length - VISIBLE);
    const vis = all.slice(startIdx);
    let lo = Infinity;
    let hi = -Infinity;
    let vmax = 0;
    for (const c of vis) {
      lo = Math.min(lo, c.l);
      hi = Math.max(hi, c.h);
      vmax = Math.max(vmax, c.v);
    }
    if (view.entry) {
      lo = Math.min(lo, view.entry.price);
      hi = Math.max(hi, view.entry.price);
    }
    if (view.range) {
      lo = Math.min(lo, view.range.bottom);
      hi = Math.max(hi, view.range.top);
    }
    const pad = (hi - lo) * 0.1 || 1;
    lo -= pad;
    hi += pad;
    const y = (p: number): number => plotTop + ((hi - p) / (hi - lo)) * (plotBot - plotTop);
    const slot = plotW / VISIBLE;
    const x = (i: number): number => (i + 0.5) * slot;
    const cw = Math.max(2, slot * 0.62);

    // Grille et axe des prix
    ctx.font = `${fs}px ${getComputedStyle(document.body).getPropertyValue('--font-num')}`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    const step = niceStep(hi - lo, 4);
    ctx.lineWidth = 1;
    for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) {
      const yy = Math.round(y(v)) + 0.5;
      ctx.strokeStyle = C.grid;
      ctx.beginPath();
      ctx.moveTo(0, yy);
      ctx.lineTo(plotW, yy);
      ctx.stroke();
      ctx.fillStyle = C.inkDim;
      ctx.fillText(v.toFixed(step < 1 ? 1 : 0), plotW + fs * 0.7, yy);
    }
    for (let i = 0; i < VISIBLE; i += 8) {
      const xx = Math.round(x(i)) + 0.5;
      ctx.strokeStyle = C.grid;
      ctx.beginPath();
      ctx.moveTo(xx, plotTop);
      ctx.lineTo(xx, plotBot);
      ctx.stroke();
    }
    ctx.strokeStyle = C.line;
    ctx.beginPath();
    ctx.moveTo(0, plotBot + 0.5 + fs * 0.4);
    ctx.lineTo(plotW, plotBot + 0.5 + fs * 0.4);
    ctx.stroke();

    const last = vis[vis.length - (peek ? 2 : 1)] as Candle;

    // Support et résistance du range
    if (view.range) {
      ctx.setLineDash([8, 6]);
      ctx.lineWidth = 1.5;
      const levels: [number, string, string][] = [
        [view.range.top, 'Résistance', C.downHi],
        [view.range.bottom, 'Support', C.upHi],
      ];
      for (const [v, label, col] of levels) {
        const yy = Math.round(y(v)) + 0.5;
        ctx.strokeStyle = col;
        ctx.globalAlpha = 0.75;
        ctx.beginPath();
        ctx.moveTo(0, yy);
        ctx.lineTo(plotW, yy);
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.fillStyle = col;
        ctx.fillText(label, fs * 0.4, yy + (v === view.range.top ? -fs * 0.7 : fs * 0.7));
      }
      ctx.setLineDash([]);
      ctx.lineWidth = 1;
    }

    // Bougie qui portait le signe, entourée après le trade
    if (view.sign && view.sign.index >= startIdx) {
      const c = all[view.sign.index];
      if (c) {
        const sx = x(view.sign.index - startIdx);
        const cy = (y(c.h) + y(c.l)) / 2;
        const ry = Math.max(fs * 1.1, (y(c.l) - y(c.h)) / 2 + fs * 0.5);
        ctx.strokeStyle = C.gold;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(sx, cy, fs * 1.1, ry, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.lineWidth = 1;
        ctx.fillStyle = C.gold;
        ctx.textAlign = 'center';
        ctx.fillText(view.sign.fake ? 'faux signe' : 'signe', sx, cy - ry - fs * 0.6);
        ctx.textAlign = 'left';
      }
    }

    // Loupe : la bougie du signe est entourée une fois sur deux pendant le choix
    if (view.blink != null && view.blink >= startIdx) {
      const c = all[view.blink];
      if (c) {
        const sx = x(view.blink - startIdx);
        const cy = (y(c.h) + y(c.l)) / 2;
        const ry = Math.max(fs * 1.1, (y(c.l) - y(c.h)) / 2 + fs * 0.5);
        ctx.strokeStyle = C.gold;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.ellipse(sx, cy, fs * 1.1, ry, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.lineWidth = 1;
      }
    }

    // Zone de P&L pendant le trade
    if (view.entry && view.direction && view.entry.index >= startIdx) {
      const ex = x(view.entry.index - startIdx);
      const ey = y(view.entry.price);
      const ly = y(last.c);
      const winning = (last.c - view.entry.price) * (view.direction === 'long' ? 1 : -1) >= 0;
      ctx.fillStyle = winning ? 'rgba(49,212,116,0.12)' : 'rgba(242,84,79,0.12)';
      ctx.fillRect(ex, Math.min(ey, ly), x(vis.length - 1) - ex + cw / 2, Math.abs(ly - ey));
      ctx.setLineDash([6, 5]);
      ctx.strokeStyle = C.gold;
      ctx.beginPath();
      ctx.moveTo(ex, Math.round(ey) + 0.5);
      ctx.lineTo(plotW, Math.round(ey) + 0.5);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = C.gold;
      const label = `Entrée ${view.direction === 'long' ? 'LONG' : 'SHORT'} ${view.entry.price.toFixed(2)}`;
      ctx.fillText(label, fs * 0.4, ey + (ly > ey ? -fs * 0.8 : fs * 0.8));
      const ec = all[view.entry.index];
      if (ec) {
        const isLong = view.direction === 'long';
        const ay = isLong ? y(ec.l) + fs * 0.9 : y(ec.h) - fs * 0.9;
        ctx.fillStyle = isLong ? C.upHi : C.downHi;
        ctx.beginPath();
        if (isLong) {
          ctx.moveTo(ex, ay - fs * 0.45);
          ctx.lineTo(ex - fs * 0.4, ay + fs * 0.25);
          ctx.lineTo(ex + fs * 0.4, ay + fs * 0.25);
        } else {
          ctx.moveTo(ex, ay + fs * 0.45);
          ctx.lineTo(ex - fs * 0.4, ay - fs * 0.25);
          ctx.lineTo(ex + fs * 0.4, ay - fs * 0.25);
        }
        ctx.fill();
      }
    }

    // Bougies et volume
    vis.forEach((c, i) => {
      const ghost = peek !== null && i === vis.length - 1;
      ctx.globalAlpha = ghost ? 0.45 : 1;
      const up = c.c >= c.o;
      const col = up ? C.up : C.down;
      const xx = x(i);
      ctx.strokeStyle = col;
      ctx.fillStyle = col;
      ctx.lineWidth = Math.max(1, cw / 6);
      ctx.beginPath();
      ctx.moveTo(Math.round(xx) + 0.5, y(c.h));
      ctx.lineTo(Math.round(xx) + 0.5, y(c.l));
      ctx.stroke();
      const top = y(Math.max(c.o, c.c));
      const bot = y(Math.min(c.o, c.c));
      ctx.fillRect(Math.round(xx - cw / 2), Math.round(top), Math.round(cw), Math.max(1.5, Math.round(bot - top)));
      const vh = vmax > 0 ? (c.v / vmax) * (volH - fs * 0.4) : 0;
      ctx.globalAlpha = ghost ? 0.3 : 0.7;
      ctx.fillRect(Math.round(xx - cw / 2), H - vh, Math.round(cw), vh);
      ctx.globalAlpha = 1;
      if (ghost) {
        ctx.fillStyle = C.gold;
        ctx.textAlign = 'center';
        ctx.fillText('1re bougie', xx, y(c.h) - fs * 0.8);
        ctx.textAlign = 'left';
      }
    });

    // Ligne du prix actuel et étiquette, avec ▲▼ pour ne pas dépendre de la couleur
    const ly = Math.round(y(last.c)) + 0.5;
    const upNow = last.c >= last.o;
    ctx.setLineDash([3, 4]);
    ctx.strokeStyle = upNow ? C.up : C.down;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, ly);
    ctx.lineTo(plotW, ly);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = upNow ? C.up : C.down;
    const lh = fs * 1.4;
    ctx.fillRect(plotW + fs * 0.25, ly - lh / 2, axisW, lh);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`${last.c.toFixed(2)}${upNow ? '▲' : '▼'}`, plotW + fs * 0.5, ly + 1);
  }
}
