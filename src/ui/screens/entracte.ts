// Entracte (GDD 13.3) : salaire, nuit au logement, une activité au plus, améliorations du poste
// et du logement, puis boutique (ou départ en voyage, qui la saute).

import { CONFIG } from '../../config.ts';
import { ACTIVITIES, HOMES, SETUPS } from '../../data/life.ts';
import { clampStress, nextUpgrade, type Upgrade } from '../../engine/life.ts';
import { buyUpgrade, chooseActivity, leaveEntracte, type RunState } from '../../engine/run.ts';
import { ACTIVITY_IDS, type ActivityId, type HomeId, type SetupId } from '../../engine/types.ts';
import { euros, fmt } from '../../format.ts';
import type { App, View } from '../app.ts';
import { attempt, stat, stressGauge, topBar } from '../components.ts';
import { h, toast } from '../dom.ts';
import { openModal } from '../modal.ts';
import { term } from '../tooltip.ts';

function confirmSpend(title: string, message: string, label: string, onConfirm: () => void): void {
  const modal = openModal({
    title,
    content: h('p', null, message),
    actions: [
      h('button', { onClick: () => modal.close() }, 'Annuler'),
      h('button', { class: 'primary', onClick: () => { modal.close(); onConfirm(); } }, label),
    ],
  });
}

export function renderEntracte(app: App, run: RunState): View {
  const life = run.life!;
  const entracte = run.entracte!;
  const L = CONFIG.life;
  const act = (action: () => void) => {
    attempt(action);
    app.commit();
  };

  const activityCard = (id: ActivityId) => {
    const def = ACTIVITIES[id];
    const { price, relief } = L.activities[id];
    const chosen = entracte.activity === id;
    const after = clampStress(life.stress - relief);
    const disabled = entracte.activity !== null || life.savings < price;
    return h(
      'div',
      { class: `offer activity${chosen ? ' chosen' : ''}` },
      h('div', { class: 'offer-head' }, h('strong', null, def.name), h('span', null, euros(price))),
      h('p', null, id === 'trip' ? 'Stress remis à 0' : `Stress −${relief}`, entracte.activity ? '' : ` (${fmt(life.stress, 0)} → ${fmt(after, 0)})`),
      h('p', { class: 'muted small' }, def.description),
      chosen
        ? h('p', { class: 'gain' }, '✔ Choisie')
        : h(
            'button',
            {
              class: 'primary',
              disabled,
              title: life.savings < price ? 'Épargne insuffisante' : entracte.activity ? 'Une seule activité par soirée' : undefined,
              onClick: () =>
                confirmSpend(
                  def.name,
                  id === 'trip'
                    ? `${euros(price)}, stress remis à 0. Tu pars : pas de boutique avant la prochaine séance, mais tes Primes sont gardées.`
                    : `${euros(price)}, stress −${relief}. Une seule activité par soirée.`,
                  id === 'trip' ? 'Réserver le voyage' : 'Réserver',
                  () => act(() => chooseActivity(run, id)),
                ),
            },
            `Choisir (${euros(price)})`,
          ),
    );
  };

  const upgradeCard = (kind: Upgrade) => {
    const next = nextUpgrade(life, kind);
    const current = kind === 'setup' ? SETUPS[life.setup] : HOMES[life.home];
    const nextDef = next ? (kind === 'setup' ? SETUPS[next.id as SetupId] : HOMES[next.id as HomeId]) : null;
    return h(
      'div',
      { class: 'offer upgrade' },
      h('div', { class: 'offer-head' }, h('strong', null, kind === 'setup' ? 'Poste' : 'Logement'), h('span', { class: 'muted' }, `Actuel : ${current.name}`)),
      h('p', { class: 'muted small' }, current.description),
      next && nextDef
        ? [
            h('p', null, h('strong', null, `→ ${nextDef.name}`), ` · ${nextDef.description}`),
            h(
              'button',
              {
                class: 'primary',
                disabled: life.savings < next.price,
                onClick: () =>
                  confirmSpend(nextDef.name, `${euros(next.price)} pris sur ton épargne. Amélioration permanente pour toute la run.`, 'Acheter', () =>
                    act(() => {
                      buyUpgrade(run, kind);
                      toast(`${nextDef.name} : installé`);
                    }),
                  ),
              },
              `Acheter (${euros(next.price)})`,
            ),
          ]
        : h('p', { class: 'gain' }, 'Dernier niveau atteint'),
    );
  };

  const trip = entracte.activity === 'trip';
  return {
    element: h(
      'div',
      { class: 'screen page' },
      topBar(app, `Entracte · soirée après la séance ${run.seanceIndex + 1}`, run),
      h(
        'main',
        { class: 'page-body entracte' },
        h(
          'section',
          { class: 'panel' },
          h('h1', null, 'Soirée'),
          h(
            'p',
            { class: 'lead' },
            `Salaire versé : +${euros(entracte.salary)}. Nuit au ${HOMES[life.home].name.toLowerCase()} : stress ${fmt(entracte.stressBefore, 0)} → ${fmt(clampStress(entracte.stressBefore - entracte.recovery), 0)}.`,
          ),
          h('div', { class: 'stats-row' }, stat('Épargne', euros(life.savings)), stressGauge(life.stress), stat('Poste', SETUPS[life.setup].name), stat('Logement', HOMES[life.home].name)),
          h('p', { class: 'muted small' }, 'L’épargne est ton argent personnel : elle ne sert jamais à trader, et une perte de trading ne la touche pas.'),
        ),
        h('section', { class: 'panel' }, h('h2', null, 'Une activité, une seule par soirée'), h('div', { class: 'offers activities' }, ACTIVITY_IDS.map(activityCard))),
        h('section', { class: 'panel' }, h('h2', null, 'Poste et logement'), h('div', { class: 'offers' }, upgradeCard('setup'), upgradeCard('home'))),
        h(
          'section',
          { class: 'panel rules' },
          h('h2', null, 'Le stress en bref'),
          h(
            'ul',
            null,
            h(
              'li',
              null,
              `Il monte : trade perdant (+${L.lossFlat}, plus ${fmt(L.lossPerCapitalPct, 1)} par % du capital perdu), levier au-delà de ×${L.freeLeverage} (+${L.leveragePerStep} par cran et par trade), fin de séance (+${L.seanceFatigue}), séance à événement (+${L.eventSeance}). Une perte pèse plus qu’un gain : c’est l’`,
              term('aversion-a-la-perte', 'aversion à la perte'),
              '.',
            ),
            h('li', null, `Il baisse : trade gagnant (${L.win}), nuit au logement, activités. Un meilleur poste réduit tout le stress pris en séance.`),
            h(
              'li',
              null,
              `Nerveux dès ${L.nervous.threshold} : Multi ×${fmt(L.nervous.multi, 1)}. `,
              term('tilt', 'Tilt'),
              ` dès ${L.tilt.threshold} : Multi ×${fmt(L.tilt.multi, 1)}, le `,
              term('revenge-trading'),
              ' guette. L’état est fixé au début de chaque séance.',
            ),
          ),
        ),
        h(
          'button',
          { class: 'primary big-button', onClick: () => act(() => leaveEntracte(run)) },
          trip ? 'Partir en voyage (pas de boutique cette fois)' : 'Aller à la boutique',
        ),
      ),
    ),
  };
}
