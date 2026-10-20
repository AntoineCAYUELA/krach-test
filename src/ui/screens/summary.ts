// Bilan de séance (GDD 9, écran 6) : Performance contre quota, Primes gagnées, capital avant/après,
// liste des trades et graphique de la séance coloré par le régime réel, enfin révélé.

import { CONFIG } from '../../config.ts';
import { CARDS } from '../../engine/cards.ts';
import { finishSummary, REGIME_NAMES, type RunState } from '../../engine/run.ts';
import { SETUP_NAMES } from '../../engine/scoring.ts';
import { fmt, money, signed } from '../../format.ts';
import type { App, View } from '../app.ts';
import { COLORS, drawChart, type CandleMarker } from '../chart.ts';
import { attempt, DIRECTION_LABELS, stat, topBar } from '../components.ts';
import { h } from '../dom.ts';
import { term } from '../tooltip.ts';

export function renderSummary(app: App, run: RunState): View {
  const seance = run.seance!;
  const rewards = seance.rewards;
  const stopPrimes = seance.trades.reduce((sum, t) => sum + t.primesBonus, 0);
  const last = seance.index >= CONFIG.run.seanceCount - 1;

  const canvas = h('canvas', { class: 'chart-canvas summary-chart', 'aria-label': 'Graphique de la séance, fond coloré selon le régime réel' });
  const markers: CandleMarker[] = seance.trades.map((t) => ({
    index: t.entryCandleIndex,
    price: t.trade.entryPrice,
    label: `${t.number} ${t.direction === 'long' ? '▲' : '▼'}`,
    color: t.pnlNet >= 0 ? COLORS.up : COLORS.down,
  }));
  const draw = () =>
    drawChart(canvas, {
      candles: seance.market.candles,
      slots: CONFIG.seance.historyCandles + CONFIG.seance.candles,
      layers: { ...app.settings.chart, rsi: false, levels: false },
      separatorIndex: CONFIG.seance.historyCandles,
      markers,
      showRegimes: true,
    });

  const regimeLegend = h(
    'div',
    { class: 'legend' },
    h('span', null, h('span', { class: 'swatch', style: `background: ${COLORS.regimeLegend.bull}` }), term('bull-market')),
    h('span', null, h('span', { class: 'swatch', style: `background: ${COLORS.regimeLegend.bear}` }), term('bear-market')),
    h('span', null, h('span', { class: 'swatch', style: `background: ${COLORS.regimeLegend.range}` }), term('range')),
    h('span', { class: 'muted' }, 'Le ', term('regime-de-marche', 'régime'), ' était caché pendant la séance.'),
  );

  const trades = seance.trades.map((t) =>
    h(
      'tr',
      null,
      h('td', null, String(t.number)),
      h('td', null, `${DIRECTION_LABELS[t.direction]} ×${t.trade.order.leverage}`),
      h('td', null, t.playedCards.length > 0 ? t.playedCards.map((id) => CARDS[id].name).join(', ') : '—'),
      h('td', null, SETUP_NAMES[t.setup.type]),
      h('td', { class: t.pnlNet >= 0 ? 'gain' : 'loss' }, `${signed(t.pnlNet)} $`),
      h('td', null, signed(t.score.performance)),
    ),
  );

  let observer: ResizeObserver | null = null;
  return {
    element: h(
      'div',
      { class: 'screen page' },
      topBar(app, 'Bilan de séance', run),
      h(
        'main',
        { class: 'page-body summary' },
        h(
          'section',
          { class: 'panel' },
          h('h1', null, `Séance ${seance.index + 1} réussie`),
          h(
            'div',
            { class: 'stats-row' },
            stat('Performance', `${fmt(seance.performance)} / ${fmt(seance.quota, 0)}`, 'gain'),
            stat('Capital', `${money(seance.capitalAtStart)} → ${money(run.capital)}`),
            stat('Variation', `${signed(run.capital - seance.capitalAtStart)} $`, run.capital >= seance.capitalAtStart ? 'gain' : 'loss'),
          ),
          rewards
            ? h(
                'table',
                { class: 'rewards' },
                h('tr', null, h('th', null, seance.event ? 'Séance à événement' : 'Séance réussie'), h('td', null, `+${rewards.base} P`)),
                h('tr', null, h('th', null, `Ordres non utilisés (${seance.orders} × ${CONFIG.rewards.perUnusedOrder})`), h('td', null, `+${rewards.unusedOrders} P`)),
                h(
                  'tr',
                  null,
                  h('th', null, term('interets', 'Intérêts'), ` (1 P par tranche de ${CONFIG.rewards.interestStep} $ de capital, ${CONFIG.rewards.interestMax} maximum)`),
                  h('td', null, `+${rewards.interest} P`),
                ),
                stopPrimes > 0 ? h('tr', null, h('th', null, 'Stop-loss discipliné (déjà gagnées pendant la séance)'), h('td', null, `+${stopPrimes} P`)) : null,
                h('tr', { class: 'total' }, h('th', null, 'Primes'), h('td', null, `${run.primes} P`)),
              )
            : null,
        ),
        h(
          'section',
          { class: 'panel' },
          h('h2', null, 'Graphique de la séance'),
          regimeLegend,
          h('div', { class: 'chart-wrap' }, canvas),
          h('p', { class: 'muted small' }, `Régime à la dernière bougie : ${REGIME_NAMES[seance.market.candles[seance.market.candles.length - 1]!.regime]}.`),
        ),
        h(
          'section',
          { class: 'panel' },
          h('h2', null, 'Trades'),
          h(
            'table',
            { class: 'trades' },
            h('tr', null, ['N°', 'Position', 'Cartes', 'Setup', 'P&L net', 'Performance'].map((label) => h('th', null, label))),
            trades,
          ),
        ),
        h(
          'button',
          {
            class: 'primary big-button',
            onClick: () => {
              attempt(() => finishSummary(run));
              app.commit();
            },
          },
          last ? 'Terminer la run' : 'Aller à la boutique',
        ),
      ),
    ),
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
