// Avertissement de risque et tutoriel en 3 écrans (GDD 9, écran 2), au premier lancement :
// lire une bougie, ouvrir une position, la formule de score.

import { CONFIG } from '../../config.ts';
import { GLOSSARY_BY_ID } from '../../data/glossary.ts';
import { SETUP_NAMES, SETUP_TYPES } from '../../engine/scoring.ts';
import { fmt, pct } from '../../format.ts';
import type { App, View } from '../app.ts';
import { COLORS } from '../chart.ts';
import { h, type Child } from '../dom.ts';
import { openModal } from '../modal.ts';
import { term } from '../tooltip.ts';

let step = 0;

export function riskWarning(): HTMLElement {
  return h(
    'div',
    { class: 'risk' },
    h('p', { class: 'risk-main' }, GLOSSARY_BY_ID['risque-de-perte']?.definition ?? ''),
    h('p', null, 'Krach Test est un jeu. Les actions, les prix et les news sont fictifs et tirés au hasard. Le jeu ne donne aucun conseil d’investissement.'),
    h('p', null, 'Il apprend le vocabulaire et les mécanismes des marchés (', term('levier'), ', ', term('stop-loss'), ', ', term('frais'), '…), y compris ce qui fait perdre de l’argent.'),
  );
}

export function openRiskWarning(): void {
  const modal = openModal({ title: 'Avertissement sur les risques', content: riskWarning(), actions: h('button', { class: 'primary', onClick: () => modal.close() }, 'J’ai compris') });
}

/** Schéma d'une bougie verte (pleine) et d'une bougie rouge (creuse), en SVG. */
function candleDiagram(): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 420 230');
  svg.setAttribute('class', 'candle-diagram');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'Une bougie verte pleine et une bougie rouge creuse, avec leurs 4 prix');
  const add = (tag: string, attrs: Record<string, string | number>, text?: string) => {
    const el = document.createElementNS(ns, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
    if (text) el.textContent = text;
    svg.appendChild(el);
  };
  // Bougie verte : Open 160, Close 70, High 30, Low 200.
  add('line', { x1: 110, y1: 30, x2: 110, y2: 200, stroke: COLORS.up, 'stroke-width': 2 });
  add('rect', { x: 92, y: 70, width: 36, height: 90, fill: COLORS.up });
  // Bougie rouge : Open 60, Close 150, High 25, Low 190.
  add('line', { x1: 310, y1: 25, x2: 310, y2: 60, stroke: COLORS.down, 'stroke-width': 2 });
  add('line', { x1: 310, y1: 150, x2: 310, y2: 190, stroke: COLORS.down, 'stroke-width': 2 });
  add('rect', { x: 293, y: 60, width: 34, height: 90, fill: 'none', stroke: COLORS.down, 'stroke-width': 2 });
  const label = (x: number, y: number, text: string, anchor = 'start') => add('text', { x, y, fill: '#c9d1e0', 'font-size': 13, 'text-anchor': anchor, 'dominant-baseline': 'middle' }, text);
  label(136, 30, 'High (plus haut)');
  label(136, 70, 'Close (clôture)');
  label(136, 160, 'Open (ouverture)');
  label(136, 200, 'Low (plus bas)');
  label(284, 25, 'High', 'end');
  label(284, 60, 'Open', 'end');
  label(284, 150, 'Close', 'end');
  label(284, 190, 'Low', 'end');
  label(110, 222, 'Hausse : pleine', 'middle');
  label(310, 222, 'Baisse : creuse', 'middle');
  return svg;
}

interface Step {
  title: string;
  body: () => Child;
}

const STEPS: Step[] = [
  { title: 'Avant de jouer', body: () => riskWarning() },
  {
    title: '1. Lire une bougie',
    body: () => [
      h('p', null, 'Le graphique montre le prix en ', term('chandelier-japonais', 'chandeliers japonais'), '. Chaque bougie résume une période avec 4 prix : ', term('ohlc'), '.'),
      candleDiagram(),
      h(
        'ul',
        null,
        h('li', null, 'Le ', term('corps'), ' va de l’ouverture à la clôture ; les ', term('meche', 'mèches'), ' montrent le plus haut et le plus bas.'),
        h('li', null, 'Une bougie verte et pleine : le prix a monté. Rouge et creuse : il a baissé.'),
        h('li', null, 'Sous le graphique : le ', term('volume'), ' (titres échangés) et le ', term('rsi'), '. Sur le graphique : deux ', term('moyenne-mobile', 'moyennes mobiles'), ' (MM5, MM20), le ', term('support'), ' et la ', term('resistance', 'résistance'), '.'),
        h('li', null, 'Survole une bougie pour lire ses 4 prix. Les 40 premières bougies sont l’historique.'),
      ),
    ],
  },
  {
    title: '2. Ouvrir une position',
    body: () => [
      h(
        'ol',
        null,
        h('li', null, 'Choisis la direction : ', term('long'), ' (tu gagnes si le prix monte) ou ', term('short'), ' (s’il baisse).'),
        h('li', null, 'Chaque carte Signal de ta main affiche alors ✔ si sa condition est vraie sur la dernière bougie, ✘ sinon, avec la raison.'),
        h('li', null, `Sélectionne 0 à ${CONFIG.seance.maxPlayedCards} cartes à jouer, puis règle la `, term('mise'), ', le ', term('levier'), ', et si tu veux un ', term('stop-loss'), ' et un ', term('take-profit'), '.'),
        h('li', null, `La position dure ${CONFIG.seance.tradeDuration} bougies, sauf si le stop-loss, le take-profit ou la `, term('liquidation'), ' la ferment avant.'),
      ),
      h(
        'p',
        null,
        `Chaque séance te donne ${CONFIG.seance.orders} ordres, ${CONFIG.seance.discards} défausses et ${CONFIG.seance.candles} bougies. Défausser remplace des cartes ; passer fait avancer le marché d’une bougie. Le `,
        term('notionnel'),
        ` vaut mise × levier : avec un levier ×2, une baisse de ${pct(CONFIG.trade.liquidationThreshold / 2, 0)} suffit à perdre toute la mise.`,
      ),
    ],
  },
  {
    title: '3. La formule de score',
    body: () => [
      h(
        'div',
        { class: 'formula' },
        h('p', null, h('strong', null, 'Points d’analyse'), ` = ${CONFIG.scoring.analysisPointsPerCard} × cartes valides jouées`),
        h('p', null, h('strong', null, 'Résultat'), ' = Points d’analyse + ', term('pnl', 'P&L'), ' net (gain ou perte en $, ', term('frais'), ' déduits)'),
        h('p', null, h('strong', null, 'Performance'), ` = Résultat × Multi si le Résultat est positif, Résultat × ${fmt(CONFIG.scoring.lossFactor, 1)} sinon`),
      ),
      h(
        'table',
        { class: 'setup-table' },
        h('tr', null, h('th', null, 'Setup (cartes valides)'), h('th', null, 'Multi')),
        SETUP_TYPES.map((type) => h('tr', null, h('td', null, SETUP_NAMES[type]), h('td', null, `×${fmt(CONFIG.scoring.setupMulti[type], 1)}`))),
      ),
      h('p', null, 'Une ', term('confluence'), ' mélange des familles de cartes différentes : elle vaut plus qu’un double signal de la même famille. Les Outils de la boutique ajoutent des bonus de Multi.'),
      h('p', null, `Atteins le quota de Performance de chaque séance. Ton capital est conservé d’une séance à l’autre : sous ${CONFIG.run.minStake} $, c’est le margin call et la run s’arrête.`),
    ],
  },
];

export function renderOnboarding(_app: App, onDone: () => void): View {
  const current = STEPS[step] ?? STEPS[0]!;
  const last = step >= STEPS.length - 1;
  const go = (next: number) => {
    step = next;
    _app.render();
  };
  const finish = () => {
    step = 0;
    onDone();
  };
  return {
    element: h(
      'div',
      { class: 'screen onboarding' },
      h(
        'section',
        { class: 'panel onboarding-panel' },
        h('div', { class: 'dots' }, STEPS.map((_, i) => h('span', { class: `dot${i === step ? ' active' : ''}` }))),
        h('h1', null, current.title),
        h('div', { class: 'onboarding-body' }, current.body()),
        h(
          'footer',
          { class: 'onboarding-actions' },
          step > 0 ? h('button', { onClick: () => go(step - 1) }, 'Précédent') : h('span'),
          step > 0 && !last ? h('button', { class: 'ghost', onClick: finish }, 'Passer le tutoriel') : null,
          h('button', { class: 'primary', onClick: () => (last ? finish() : go(step + 1)) }, step === 0 ? 'J’ai compris' : last ? 'C’est parti' : 'Suivant'),
        ),
      ),
    ),
  };
}
