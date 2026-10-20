// Fin de run (GDD 8 et 9, écran 8) : « Tu es viré », « Margin call » ou victoire.
// Affiche la cause, la séance atteinte, le capital final, le meilleur trade, les termes rencontrés,
// la graine de la run et le bouton Rejouer.

import { CONFIG } from '../../config.ts';
import { GLOSSARY } from '../../data/glossary.ts';
import { HOMES, SETUPS } from '../../data/life.ts';
import { SIZE_NAMES, type RunState } from '../../engine/run.ts';
import { euros, fmt, money, pct, signed } from '../../format.ts';
import type { App, View } from '../app.ts';
import { DIRECTION_LABELS, stat, topBar } from '../components.ts';
import { h, type Child } from '../dom.ts';
import { seenTerms, term } from '../tooltip.ts';

function marginCallChain(run: RunState): Child {
  const trades = run.seance?.trades ?? [];
  const trade = trades[trades.length - 1];
  if (!trade) return h('p', null, `Le capital est passé sous la mise minimale de ${CONFIG.run.minStake} $.`);
  const tr = trade.trade;
  const losses = trades.filter((t) => t.pnlNet < 0);
  const lost = losses.reduce((sum, t) => sum + t.pnlNet, 0);
  const exit: Child =
    tr.exitReason === 'liquidation'
      ? ['Un ', term('gap'), ' de news a sauté le stop-loss : la perte a atteint ', term('liquidation', 'la liquidation'), `, toute la mise est perdue (${signed(trade.pnlNet)} $).`]
      : tr.gapped
        ? ['Un ', term('gap'), ` de news a sauté le stop-loss : sortie à l’ouverture, perte de ${signed(trade.pnlNet)} $ (`, term('slippage'), ').']
        : [term('stop-loss', 'Stop-loss'), ` touché : perte de ${signed(trade.pnlNet)} $, soit ${pct(-trade.pnlNet / trade.capitalBefore, 1)} du capital.`];
  return h(
    'ol',
    { class: 'chain' },
    h('li', null, `Dernière position : ${DIRECTION_LABELS[trade.direction].toLowerCase()} ${SIZE_NAMES[trade.size]}, `, term('mise'), ` de ${money(tr.order.stake)} (${pct(tr.order.stake / trade.capitalBefore, 0)} du capital).`),
    h('li', null, term('levier', 'Levier'), ` ×${tr.order.leverage} : `, term('notionnel'), ` de ${money(tr.notional)}, entrée à ${money(tr.entryPrice)}.`),
    h('li', null, exit),
    h('li', null, `Pertes successives de la séance : ${losses.length} trade${losses.length > 1 ? 's' : ''} perdant${losses.length > 1 ? 's' : ''}, ${signed(lost)} $ au total.`),
    h('li', null, `Capital restant : ${money(run.capital)}, sous la mise minimale de ${CONFIG.run.minStake} $. Aucun renflouement : `, term('appel-de-marge', 'margin call'), '.'),
  );
}

export function renderEnd(app: App, run: RunState): View {
  const victory = run.phase === 'victory';
  const marginCall = run.defeatCause === 'liquidation';
  const seance = run.seance;
  const pnl = run.capital - CONFIG.run.startingCapital;
  const learned = GLOSSARY.filter((entry) => seenTerms().has(entry.id)).sort((a, b) => a.term.localeCompare(b.term, 'fr'));

  const title = victory ? 'Victoire : la séance 8 est réussie' : marginCall ? 'Margin call' : 'Tu es viré';
  const cause: Child = victory
    ? h('p', { class: 'lead' }, 'Tu as atteint le quota des 8 séances, Krach compris.')
    : marginCall
      ? [h('p', { class: 'lead' }, 'Ton compte est liquidé.'), marginCallChain(run)]
      : h(
          'p',
          { class: 'lead' },
          `Quota manqué à la séance ${(seance?.index ?? 0) + 1} : Performance ${fmt(seance?.performance ?? 0)} sur ${fmt(seance?.quota ?? 0, 0)}, `,
          seance && seance.orders <= 0 ? 'plus d’ordre disponible.' : 'plus assez de bougies pour un trade.',
        );

  return {
    element: h(
      'div',
      { class: 'screen page' },
      topBar(app, 'Fin de la run', run),
      h(
        'main',
        { class: 'page-body end' },
        h(
          'section',
          { class: `panel end-panel ${victory ? 'victory' : 'defeat'}` },
          h('h1', null, title),
          cause,
          h(
            'div',
            { class: 'stats-row' },
            stat('Séance atteinte', `${(seance?.index ?? 0) + 1} / ${CONFIG.run.seanceCount}`),
            stat('Capital final', money(run.capital)),
            stat('P&L de la run', `${signed(pnl)} $ (${signed((pnl / CONFIG.run.startingCapital) * 100, 1)} %)`, pnl >= 0 ? 'gain' : 'loss'),
            stat('Trades', String(run.tradeCount)),
            stat(
              'Meilleur trade',
              run.bestTrade ? `${signed(run.bestTrade.pnlNet)} $ (${DIRECTION_LABELS[run.bestTrade.direction]}, séance ${run.bestTrade.seance + 1})` : '—',
            ),
          ),
          run.life
            ? h('p', { class: 'muted' }, `Vie du trader : stress ${fmt(run.life.stress, 0)}, épargne ${euros(run.life.savings)}, ${SETUPS[run.life.setup].name.toLowerCase()}, ${HOMES[run.life.home].name}.`)
            : null,
          h('p', null, 'Graine de la run : ', h('strong', { class: 'seed-value' }, String(run.seed)), h('span', { class: 'muted' }, ' (la même graine redonne les mêmes actions et les mêmes départs de séance)')),
          h(
            'div',
            { class: 'end-actions' },
            h('button', { class: 'primary', onClick: () => app.newRun(run.seed) }, 'Rejouer cette graine'),
            h('button', { onClick: () => app.newRun() }, 'Nouvelle partie'),
            h('button', { class: 'ghost', onClick: () => app.quitToTitle() }, 'Menu'),
          ),
        ),
        h(
          'section',
          { class: 'panel' },
          h('h2', null, `Termes rencontrés (${learned.length} sur ${GLOSSARY.length})`),
          learned.length > 0 ? h('ul', { class: 'learned' }, learned.map((entry) => h('li', null, term(entry.id, entry.term)))) : h('p', { class: 'muted' }, 'Aucun terme pour l’instant.'),
        ),
      ),
    ),
  };
}
