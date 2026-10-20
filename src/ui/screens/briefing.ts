// Briefing de séance (GDD 9, écran 3) : action tirée et son profil, quota, contrainte d'événement,
// ressources de départ.

import { CONFIG } from '../../config.ts';
import { EVENTS } from '../../data/events.ts';
import { TOOLS } from '../../data/tools.ts';
import { STRESS_NAMES, stressMultiFactor, type SeanceStress } from '../../engine/life.ts';
import { marketReview, type RsiZone } from '../../engine/review.ts';
import { beginSeance, type RunState, type SeanceState } from '../../engine/run.ts';
import { fmt, money, pct, signed } from '../../format.ts';
import type { App, View } from '../app.ts';
import { attempt, stat, stressGauge, topBar } from '../components.ts';
import { h } from '../dom.ts';
import { term } from '../tooltip.ts';

/** Les 8 séances de la run : quota, événement, prochaine séance à jouer. */
export function seanceTrack(run: RunState): HTMLElement {
  // À l'entracte et en boutique, la séance de seanceIndex est terminée : la suivante est mise en avant.
  const next = run.phase === 'shop' || run.phase === 'entracte' ? run.seanceIndex + 1 : run.seanceIndex;
  return h(
    'ol',
    { class: 'track' },
    CONFIG.run.quotas.map((quota, i) => {
      const event = run.events[i];
      const state = i < next ? 'done' : i === next ? 'current' : '';
      return h(
        'li',
        { class: `${state}${event ? ' event' : ''}` },
        h('span', { class: 'track-index' }, `S${i + 1}`),
        h('span', { class: 'track-quota' }, fmt(quota, 0)),
        h('span', { class: 'track-event' }, event ? EVENTS[event].name : ''),
      );
    }),
  );
}

export function renderBriefing(app: App, run: RunState): View {
  const seance = run.seance!;
  const event = seance.event ? EVENTS[seance.event] : null;
  const week = Math.floor(seance.index / 2) + 1;
  return {
    element: h(
      'div',
      { class: 'screen page' },
      topBar(app, `Briefing · semaine ${week}`, run),
      h(
        'main',
        { class: 'page-body briefing' },
        run.life?.tripReview ? reviewPanel(seance) : null,
        seanceTrack(run),
        h(
          'section',
          { class: 'panel' },
          h('h1', null, term('seance', 'Séance'), ` ${seance.index + 1} sur ${CONFIG.run.seanceCount}`),
          h(
            'div',
            { class: 'briefing-grid' },
            h(
              'div',
              { class: 'stock-card' },
              h('div', { class: 'ticker' }, seance.stock.ticker),
              h('div', null, h('strong', null, seance.stock.name), ' · ', term('action', 'action'), ' fictive'),
              h('div', null, `Profil : ${seance.stock.profile} · `, term('volatilite', 'volatilité'), ` σ = ${pct(seance.stock.sigma)} par bougie`),
            ),
            h('div', { class: 'quota' }, h('span', { class: 'stat-label' }, 'Quota de Performance'), h('span', { class: 'big' }, fmt(seance.quota, 0))),
          ),
          event
            ? h(
                'div',
                { class: 'event-box' },
                h('h2', null, `Séance à événement : ${event.name}`),
                h('p', null, event.effect),
                h('p', { class: 'lesson' }, 'Leçon : ', event.lesson),
                seance.event === 'crash' ? h('p', null, 'Voir : ', term('krach'), ', ', term('bear-market'), '.') : null,
                seance.event === 'earningsDay' ? h('p', null, 'Voir : ', term('news'), ', ', term('gap'), ', ', term('slippage'), '.') : null,
                seance.event === 'rangeMarket' ? h('p', null, 'Voir : ', term('range'), ', ', term('cassure'), '.') : null,
                seance.event === 'doubleFees' ? h('p', null, 'Voir : ', term('frais'), ', ', term('spread'), '.') : null,
              )
            : h('p', { class: 'muted' }, 'Séance normale : aucune contrainte.'),
          h(
            'div',
            { class: 'stats-row' },
            stat('Ordres', String(seance.orders)),
            stat('Défausses', String(seance.discards)),
            stat('Bougies', String(seance.candlesLeft)),
            stat('Main', `${CONFIG.seance.handSize} cartes`),
            stat('Capital', money(run.capital)),
            stat('Primes', `${run.primes} P`),
          ),
          seance.stress ? stressBox(seance.stress) : null,
          h('p', { class: 'muted' }, run.tools.length > 0 ? `Outils : ${run.tools.map((id) => TOOLS[id].name).join(', ')}.` : 'Aucun Outil pour l’instant : la boutique ouvre après chaque séance réussie.'),
          h(
            'button',
            {
              class: 'primary big-button',
              onClick: () => {
                attempt(() => beginSeance(run));
                app.commit();
              },
            },
            'Commencer la séance',
          ),
        ),
      ),
    ),
  };
}

/** État de stress fixé pour la séance (GDD 13.2). */
function stressBox(stress: SeanceStress): HTMLElement {
  const factor = stressMultiFactor(stress.state);
  return h(
    'div',
    { class: `stress-box stress-${stress.state}` },
    stressGauge(stress.start),
    h(
      'p',
      null,
      stress.event > 0 ? `Séance à événement : stress +${stress.event}. ` : '',
      stress.state === 'calm'
        ? 'Calme : aucun effet pendant la séance.'
        : [
            stress.state === 'tilt' ? term('tilt', STRESS_NAMES.tilt) : STRESS_NAMES[stress.state],
            ` : Multi ×${fmt(factor, 1)} sur chaque trade de la séance.`,
            stress.state === 'tilt' ? [' Gare au ', term('revenge-trading'), '.'] : '',
          ],
    ),
  );
}

const RSI_ZONES: Record<RsiZone, string> = {
  overbought: 'surachat',
  nearOverbought: 'proche du surachat',
  neutral: 'zone neutre',
  nearOversold: 'proche de la survente',
  oversold: 'survente',
};

/** Revue de marché au retour d'un voyage (GDD 13.6), calculée sur l'historique de la séance. */
function reviewPanel(seance: SeanceState): HTMLElement {
  const r = marketReview(seance.market.candles);
  const trend =
    r.trend === 'up' ? ' haussière : la MM5 est au-dessus de la MM20.' : r.trend === 'down' ? ' baissière : la MM5 est sous la MM20.' : ' sans direction nette : la MM5 et la MM20 se confondent.';
  return h(
    'section',
    { class: 'panel review' },
    h('h2', null, 'Pendant ton voyage : ', `${seance.stock.name} (${seance.stock.ticker})`),
    h('p', { class: 'muted small' }, term('revue-de-marche', 'Revue de marché'), ` des ${r.candleCount} dernières bougies.`),
    h(
      'ul',
      null,
      h('li', null, `Le cours est passé de ${money(r.firstClose)} à ${money(r.lastClose)} (${signed(r.change * 100, 1)} %).`),
      h('li', null, `Plus haut ${money(r.high)}, plus bas ${money(r.low)}.`),
      h('li', null, term('tendance', 'Tendance'), trend),
      r.rsi !== null && r.rsiZone ? h('li', null, term('rsi', 'RSI 14'), ` à ${fmt(r.rsi, 0)} : ${RSI_ZONES[r.rsiZone]}.`) : null,
      r.news.length === 0
        ? h('li', null, 'Aucune ', term('news'), '.')
        : r.news.map((n) => h('li', null, term('news', 'News'), ` (bougie ${n.candle}) : « ${n.headline} », `, term('gap'), ` de ${signed(n.gap * 100, 1)} %.`)),
    ),
  );
}
