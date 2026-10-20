// Menu titre (GDD 9, écran 1) : Nouvelle partie, Continuer, Glossaire, Options.

import type { App, View } from '../app.ts';
import { h, toast } from '../dom.ts';
import { confirmModal } from '../modal.ts';
import { storageAvailable } from '../storage.ts';
import { openRiskWarning } from './onboarding.ts';

const MAX_SEED = 2 ** 32 - 1;

/** Graine saisie par le joueur : un entier de 0 à 4 294 967 295, ou null si le champ est vide. */
function parseSeed(text: string): number | null | 'invalid' {
  const trimmed = text.trim();
  if (trimmed === '') return null;
  if (!/^\d+$/.test(trimmed)) return 'invalid';
  const value = Number(trimmed);
  return value <= MAX_SEED ? value : 'invalid';
}

export function renderTitle(app: App): View {
  const run = app.run;
  const canContinue = storageAvailable && run !== null && run.phase !== 'victory' && run.phase !== 'defeat';
  const seedInput = h('input', { type: 'text', inputmode: 'numeric', placeholder: 'Graine (facultatif)', class: 'seed-input', 'aria-label': 'Graine de la partie' });

  const start = () => {
    const seed = parseSeed(seedInput.value);
    if (seed === 'invalid') {
      toast('La graine est un nombre entier de 0 à 4 294 967 295', 'error');
      return;
    }
    const launch = () => (seed === null ? app.newRun() : app.newRun(seed));
    if (canContinue) confirmModal('Nouvelle partie', 'La run en cours sera perdue.', 'Nouvelle partie', launch);
    else launch();
  };

  return {
    element: h(
      'div',
      { class: 'screen title' },
      h(
        'section',
        { class: 'title-panel' },
        h('h1', null, 'Krach Test'),
        h('p', { class: 'tagline' }, 'Lis le graphique, joue tes signaux, atteins le quota. Un roguelike de cartes pour apprendre le vocabulaire du trading.'),
        h(
          'div',
          { class: 'menu' },
          canContinue && run
            ? h('button', { class: 'primary', onClick: () => app.continueRun() }, `Continuer (séance ${run.seanceIndex + 1})`)
            : null,
          h('div', { class: 'new-game' }, h('button', { class: canContinue ? '' : 'primary', onClick: start }, 'Nouvelle partie'), seedInput),
          h('button', { onClick: () => app.toggleGlossary() }, 'Glossaire (G)'),
          h('button', { onClick: () => app.openOptions() }, 'Options'),
          h('button', { class: 'ghost', onClick: () => app.showOnboarding() }, 'Tutoriel'),
          h('button', { class: 'ghost', onClick: openRiskWarning }, 'Avertissement sur les risques'),
        ),
        storageAvailable ? null : h('p', { class: 'muted small' }, 'Sauvegarde indisponible (navigation privée ?) : la partie ne sera pas conservée.'),
        h('p', { class: 'muted small disclaimer' }, 'Jeu éducatif. Entreprises, prix et news fictifs. Aucun conseil d’investissement.'),
      ),
    ),
  };
}
