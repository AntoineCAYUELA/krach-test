// Options : animation, éléments du graphique, tutoriel, avertissement, données sauvegardées.

import type { App } from '../app.ts';
import { h, toast } from '../dom.ts';
import { confirmModal, openModal } from '../modal.ts';
import { clearAll, storageAvailable, type Settings } from '../storage.ts';
import { resetSeenTerms, term } from '../tooltip.ts';
import { openRiskWarning } from './onboarding.ts';

export function openOptions(app: App): void {
  const checkbox = (label: Parameters<typeof h>[2], get: (s: Settings) => boolean, set: (s: Settings, v: boolean) => void) =>
    h(
      'label',
      { class: 'option' },
      h('input', {
        type: 'checkbox',
        checked: get(app.settings),
        onChange: (e: Event) => {
          const value = (e.target as HTMLInputElement).checked;
          app.updateSettings((s) => set(s, value));
          app.render();
        },
      }),
      label,
    );

  const inRun = app.run !== null && app.run.phase !== 'victory' && app.run.phase !== 'defeat';
  const modal = openModal({
    title: 'Options',
    content: [
      h('h3', null, 'Partie'),
      checkbox('Animation rapide des bougies (0,2 s au lieu de 0,6 s)', (s) => s.fastAnimation, (s, v) => (s.fastAnimation = v)),
      checkbox('Décor : bureau et logement autour de l’écran (masqué automatiquement sur les petits écrans)', (s) => s.decor, (s, v) => (s.decor = v)),
      h('h3', null, 'Graphique'),
      checkbox(['MM5 (', term('moyenne-mobile', 'moyenne mobile'), ' courte)'], (s) => s.chart.sma5, (s, v) => (s.chart.sma5 = v)),
      checkbox('MM20 (moyenne mobile longue)', (s) => s.chart.sma20, (s, v) => (s.chart.sma20 = v)),
      checkbox(['Lignes de ', term('support'), ' et de ', term('resistance', 'résistance')], (s) => s.chart.levels, (s, v) => (s.chart.levels = v)),
      checkbox(['Barres de ', term('volume')], (s) => s.chart.volume, (s, v) => (s.chart.volume = v)),
      checkbox(['Panneau ', term('rsi')], (s) => s.chart.rsi, (s, v) => (s.chart.rsi = v)),
      h('h3', null, 'Aide'),
      h(
        'div',
        { class: 'option-buttons' },
        h('button', { onClick: () => { modal.close(); app.showOnboarding(); } }, 'Revoir le tutoriel'),
        h('button', { onClick: openRiskWarning }, 'Avertissement sur les risques'),
        h('button', { onClick: () => { resetSeenTerms(); toast('Les infobulles de première rencontre réapparaîtront'); modal.close(); app.render(); } }, 'Réafficher les infobulles'),
      ),
      h('h3', null, 'Données'),
      storageAvailable ? null : h('p', { class: 'muted small' }, 'Sauvegarde indisponible dans ce navigateur.'),
      h(
        'div',
        { class: 'option-buttons' },
        inRun
          ? h('button', { class: 'danger', onClick: () => confirmModal('Abandonner la run', 'La run en cours sera effacée.', 'Abandonner', () => { modal.close(); app.abandonRun(); }) }, 'Abandonner la run')
          : null,
        h(
          'button',
          {
            class: 'danger',
            disabled: !storageAvailable,
            onClick: () =>
              confirmModal('Effacer les données', 'La run sauvegardée, les réglages et les termes rencontrés seront effacés.', 'Tout effacer', () => {
                clearAll();
                window.location.reload();
              }),
          },
          'Effacer toutes les données',
        ),
      ),
    ],
  });
}
