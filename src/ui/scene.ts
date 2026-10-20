// Vue à la première personne (GDD 13.5) : l'interface s'affiche dans l'écran du poste,
// posé sur le bureau ; autour, le logement, et sur le bureau, les traces du stress.
// Les dessins sont des SVG statiques écrits ici : aucune donnée du joueur n'y entre.

import { stressState, type LifeState, type StressState } from '../engine/life.ts';
import type { RunState } from '../engine/run.ts';
import type { HomeId, SetupId } from '../engine/types.ts';
import { euros, money } from '../format.ts';
import type { App, View } from './app.ts';
import { seanceTrack } from './screens/briefing.ts';
import { stat, stressGauge, toolSlots } from './components.ts';
import { h } from './dom.ts';

/** En dessous, le décor prendrait trop de place à l'interface : elle s'affiche seule. */
export const DECOR_QUERY = '(min-width: 1100px) and (min-height: 740px)';

export function decorShown(app: App, run: RunState | null): boolean {
  return Boolean(run?.life) && app.settings.decor && window.matchMedia(DECOR_QUERY).matches;
}

function svg(className: string, viewBox: string, body: string, align = 'xMidYMax meet'): HTMLElement {
  const box = h('div', { class: className });
  box.innerHTML = `<svg viewBox="${viewBox}" preserveAspectRatio="${align}" aria-hidden="true">${body}</svg>`;
  return box;
}

// ---------------------------------------------------------------------------
// Dessins du logement

function sky(evening: boolean, id: string): string {
  const [top, bottom] = evening ? ['#141a33', '#4a3560'] : ['#5f86b8', '#b7cde3'];
  return `<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bottom}"/></linearGradient></defs>`;
}

/** Fenêtre de gauche : cour du studio, toits du T2, baie vitrée du loft sur Lyon. */
function windowArt(home: HomeId, evening: boolean): string {
  const lit = evening ? '#f5c86a' : '#2a3346';
  if (home === 'studio') {
    const bricks = Array.from({ length: 9 }, (_, row) =>
      Array.from({ length: 5 }, (_, col) => `<rect x="${44 + col * 26 + (row % 2) * 13}" y="${54 + row * 15}" width="24" height="13" fill="${evening ? '#2f211d' : '#5b3a31'}"/>`).join(''),
    ).join('');
    return `<rect x="30" y="40" width="140" height="150" fill="${evening ? '#1d1513' : '#3e2a25'}"/>
      <clipPath id="studio-glass"><rect x="40" y="50" width="120" height="130"/></clipPath>
      <g clip-path="url(#studio-glass)">${bricks}<rect x="120" y="50" width="6" height="130" fill="#3a3f48"/>
      <rect x="62" y="96" width="20" height="26" fill="${lit}"/></g>
      <rect x="30" y="40" width="140" height="150" fill="none" stroke="#c9c2b6" stroke-width="10"/>
      <line x1="100" y1="40" x2="100" y2="190" stroke="#c9c2b6" stroke-width="5"/>
      <rect x="22" y="190" width="156" height="10" fill="#d8d2c6"/>
      <rect x="40" y="215" width="120" height="40" rx="4" fill="#3b4150"/>
      ${Array.from({ length: 7 }, (_, i) => `<rect x="${48 + i * 16}" y="219" width="8" height="32" rx="2" fill="#4a5163"/>`).join('')}`;
  }
  if (home === 't2') {
    return `${sky(evening, 'sky-t2')}
      <rect x="20" y="20" width="160" height="230" fill="url(#sky-t2)"/>
      <path d="M20 190 L50 160 L80 190 L80 150 L110 125 L140 150 L140 175 L180 140 L180 250 L20 250 Z" fill="${evening ? '#151b2b' : '#38465e'}"/>
      <rect x="92" y="105" width="10" height="24" fill="${evening ? '#151b2b' : '#38465e'}"/>
      <rect x="48" y="200" width="8" height="10" fill="${lit}"/><rect x="118" y="172" width="8" height="10" fill="${lit}"/><rect x="150" y="200" width="8" height="10" fill="${lit}"/>
      <rect x="20" y="20" width="160" height="230" fill="none" stroke="#e8e4dc" stroke-width="10"/>
      <line x1="100" y1="20" x2="100" y2="250" stroke="#e8e4dc" stroke-width="6"/>
      <line x1="20" y1="120" x2="180" y2="120" stroke="#e8e4dc" stroke-width="4"/>
      <rect x="10" y="250" width="180" height="12" fill="#efebe3"/>
      <path d="M150 20 Q170 140 150 262 L190 262 L190 20 Z" fill="#8a6f5a" opacity="0.85"/>`;
  }
  // Loft : Fourvière (basilique et tour métallique) et Part-Dieu (le Crayon), sous une verrière d'atelier.
  const windows = evening
    ? Array.from({ length: 18 }, (_, i) => `<rect x="${(i * 37) % 180 + 10}" y="${300 + ((i * 53) % 90)}" width="4" height="5" fill="#f5c86a"/>`).join('')
    : '';
  return `${sky(evening, 'sky-loft')}
    <rect x="0" y="0" width="200" height="420" fill="url(#sky-loft)"/>
    <path d="M0 330 Q60 270 130 300 L130 420 L0 420 Z" fill="${evening ? '#10151f' : '#2f4a3a'}"/>
    <g fill="${evening ? '#e8c27a' : '#d9d3c4'}"><rect x="48" y="268" width="34" height="22"/><rect x="45" y="258" width="7" height="14"/><rect x="78" y="258" width="7" height="14"/><rect x="45" y="282" width="7" height="12"/><rect x="78" y="282" width="7" height="12"/></g>
    <path d="M100 292 L106 236 L112 292 Z" fill="${evening ? '#c45a4a' : '#7d8794'}"/>
    <rect x="150" y="250" width="22" height="170" rx="11" fill="${evening ? '#1a2133' : '#a7754f'}"/>
    <rect x="130" y="320" width="70" height="100" fill="${evening ? '#121826' : '#5a6578'}"/>
    <rect x="114" y="345" width="22" height="75" fill="${evening ? '#121826' : '#6b7486'}"/>
    ${windows}
    <g fill="none" stroke="#14161b" stroke-width="7"><rect x="0" y="0" width="200" height="420"/><line x1="100" y1="0" x2="100" y2="420"/>
    <line x1="0" y1="105" x2="200" y2="105"/><line x1="0" y1="210" x2="200" y2="210"/><line x1="0" y1="315" x2="200" y2="315"/></g>`;
}

/** Mur de droite : affiche, étagère, tableau selon le logement. */
function wallArt(home: HomeId): string {
  if (home === 'studio') {
    return `<g transform="rotate(4 100 120)"><rect x="40" y="50" width="120" height="150" fill="#d9d2c0"/>
      <text x="100" y="78" text-anchor="middle" font-size="15" font-weight="700" fill="#2a2a2a" font-family="system-ui">BUY LOW</text>
      <text x="100" y="186" text-anchor="middle" font-size="15" font-weight="700" fill="#2a2a2a" font-family="system-ui">SELL HIGH</text>
      ${[0, 1, 2, 3, 4].map((i) => `<rect x="${56 + i * 20}" y="${150 - i * 14}" width="10" height="${22 + (i % 2) * 10}" fill="${i % 2 ? '#c0392b' : '#27ae60'}"/>`).join('')}</g>
      <rect x="30" y="250" width="140" height="8" fill="#5a4a3c"/>
      <rect x="40" y="222" width="12" height="28" fill="#b04a3a"/><rect x="54" y="226" width="10" height="24" fill="#3a6ea5"/><rect x="66" y="218" width="14" height="32" fill="#d8b04a"/>`;
  }
  if (home === 't2') {
    return `<rect x="35" y="40" width="130" height="100" fill="#f1ede4" stroke="#2b2b2b" stroke-width="6"/>
      <path d="M45 125 L75 85 L95 105 L125 65 L155 125 Z" fill="#6c8fb3"/><circle cx="135" cy="70" r="9" fill="#e8b04a"/>
      <rect x="25" y="200" width="150" height="8" fill="#6a4f3a"/><rect x="25" y="280" width="150" height="8" fill="#6a4f3a"/>
      <rect x="35" y="170" width="12" height="30" fill="#9b4a3a"/><rect x="49" y="176" width="10" height="24" fill="#3a6ea5"/><rect x="61" y="166" width="14" height="34" fill="#4a8a5a"/>
      <rect x="120" y="184" width="30" height="16" rx="3" fill="#c96f4a"/><path d="M135 184 Q120 150 128 140 Q140 160 135 184 Q150 150 160 155 Q148 170 135 184" fill="#3f8a4f"/>
      <rect x="40" y="250" width="50" height="30" fill="#d8d2c6"/><rect x="110" y="256" width="12" height="24" fill="#8a5aa8"/><rect x="124" y="250" width="14" height="30" fill="#d8b04a"/>`;
  }
  return `<rect x="0" y="0" width="200" height="420" fill="#4a2f28"/>
    ${Array.from({ length: 28 }, (_, row) => `<line x1="0" y1="${row * 15}" x2="200" y2="${row * 15}" stroke="#3a241f" stroke-width="2"/>${Array.from({ length: 5 }, (_, col) => `<line x1="${col * 44 + (row % 2) * 22}" y1="${row * 15}" x2="${col * 44 + (row % 2) * 22}" y2="${row * 15 + 15}" stroke="#3a241f" stroke-width="2"/>`).join('')}`).join('')}
    <rect x="30" y="40" width="140" height="170" fill="#f4f0e8" stroke="#111" stroke-width="5"/>
    <rect x="45" y="55" width="50" height="140" fill="#e05a3a"/><rect x="100" y="55" width="55" height="70" fill="#2f5d8a"/><rect x="100" y="130" width="55" height="65" fill="#f0c040"/>
    <rect x="20" y="280" width="160" height="8" fill="#1d1d1d"/>
    <rect x="35" y="250" width="22" height="30" rx="3" fill="#e8e4dc"/><path d="M46 250 Q30 215 40 205 Q50 230 46 250 Q60 210 72 214 Q58 236 46 250" fill="#3f8a4f"/>
    <rect x="120" y="244" width="14" height="36" fill="#d8b04a"/><rect x="136" y="250" width="12" height="30" fill="#e05a3a"/>`;
}

/** Objets du bureau : tasses et post-its quand le stress monte, plante, tour du PC. */
function deskLeft(home: HomeId, state: StressState): string {
  const mugs = state === 'tilt' ? 3 : state === 'nervous' ? 2 : 1;
  const plant = home === 'studio' ? '' : `<rect x="20" y="72" width="34" height="38" rx="4" fill="#c96f4a"/>
    <path d="M37 72 Q10 30 22 18 Q36 44 37 72 Q46 20 62 22 Q50 50 37 72 Q70 46 74 58 Q54 64 37 72" fill="#3f8a4f"/>`;
  const cups = Array.from({ length: mugs }, (_, i) => {
    const x = 100 + i * 40;
    return `<rect x="${x}" y="84" width="26" height="26" rx="3" fill="${i % 2 ? '#d8d2c6' : '#e86a4a'}"/><path d="M${x + 26} 90 q10 0 10 8 q0 8 -10 8" fill="none" stroke="${i % 2 ? '#d8d2c6' : '#e86a4a'}" stroke-width="4"/>`;
  }).join('');
  const papers = state === 'tilt' ? '<circle cx="150" cy="60" r="11" fill="#e8e4dc"/><circle cx="172" cy="70" r="9" fill="#dcd6ca"/>' : '';
  return `${plant}${cups}${papers}`;
}

function deskRight(setup: SetupId, state: StressState, evening: boolean): string {
  const notes = state === 'calm' ? 1 : state === 'nervous' ? 3 : 5;
  const postIts = Array.from({ length: notes }, (_, i) => `<rect x="${12 + (i % 3) * 30}" y="${8 + Math.floor(i / 3) * 30}" width="24" height="24" fill="${['#f5e663', '#f7a8c4', '#9be3a8'][i % 3]}" transform="rotate(${(i * 7) % 11 - 5} ${24 + (i % 3) * 30} ${20 + Math.floor(i / 3) * 30})"/>`).join('');
  const tower = setup === 'laptop' ? '' : `<rect x="110" y="0" width="60" height="110" rx="4" fill="#1a1d24" stroke="#2c313c" stroke-width="2"/>
    <rect x="118" y="12" width="44" height="4" rx="2" fill="${evening ? '#58b8ff' : '#3f8fd0'}"/><circle cx="140" cy="94" r="4" fill="#3fd07a"/>`;
  const phone = `<rect x="30" y="92" width="44" height="18" rx="4" fill="#111" stroke="#333" stroke-width="2"/>`;
  return `${postIts}${tower}${phone}`;
}

// ---------------------------------------------------------------------------
// Second écran : tableau de bord quand l'écran affiché n'est pas le trading

function dashboard(run: RunState, life: LifeState): HTMLElement {
  return h(
    'div',
    { class: 'screen dashboard' },
    h('h2', null, 'Tableau de bord'),
    h('div', { class: 'stats-row' }, stat('Capital', money(run.capital)), stat('Primes', `${run.primes} P`), stat('Épargne', euros(life.savings))),
    stressGauge(life.stress),
    seanceTrack(run),
    h('h3', null, 'Outils'),
    toolSlots(run),
  );
}

// ---------------------------------------------------------------------------
// Assemblage

function monitor(content: HTMLElement, className = ''): HTMLElement {
  return h('div', { class: `monitor ${className}` }, h('div', { class: 'device-frame' }, h('div', { class: 'device-screen' }, content)), h('div', { class: 'monitor-stand' }));
}

/** Place l'écran du jeu dans le poste, au milieu du logement. */
export function wrapInScene(run: RunState, view: View): HTMLElement {
  const life = run.life!;
  const evening = run.phase === 'entracte';
  const state = stressState(life.stress);
  let device: HTMLElement;
  if (life.setup === 'laptop') {
    device = h('div', { class: 'device device-laptop' }, h('div', { class: 'device-frame' }, h('div', { class: 'device-screen' }, view.element)), h('div', { class: 'laptop-base' }));
  } else if (life.setup === 'tower') {
    device = h('div', { class: 'device device-tower' }, monitor(view.element));
  } else {
    const [left, right] = view.panes ? view.panes() : [view.element, dashboard(run, life)];
    device = h('div', { class: 'device device-dual' }, monitor(left, 'monitor-main'), monitor(right, 'monitor-side'));
  }
  return h(
    'div',
    { class: `scene home-${life.home} setup-${life.setup} stress-${state}${evening ? ' evening' : ''}` },
    h('div', { class: 'scene-side scene-left' }, svg('scene-window', life.home === 'loft' ? '0 0 200 420' : '0 0 200 270', windowArt(life.home, evening), 'xMidYMin meet')),
    h('div', { class: 'scene-side scene-right' }, svg('scene-wall', life.home === 'loft' ? '0 0 200 420' : '0 0 200 300', wallArt(life.home), 'xMidYMin meet')),
    h('div', { class: 'desk' }),
    svg('desk-props desk-left', '0 0 200 110', deskLeft(life.home, state), 'xMinYMax meet'),
    svg('desk-props desk-right', '0 0 180 110', deskRight(life.setup, state, evening), 'xMaxYMax meet'),
    evening ? h('div', { class: 'lamp-glow' }) : null,
    device,
  );
}
