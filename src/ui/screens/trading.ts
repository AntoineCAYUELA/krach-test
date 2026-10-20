// Écran de trading (GDD 9, écrans 4 et 5) : graphique, main, ticket d'ordre avec aperçu en direct,
// puis animation des bougies de la position et décomposition ligne par ligne du score.
// Le moteur résout la position d'un coup ; l'écran dévoile ensuite les bougies une par une.

import { CONFIG } from '../../config.ts';
import { EVENTS } from '../../data/events.ts';
import type { CardCheck } from '../../engine/cards.ts';
import { snapshot } from '../../engine/indicators.ts';
import {
  allowedDurations,
  allowedLeverages,
  discardCards,
  evaluateHand,
  GameError,
  hasTool,
  openPosition,
  passCandle,
  previewPosition,
  REGIME_NAMES,
  upcomingNews,
  type PositionInput,
  type RunState,
  type TradeRecord,
} from '../../engine/run.ts';
import { SETUP_NAMES } from '../../engine/scoring.ts';
import { directionSign, type Candle, type Direction } from '../../engine/types.ts';
import { fmt, money, pct, signed } from '../../format.ts';
import type { App, View } from '../app.ts';
import { candleIndexAt, COLORS, drawChart, type CandleMarker, type ChartLayout, type PriceLine } from '../chart.ts';
import { attempt, cardView, consumableSlots, DIRECTION_LABELS, errorMessage, progressBar, stat, stressGauge, toolSlots } from '../components.ts';
import { h, toast, type Child } from '../dom.ts';
import { scanTerms, term } from '../tooltip.ts';

/** Réglages du ticket d'ordre, conservés d'un tour à l'autre. */
interface Ticket {
  /** Run et séance auxquelles se rapporte la sélection de cartes. */
  key: string;
  direction: Direction | null;
  /** Index des cartes sélectionnées dans la main (à jouer ou à défausser). */
  selected: number[];
  /** Mise en dixièmes du capital (1 = 10 %, 10 = 100 %). */
  stakeTenths: number;
  leverage: number;
  duration: number;
  stopOn: boolean;
  /** Distance du stop-loss en % du prix d'entrée. */
  stopPct: number;
  takeOn: boolean;
  takePct: number;
}

/** Position résolue par le moteur, en cours d'affichage. */
interface PendingTrade {
  record: TradeRecord;
  /** Bougies de la position déjà dévoilées. */
  shown: number;
  playedChecks: CardCheck[];
  performanceBefore: number;
  primesBefore: number;
  stressBefore: number | null;
  timer: number | null;
}

let ticket: Ticket | null = null;
let pending: PendingTrade | null = null;
let hoverIndex: number | null = null;

export function hasPendingTrade(): boolean {
  return pending !== null;
}

/** Nouvelle run : on oublie le ticket et la position affichée. */
export function resetTrading(): void {
  if (pending?.timer) clearTimeout(pending.timer);
  pending = null;
  ticket = null;
  hoverIndex = null;
}

function ticketFor(run: RunState): Ticket {
  const key = `${run.seed}/${run.seanceIndex}`;
  if (!ticket) {
    ticket = { key, direction: null, selected: [], stakeTenths: 5, leverage: 1, duration: CONFIG.seance.tradeDuration, stopOn: false, stopPct: 3, takeOn: false, takePct: 4 };
  }
  if (ticket.key !== key) {
    ticket.key = key;
    ticket.selected = [];
    ticket.direction = null;
  }
  const handSize = run.seance?.hand.length ?? 0;
  ticket.selected = ticket.selected.filter((i) => i < handSize);
  if (!allowedLeverages(run).includes(ticket.leverage)) ticket.leverage = 1;
  if (!allowedDurations(run).includes(ticket.duration)) ticket.duration = CONFIG.seance.tradeDuration;
  return ticket;
}

function positionInput(run: RunState, t: Ticket): PositionInput | null {
  if (!t.direction) return null;
  return {
    direction: t.direction,
    stake: t.stakeTenths >= 10 ? run.capital : (run.capital * t.stakeTenths) / 10,
    leverage: t.leverage,
    stopLossPct: t.stopOn ? t.stopPct / 100 : null,
    takeProfitPct: t.takeOn ? t.takePct / 100 : null,
    duration: t.duration,
    cardIndices: [...t.selected],
  };
}

// ---------------------------------------------------------------------------

export function renderTrading(app: App, run: RunState): View {
  const seance = run.seance;
  if (!seance) throw new GameError('Aucune séance');
  const t = ticketFor(run);
  const p = pending;
  const duration = p?.record.trade.order.duration ?? 0;
  const done = p !== null && p.shown >= duration;

  const candles = p ? seance.market.candles.slice(0, p.record.entryCandleIndex + 1 + p.shown) : seance.market.candles;
  const snap = snapshot(candles);

  // --- Graphique
  const canvas = h('canvas', { class: 'chart-canvas', 'aria-label': `Graphique en chandeliers de ${seance.stock.name}` });
  const hoverInfo = h('div', { class: 'chart-hover' });
  let layout: ChartLayout | null = null;
  let previewLines: PriceLine[] = [];

  const draw = () => {
    const lines: PriceLine[] = p ? tradeLines(p.record) : previewLines;
    const markers: CandleMarker[] = [];
    if (p) {
      const r = p.record;
      markers.push({ index: r.entryCandleIndex, price: r.trade.entryPrice, label: `Entrée ${DIRECTION_LABELS[r.direction]}`, color: COLORS.entry });
      if (p.shown > r.trade.exitOffset) {
        markers.push({ index: r.entryCandleIndex + 1 + r.trade.exitOffset, price: r.trade.exitPrice, label: 'Sortie', color: r.pnlNet >= 0 ? COLORS.up : COLORS.down });
      }
    }
    layout = drawChart(canvas, {
      candles,
      slots: CONFIG.seance.historyCandles + CONFIG.seance.candles,
      layers: app.settings.chart,
      separatorIndex: CONFIG.seance.historyCandles,
      rsiLevels: hasTool(run, 'rsiOscillator') ? [CONFIG.tools.rsiOscillator.oversold, CONFIG.tools.rsiOscillator.overbought] : undefined,
      lines,
      markers,
      highlight: p ? { from: p.record.entryCandleIndex + 1, to: p.record.entryCandleIndex + duration } : undefined,
      hoverIndex,
    });
  };

  canvas.addEventListener('mousemove', (e) => {
    if (!layout) return;
    const index = candleIndexAt(layout, e.offsetX);
    const next = index !== null && index < candles.length ? index : null;
    if (next === hoverIndex) return;
    hoverIndex = next;
    hoverInfo.textContent = next === null ? '' : describeCandle(candles, next);
    draw();
  });
  canvas.addEventListener('mouseleave', () => {
    hoverIndex = null;
    hoverInfo.textContent = '';
    draw();
  });

  const toggles = chartToggles(app, snap, (candles[candles.length - 1] as Candle).v, draw);
  const chartPanel = h(
    'section',
    { class: 'chart-panel' },
    h(
      'div',
      { class: 'chart-toolbar' },
      h('div', { class: 'stock' }, h('strong', null, seance.stock.ticker), ` ${seance.stock.name} · ${seance.stock.profile} · `, term('volatilite', 'σ'), ` ${pct(seance.stock.sigma)}`),
      toggles,
    ),
    h('div', { class: 'chart-wrap' }, canvas, hoverInfo),
    banners(run, candles, p),
  );

  // --- Main et ticket
  const handPanel = p ? playedCardsPanel(p) : handPanelView(app, run, t);
  const side = p ? tradePanel(app, run, p, done) : ticketPanel(app, run, t, (lines) => {
    previewLines = lines;
    draw();
  });
  if (!p) previewLines = ticketLines(run, t);

  const stress = run.life ? (p && !done ? p.stressBefore : run.life.stress) : null;
  const values = p && !done
    ? { capital: p.record.capitalBefore, performance: p.performanceBefore, primes: p.primesBefore, candlesLeft: seance.candlesLeft + duration - p.shown, stress }
    : { capital: run.capital, performance: seance.performance, primes: run.primes, candlesLeft: seance.candlesLeft, stress };

  const hudEl = hud(app, run, values);
  const items = h(
    'div',
    { class: 'items-bar' },
    h('div', { class: 'item-group' }, h('span', { class: 'items-label' }, 'Outils'), toolSlots(run)),
    h('div', { class: 'item-group' }, h('span', { class: 'items-label' }, 'Consommables'), p ? h('div', { class: 'slots muted' }, '…') : consumableSlots(app, run)),
  );
  const element = h('div', { class: 'screen trading' }, hudEl, items, chartPanel, handPanel, side);

  let observer: ResizeObserver | null = null;
  return {
    element,
    // Double écran : graphique et main à gauche, ticket d'ordre à droite (GDD 13.5).
    panes: () => [h('div', { class: 'screen trading trading-main' }, hudEl, items, chartPanel, handPanel), h('div', { class: 'screen trading trading-orders' }, side)],
    mount() {
      draw();
      observer = new ResizeObserver(() => draw());
      observer.observe(canvas);
    },
    unmount() {
      observer?.disconnect();
    },
  };
}

// ---------------------------------------------------------------------------
// Barre d'état

interface HudValues {
  capital: number;
  performance: number;
  primes: number;
  candlesLeft: number;
  /** null si la vie du trader est désactivée. */
  stress: number | null;
}

function hud(app: App, run: RunState, v: HudValues): HTMLElement {
  const seance = run.seance!;
  return h(
    'header',
    { class: 'hud' },
    h(
      'div',
      { class: 'hud-seance' },
      h('span', { class: 'brand' }, 'Krach Test'),
      h(
        'span',
        null,
        term('seance', 'Séance'),
        ` ${seance.index + 1} / ${CONFIG.run.seanceCount} `,
        h('span', { class: 'seed', title: 'Graine de la run : rejoue exactement les mêmes marchés' }, `· graine ${run.seed}`),
      ),
    ),
    stat('Capital', money(v.capital)),
    h(
      'div',
      { class: 'stat stat-performance' },
      h('span', { class: 'stat-label' }, 'Performance / quota'),
      h('span', { class: 'stat-value' }, `${fmt(v.performance)} / ${fmt(seance.quota, 0)}`),
      progressBar(v.performance, seance.quota),
    ),
    stat('Ordres', String(seance.orders)),
    stat('Défausses', String(seance.discards)),
    stat(term('chandelier-japonais', 'Bougies'), String(v.candlesLeft)),
    stat('Primes', `${v.primes} P`),
    v.stress !== null ? stressGauge(v.stress, true) : null,
    h(
      'div',
      { class: 'hud-actions' },
      h('button', { class: 'ghost', onClick: () => app.toggleGlossary() }, 'Glossaire (G)'),
      h('button', { class: 'ghost', onClick: () => app.openOptions() }, 'Options'),
      h('button', { class: 'ghost', onClick: () => app.quitToTitle() }, 'Menu'),
    ),
  );
}

// ---------------------------------------------------------------------------
// Graphique : interrupteurs, valeurs des indicateurs, bandeaux

function chartToggles(app: App, snap: ReturnType<typeof snapshot>, volume: number, redraw: () => void): HTMLElement {
  const layers = app.settings.chart;
  const ratio = snap.averageVolume ? `×${fmt(volume / snap.averageVolume, 1)} moy.` : '–';
  const toggle = (key: keyof typeof layers, label: Child, value: string, color: string) =>
    h(
      'label',
      { class: 'toggle' },
      h('input', {
        type: 'checkbox',
        checked: layers[key],
        onChange: (e: Event) => {
          const checked = (e.target as HTMLInputElement).checked;
          app.updateSettings((s) => {
            s.chart[key] = checked;
          });
          redraw();
        },
      }),
      h('span', { class: 'swatch', style: `background: ${color}` }),
      label,
      h('span', { class: 'toggle-value' }, value),
    );
  const level = (v: number | null) => (v === null ? '–' : fmt(v));
  return h(
    'div',
    { class: 'toggles' },
    toggle('sma5', term('moyenne-mobile', 'MM5'), level(snap.sma5), COLORS.sma5),
    toggle('sma20', 'MM20', level(snap.sma20), COLORS.sma20),
    toggle('levels', [term('support'), ' / ', term('resistance')], `${level(snap.support)} / ${level(snap.resistance)}`, COLORS.support),
    toggle('volume', term('volume'), ratio, COLORS.text),
    toggle('rsi', term('rsi'), snap.rsi === null ? '–' : fmt(snap.rsi, 1), COLORS.rsi),
    h('span', { class: 'slope' }, term('tendance', 'Pente MM20'), ' ', snap.trendSlope === null ? '–' : signed(snap.trendSlope)),
  );
}

function describeCandle(candles: readonly Candle[], index: number): string {
  const c = candles[index] as Candle;
  const history = CONFIG.seance.historyCandles;
  const where = index < history ? `Historique ${index + 1}/${history}` : `Séance, bougie ${index - history + 1}`;
  const news = c.news ? ` · News : ${c.news.headline} (gap ${signed(c.news.gap * 100, 1)} %)` : '';
  return `${where} · O ${fmt(c.o)} · H ${fmt(c.h)} · L ${fmt(c.l)} · C ${fmt(c.c)} · Volume ${fmt(c.v, 0)}${news}`;
}

function banners(run: RunState, candles: readonly Candle[], p: PendingTrade | null): HTMLElement {
  const seance = run.seance!;
  const items: HTMLElement[] = [];
  const last = candles[candles.length - 1] as Candle;
  if (last.news) {
    items.push(
      h(
        'div',
        { class: `banner news ${last.news.sentiment}` },
        h('strong', null, term('news', 'News')),
        ` ${last.news.headline} `,
        h('span', { class: 'muted' }, ['(', term('gap', 'gap'), ` à l'ouverture : ${signed(last.news.gap * 100, 1)} %)`]),
      ),
    );
  }
  if (!p) {
    for (const news of upcomingNews(run)) {
      items.push(
        h('div', { class: 'banner calendar' }, h('strong', null, 'Calendrier'), ` Dans ${news.inCandles} bougie${news.inCandles > 1 ? 's' : ''} : « ${news.headline} » (`, term('sentiment', 'sentiment'), ` ${news.sentiment === 'positive' ? 'positif' : 'négatif'})`),
      );
    }
    const count = seance.market.candles.length;
    if (seance.crystalBall && seance.crystalBall.candleCount === count) {
      items.push(h('div', { class: 'banner crystal' }, h('strong', null, 'Boule de cristal'), ` La prochaine bougie sera ${seance.crystalBall.bullish ? 'verte' : 'rouge'}.`));
    }
    if (seance.revealedRegime && seance.revealedRegime.candleCount === count) {
      items.push(h('div', { class: 'banner report' }, h('strong', null, 'Rapport d’analyste'), ' ', term('regime-de-marche', 'Régime'), ` actuel : ${REGIME_NAMES[seance.revealedRegime.regime]}.`));
    }
    if (seance.hedgeActive) items.push(h('div', { class: 'banner hedge' }, h('strong', null, term('couverture', 'Couverture')), ' active : le P&L net du prochain trade sera divisé par 2.'));
  }
  if (seance.event) {
    const event = EVENTS[seance.event];
    items.push(h('div', { class: 'banner event' }, h('strong', null, event.name), ` ${event.effect}`));
  }
  return h('div', { class: 'banners' }, items);
}

// ---------------------------------------------------------------------------
// Main de cartes

function handPanelView(app: App, run: RunState, t: Ticket): HTMLElement {
  const seance = run.seance!;
  const checks = t.direction ? evaluateHand(run, t.direction) : null;
  const toggle = (i: number) => {
    const at = t.selected.indexOf(i);
    if (at >= 0) t.selected.splice(at, 1);
    else t.selected.push(i);
    app.render();
  };
  return h(
    'section',
    { class: 'hand-panel' },
    h(
      'div',
      { class: 'panel-title' },
      h('span', null, `Main (${seance.hand.length} cartes Signal)`),
      h('span', { class: 'muted' }, `Pioche ${seance.drawPile.length} · défausse ${seance.discardPile.length} · clique une carte pour la sélectionner`),
    ),
    h(
      'div',
      { class: 'hand' },
      seance.hand.map((id, i) => cardView(id, { check: checks ? (checks[i] ?? null) : null, selected: t.selected.includes(i), onClick: () => toggle(i) })),
    ),
  );
}

function playedCardsPanel(p: PendingTrade): HTMLElement {
  const r = p.record;
  return h(
    'section',
    { class: 'hand-panel' },
    h('div', { class: 'panel-title' }, h('span', null, r.playedCards.length > 0 ? 'Cartes jouées' : 'Aucune carte jouée'), h('span', { class: 'muted' }, `Setup : ${SETUP_NAMES[r.setup.type]}`)),
    h('div', { class: 'hand' }, r.playedCards.map((id, i) => cardView(id, { check: p.playedChecks[i] ?? null }))),
  );
}

// ---------------------------------------------------------------------------
// Ticket d'ordre

function ticketLines(run: RunState, t: Ticket): PriceLine[] {
  const input = positionInput(run, t);
  if (!input) return [];
  const preview = previewPosition(run, input).preview;
  return priceLines(preview.entryPrice, preview.stopPrice, preview.takePrice, preview.liquidationPrice, true);
}

function tradeLines(r: TradeRecord): PriceLine[] {
  return priceLines(r.trade.entryPrice, r.trade.stopPrice, r.trade.takePrice, r.trade.liquidationPrice, false);
}

function priceLines(entry: number, stop: number | null, take: number | null, liquidation: number, dashed: boolean): PriceLine[] {
  const lines: PriceLine[] = [{ price: entry, label: 'Entrée', color: COLORS.entry, dashed }];
  if (stop !== null) lines.push({ price: stop, label: 'Stop-loss', color: COLORS.down, dashed: true });
  if (take !== null) lines.push({ price: take, label: 'Take-profit', color: COLORS.up, dashed: true });
  lines.push({ price: liquidation, label: 'Liquidation', color: COLORS.liquidation, dashed: true });
  return lines;
}

function ticketPanel(app: App, run: RunState, t: Ticket, onPreviewLines: (lines: PriceLine[]) => void): HTMLElement {
  const seance = run.seance!;
  const previewHost = h('div', { class: 'preview-host' });
  const openHost = h('div', { class: 'open-host' });
  const showPreview = () => {
    const { table, open } = previewBlock(app, run, t);
    previewHost.replaceChildren(table);
    openHost.replaceChildren(open);
  };

  const refresh = () => {
    showPreview();
    scanTerms(previewHost);
    scanTerms(openHost);
    onPreviewLines(ticketLines(run, t));
  };

  const directionButtons = h(
    'div',
    { class: 'segmented' },
    (['long', 'short'] as const).map((d) =>
      h(
        'button',
        {
          class: `${d}${t.direction === d ? ' active' : ''}`,
          onClick: () => {
            t.direction = d;
            app.render();
          },
        },
        DIRECTION_LABELS[d],
      ),
    ),
  );

  const stakeLabel = h('span', { class: 'field-value' });
  const updateStakeLabel = () => {
    const input = positionInput(run, t);
    stakeLabel.textContent = `${t.stakeTenths * 10} % · ${money(input?.stake ?? (run.capital * t.stakeTenths) / 10)}`;
  };
  updateStakeLabel();
  const stake = h('input', {
    type: 'range',
    min: 1,
    max: 10,
    step: 1,
    value: String(t.stakeTenths),
    'aria-label': 'Mise en % du capital',
    onInput: (e: Event) => {
      t.stakeTenths = Number((e.target as HTMLInputElement).value);
      updateStakeLabel();
      refresh();
    },
  });

  const leverageButtons = h(
    'div',
    { class: 'segmented' },
    allowedLeverages(run).map((lev) =>
      h('button', { class: t.leverage === lev ? 'active' : '', onClick: () => { t.leverage = lev; app.render(); } }, `×${lev}`),
    ),
  );

  const durations = allowedDurations(run);
  const durationRow =
    durations.length > 1
      ? field(
          'Durée',
          h(
            'div',
            { class: 'segmented' },
            durations.map((d) =>
              h('button', { class: t.duration === d ? 'active' : '', onClick: () => { t.duration = d; app.render(); } }, d === CONFIG.seance.scalpDuration ? [`${d} bougie (`, term('scalping'), ')'] : `${d} bougies`),
            ),
          ),
        )
      : null;

  const protection = (kind: 'stop' | 'take') => {
    const on = kind === 'stop' ? t.stopOn : t.takeOn;
    const value = kind === 'stop' ? t.stopPct : t.takePct;
    const number = h('input', {
      type: 'number',
      min: 0.5,
      max: kind === 'stop' ? 50 : 100,
      step: 0.5,
      value: String(value),
      disabled: !on,
      'aria-label': kind === 'stop' ? 'Distance du stop-loss en %' : 'Distance du take-profit en %',
      onInput: (e: Event) => {
        const v = Number((e.target as HTMLInputElement).value);
        if (!(v > 0)) return;
        if (kind === 'stop') t.stopPct = v;
        else t.takePct = v;
        refresh();
      },
    });
    const box = h('input', {
      type: 'checkbox',
      checked: on,
      onChange: (e: Event) => {
        const checked = (e.target as HTMLInputElement).checked;
        if (kind === 'stop') t.stopOn = checked;
        else t.takeOn = checked;
        number.disabled = !checked;
        refresh();
      },
    });
    const toolNote =
      kind === 'stop' && hasTool(run, 'stopLoss')
        ? h('span', { class: 'muted small' }, `Outil : −${pct(CONFIG.tools.stopLoss.stopPct, 0)} auto`)
        : kind === 'take' && hasTool(run, 'takeProfit')
          ? h('span', { class: 'muted small' }, `Outil : +${pct(CONFIG.tools.takeProfit.takePct, 0)} auto`)
          : null;
    return h('div', { class: 'protection' }, h('label', { class: 'inline' }, box, kind === 'stop' ? term('stop-loss', 'Stop-loss') : term('take-profit', 'Take-profit')), number, h('span', null, '%'), toolNote);
  };

  const discardDisabled = t.selected.length === 0 || seance.discards <= 0 || t.selected.length > CONFIG.seance.handSize;
  const element = h(
    'aside',
    { class: 'ticket' },
    h('h2', null, 'Ticket d’ordre'),
    field('Direction', directionButtons, h('span', { class: 'muted small' }, [term('long', 'Long'), ' gagne à la hausse, ', term('short'), ' à la baisse'])),
    field(term('mise'), stake, stakeLabel),
    field(term('levier'), leverageButtons),
    durationRow,
    protection('stop'),
    protection('take'),
    previewHost,
    h(
      'div',
      { class: 'ticket-footer' },
      openHost,
      h(
        'div',
        { class: 'ticket-actions' },
        h(
          'button',
          {
            disabled: discardDisabled,
            title: 'Défausse les cartes sélectionnées et en repioche autant (1 défausse)',
            onClick: () => {
              if (attempt(() => discardCards(run, t.selected))) t.selected = [];
              app.commit();
            },
          },
          `Défausser (${t.selected.length})`,
        ),
        h(
          'button',
          {
            title: 'Le marché avance d’une bougie sans position (1 bougie)',
            onClick: () => {
              hoverIndex = null;
              attempt(() => passCandle(run));
              app.commit();
            },
          },
          'Passer 1 bougie',
        ),
      ),
    ),
  );
  showPreview();
  return element;
}

function field(label: Child, control: Child, extra?: Child): HTMLElement {
  return h('div', { class: 'field' }, h('span', { class: 'field-label' }, label), h('div', { class: 'field-control' }, control, extra));
}

/** Aperçu en direct (GDD 2.3 étape 4) et bouton d'ouverture, toujours visible en bas du ticket. */
function previewBlock(app: App, run: RunState, t: Ticket): { table: HTMLElement; open: HTMLElement } {
  const input = positionInput(run, t);
  if (!input) {
    return {
      table: h('div', { class: 'preview' }, h('p', { class: 'muted' }, 'Choisis long ou short : chaque carte affiche alors ✔ ou ✘ avec la raison.')),
      open: h('button', { class: 'primary open', disabled: true }, 'Ouvrir la position'),
    };
  }
  const view = previewPosition(run, input);
  const pv = view.preview;
  const rows: [Child, Child][] = [
    [['Prix d’entrée (', term('spread'), ' inclus)'], money(pv.entryPrice)],
    [term('notionnel', 'Notionnel'), `${money(input.stake)} × ${input.leverage} = ${money(pv.notional)}`],
    [[term('frais', 'Frais'), ' estimés (aller-retour)'], money(pv.fees)],
    [
      'Stop-loss',
      pv.stopPrice === null
        ? 'aucun'
        : `${money(pv.stopPrice)} (${signed(-(view.stop.pct ?? 0) * 100, 1)} %)${view.stop.fromTool ? ' · Outil' : ''}`,
    ],
    [
      'Take-profit',
      pv.takePrice === null
        ? 'aucun'
        : `${money(pv.takePrice)} (${signed((view.take.pct ?? 0) * 100, 1)} %)${view.take.fromTool ? ' · Outil' : ''}`,
    ],
    ['Perte maximale', pv.lossAtStop === null ? `sans stop-loss : jusqu’à la mise entière (${money(input.stake)})` : `${money(pv.lossAtStop)} si le stop-loss est touché`],
    [term('liquidation', 'Prix de liquidation'), `${money(pv.liquidationPrice)} (${signed((pv.liquidationPrice / pv.entryPrice - 1) * 100, 1)} %)`],
  ];
  const multiText = `${SETUP_NAMES[view.setup.type]} ×${fmt(view.setup.baseMulti, 1)}${view.multi.terms.length > 0 ? ` → Multi ×${fmt(view.multi.total, 2)}` : ''}`;
  rows.push(['Setup', multiText]);
  if (hasTool(run, 'twoPercentRule')) rows.push(['Règle des 2 %', view.twoPercentOk ? '✔ risque ≤ 2 % du capital' : '✘ risque trop élevé ou pas de stop-loss']);

  const error = view.error;
  return {
    table: h('div', { class: 'preview' }, h('table', null, rows.map(([label, value]) => h('tr', null, h('th', null, label), h('td', null, value))))),
    open: h(
      'div',
      null,
      error ? h('p', { class: 'error' }, error) : null,
      h(
        'button',
        {
          class: 'primary open',
          disabled: error !== null,
          onClick: () => openTrade(app, run, t, input),
        },
        `Ouvrir la position ${DIRECTION_LABELS[input.direction].toLowerCase()} (${input.cardIndices.length} carte${input.cardIndices.length > 1 ? 's' : ''})`,
      ),
    ),
  };
}

function openTrade(app: App, run: RunState, t: Ticket, input: PositionInput): void {
  const seance = run.seance!;
  const checks = evaluateHand(run, input.direction);
  const playedChecks = input.cardIndices.map((i) => checks[i]).filter((c): c is CardCheck => c !== undefined);
  const performanceBefore = seance.performance;
  const primesBefore = run.primes;
  const stressBefore = run.life?.stress ?? null;
  let record: TradeRecord;
  try {
    record = openPosition(run, input);
  } catch (error) {
    toast(errorMessage(error), 'error');
    return;
  }
  t.selected = [];
  hoverIndex = null;
  pending = { record, shown: 0, playedChecks, performanceBefore, primesBefore, stressBefore, timer: null };
  app.commit();
  scheduleNextCandle(app);
}

function scheduleNextCandle(app: App): void {
  const p = pending;
  if (!p) return;
  const delay = app.settings.fastAnimation ? CONFIG.animation.fastCandleMs : CONFIG.animation.candleMs;
  p.timer = window.setTimeout(() => {
    if (pending !== p) return;
    p.shown++;
    p.timer = null;
    if (p.shown < p.record.trade.order.duration) scheduleNextCandle(app);
    app.render();
  }, delay);
}

function skipAnimation(app: App): void {
  const p = pending;
  if (!p) return;
  if (p.timer) clearTimeout(p.timer);
  p.timer = null;
  p.shown = p.record.trade.order.duration;
  app.render();
}

// ---------------------------------------------------------------------------
// Résolution du trade (GDD 9, écran 5)

function exitDescription(r: TradeRecord): Child {
  const tr = r.trade;
  switch (tr.exitReason) {
    case 'time':
      return `Clôture à la fin des ${tr.order.duration} bougies`;
    case 'stopLoss':
      return tr.gapped
        ? [term('stop-loss', 'Stop-loss'), ' sauté par un ', term('gap'), ` : sortie à l’ouverture, ${money(tr.exitPrice)} au lieu de ${money(tr.stopPrice ?? tr.exitPrice)} (`, term('slippage'), ')']
        : [term('stop-loss', 'Stop-loss'), ` touché à ${money(tr.exitPrice)}`];
    case 'takeProfit':
      return [term('take-profit', 'Take-profit'), ` touché à ${money(tr.exitPrice)}`];
    case 'liquidation':
      return [term('liquidation', 'Liquidation'), ` : la perte a atteint ${pct(CONFIG.trade.liquidationThreshold, 0)} de la mise, toute la mise est perdue`];
  }
}

function tradePanel(app: App, run: RunState, p: PendingTrade, done: boolean): HTMLElement {
  const r = p.record;
  const tr = r.trade;
  const d = directionSign(r.direction);
  const closed = p.shown > tr.exitOffset;
  const lastShown = tr.candles[Math.max(0, Math.min(p.shown, tr.exitOffset + 1) - 1)];
  const latent = p.shown === 0 || !lastShown ? 0 : tr.notional * d * (lastShown.c / tr.entryPrice - 1);

  const header = h(
    'div',
    { class: 'trade-header' },
    h('h2', null, `Position ${DIRECTION_LABELS[r.direction].toLowerCase()} ×${tr.order.leverage}`),
    h('p', { class: 'muted' }, `Mise ${money(tr.order.stake)} · notionnel ${money(tr.notional)} · entrée ${money(tr.entryPrice)}`),
    h('div', { class: 'candle-steps' }, tr.candles.map((c, k) => h('span', { class: `step${k < p.shown ? (c.c >= c.o ? ' up' : ' down') : ''}${k === tr.exitOffset && closed ? ' exit' : ''}` }, String(k + 1)))),
  );

  if (!done) {
    return h(
      'aside',
      { class: 'ticket trade' },
      header,
      closed
        ? h('p', { class: 'exit-line' }, 'Position fermée : ', exitDescription(r))
        : h('p', null, 'P&L latent (hors frais) : ', h('strong', { class: latent >= 0 ? 'gain' : 'loss' }, `${signed(latent)} $`)),
      closed && p.shown < tr.order.duration ? h('p', { class: 'muted small' }, 'Les bougies restantes s’affichent quand même : le temps est consommé.') : null,
      h('button', { class: 'ghost', onClick: () => skipAnimation(app) }, 'Passer l’animation'),
    );
  }

  const seance = run.seance!;
  const rows: [Child, string, string?][] = [];
  if (tr.exitReason === 'liquidation') {
    rows.push([[term('pnl', 'P&L'), ' net (mise perdue)'], `${signed(tr.pnlNet)} $`, 'loss']);
  } else {
    rows.push([[term('pnl', 'P&L'), ' brut (', term('spread'), ' inclus)'], `${signed(tr.pnlGross)} $`]);
    rows.push([term('frais', 'Frais'), `${signed(-tr.fees)} $`]);
    rows.push(['P&L net', `${signed(tr.pnlNet)} $`, tr.pnlNet >= 0 ? 'gain' : 'loss']);
  }
  if (r.hedged) rows.push([[term('couverture', 'Couverture'), ' ×0,5'], `${signed(r.pnlNet)} $`]);
  rows.push([`Points d’analyse (${r.setup.validCards.length} carte${r.setup.validCards.length > 1 ? 's' : ''} valide${r.setup.validCards.length > 1 ? 's' : ''} × ${CONFIG.scoring.analysisPointsPerCard})`, `+${fmt(r.score.analysisPoints, 0)}`]);
  rows.push(['Résultat', signed(r.score.result), 'total']);
  if (r.score.result >= 0) {
    rows.push([`Multi de setup : ${SETUP_NAMES[r.setup.type]}`, `×${fmt(r.multi.base, 1)}`]);
    for (const m of r.multi.terms) rows.push([m.label, m.kind === 'add' ? `+${fmt(m.value, 1)}` : `×${fmt(m.value, 1)}`]);
    rows.push(['Multi total', `×${fmt(r.multi.total, 2)}`, 'total']);
    rows.push(['Performance du trade (Résultat × Multi)', signed(r.score.performance), 'total gain']);
  } else {
    rows.push([`Résultat négatif × ${fmt(CONFIG.scoring.lossFactor, 1)} (le Multi ne s’applique pas aux pertes)`, signed(r.score.performance), 'total loss']);
  }

  const perfBefore = p.performanceBefore;
  const continueLabel =
    run.phase === 'summary' ? 'Quota atteint : voir le bilan' : run.phase === 'defeat' ? (run.defeatCause === 'liquidation' ? 'Margin call : voir le détail' : 'Fin de séance : voir le résultat') : 'Continuer';
  return h(
    'aside',
    { class: 'ticket trade' },
    header,
    h('p', { class: 'exit-line' }, exitDescription(r)),
    h('table', { class: 'breakdown' }, rows.map(([label, value, cls]) => h('tr', { class: cls ?? '' }, h('th', null, label), h('td', null, value)))),
    h(
      'div',
      { class: 'after' },
      h('p', null, `Performance de séance : ${fmt(perfBefore)} → `, h('strong', null, fmt(r.performanceAfter)), ` / ${fmt(seance.quota, 0)}`),
      r.performanceAfter === 0 && r.score.performance < 0 && perfBefore + r.score.performance < 0 ? h('p', { class: 'muted small' }, 'La Performance de séance ne descend jamais sous 0.') : null,
      h('p', null, `Capital : ${money(r.capitalBefore)} → `, h('strong', { class: r.pnlNet >= 0 ? 'gain' : 'loss' }, money(r.capitalAfter))),
      r.primesBonus > 0 ? h('p', null, `+${r.primesBonus} P (Stop-loss discipliné)`) : null,
      r.stress && p.stressBefore !== null ? stressLine(r, p.stressBefore) : null,
    ),
    h(
      'button',
      {
        class: 'primary',
        onClick: () => {
          pending = null;
          app.render();
        },
      },
      continueLabel,
    ),
  );
}

/** Stress pris par le trade (GDD 13.2), avec ses causes. */
function stressLine(r: TradeRecord, before: number): HTMLElement {
  const stress = r.stress!;
  const causes: Child[] = [];
  const leverage = r.trade.order.leverage;
  if (leverage > CONFIG.life.freeLeverage) causes.push(`levier ×${leverage}`);
  if (r.pnlNet < 0) causes.push(['perte de ', pct(-r.pnlNet / r.capitalBefore, 1), ' du capital (', term('aversion-a-la-perte', 'une perte pèse plus qu’un gain'), ')']);
  else if (r.pnlNet > 0) causes.push('trade gagnant');
  const state = r.stress!.after >= CONFIG.life.tilt.threshold ? 'loss' : r.stress!.after >= CONFIG.life.nervous.threshold ? 'warn' : '';
  return h(
    'p',
    null,
    `Stress : ${fmt(before, 0)} → `,
    h('strong', { class: state }, fmt(stress.after, 0)),
    ` (${stress.delta >= 0 ? '+' : '−'}${fmt(Math.abs(stress.delta), 0)}${causes.length > 0 ? ' : ' : ''}`,
    causes.map((c, i) => [i > 0 ? ', ' : '', c]),
    ')',
  );
}
