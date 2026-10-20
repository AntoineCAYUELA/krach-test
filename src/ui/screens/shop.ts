// Boutique (GDD 9, écran 7, et GDD 6) : 2 Outils, 2 consommables, relance, vente d'Outils.

import { CONFIG } from '../../config.ts';
import { CONSUMABLES } from '../../data/consumables.ts';
import { RARITY_NAMES, TOOLS } from '../../data/tools.ts';
import { leaveShop, type RunState } from '../../engine/run.ts';
import { buyConsumable, buyTool, rerollCost, rerollShop, sellTool, sellValue } from '../../engine/shop.ts';
import { money } from '../../format.ts';
import type { App, View } from '../app.ts';
import { attempt, consumableSlots, stat, toolSlots, topBar } from '../components.ts';
import { h, toast } from '../dom.ts';
import { confirmModal } from '../modal.ts';
import { seanceTrack } from './briefing.ts';

export function renderShop(app: App, run: RunState): View {
  const shop = run.shop!;
  const act = (action: () => void) => {
    attempt(action);
    app.commit();
  };
  const toolsFull = run.tools.length >= CONFIG.run.toolSlots;
  const consumablesFull = run.consumables.length >= CONFIG.run.consumableSlots;

  const toolOffers = shop.tools.map((id, slot) => {
    if (!id) return h('div', { class: 'offer sold' }, 'Vendu');
    const tool = TOOLS[id];
    const affordable = run.primes >= tool.price;
    return h(
      'div',
      { class: `offer rarity-${tool.rarity}` },
      h('div', { class: 'offer-head' }, h('strong', null, tool.name), h('span', { class: 'rarity' }, RARITY_NAMES[tool.rarity])),
      h('p', null, tool.effect),
      h('p', { class: 'muted small' }, tool.concept),
      h(
        'button',
        { class: 'primary', disabled: !affordable || toolsFull, title: toolsFull ? 'Vends d’abord un Outil' : undefined, onClick: () => act(() => { buyTool(run, slot); toast(`${tool.name} acheté`); }) },
        `Acheter ${tool.price} P`,
      ),
    );
  });

  const consumableOffers = shop.consumables.map((id, slot) => {
    if (!id) return h('div', { class: 'offer sold' }, 'Vendu');
    const item = CONSUMABLES[id];
    const affordable = run.primes >= item.price;
    return h(
      'div',
      { class: 'offer consumable' },
      h('div', { class: 'offer-head' }, h('strong', null, item.name), h('span', { class: 'rarity' }, item.usableInShop ? 'Utilisable ici' : 'En séance')),
      h('p', null, item.effect),
      h('p', { class: 'muted small' }, item.concept),
      h('button', { class: 'primary', disabled: !affordable || consumablesFull, onClick: () => act(() => { buyConsumable(run, slot); toast(`${item.name} acheté`); }) }, `Acheter ${item.price} P`),
    );
  });

  const cost = rerollCost(shop);
  return {
    element: h(
      'div',
      { class: 'screen page' },
      topBar(app, 'Boutique', run),
      h(
        'main',
        { class: 'page-body shop' },
        seanceTrack(run),
        h(
          'div',
          { class: 'stats-row' },
          stat('Primes', `${run.primes} P`),
          stat('Capital', money(run.capital)),
          stat('Deck', `${run.deck.length} cartes`),
          stat('Prochaine séance', `${run.seanceIndex + 2} / ${CONFIG.run.seanceCount}`),
        ),
        h('section', { class: 'panel' }, h('h2', null, 'Outils'), h('div', { class: 'offers' }, toolOffers)),
        h('section', { class: 'panel' }, h('h2', null, 'Consommables'), h('div', { class: 'offers' }, consumableOffers)),
        h(
          'section',
          { class: 'panel' },
          h('h2', null, `Tes Outils (${run.tools.length} / ${CONFIG.run.toolSlots})`),
          toolSlots(
            run,
            (index) => {
              const id = run.tools[index];
              if (!id) return;
              confirmModal('Vendre un Outil', `Vendre ${TOOLS[id].name} pour ${sellValue(id)} P ?${id === 'tradingJournal' ? ' Le bonus du Carnet sera perdu.' : ''}`, 'Vendre', () =>
                act(() => {
                  sellTool(run, index);
                }),
              );
            },
            (index) => {
              const id = run.tools[index];
              return id ? sellValue(id) : 0;
            },
          ),
          h('h2', null, `Tes consommables (${run.consumables.length} / ${CONFIG.run.consumableSlots})`),
          consumableSlots(app, run),
          h('p', { class: 'muted small' }, 'Formation et Pack de signaux s’utilisent ici ; les autres consommables, pendant une séance.'),
        ),
        h(
          'div',
          { class: 'shop-actions' },
          h('button', { disabled: run.primes < cost, onClick: () => act(() => rerollShop(run)) }, `Relancer (${cost} P)`),
          h('button', { class: 'primary big-button', onClick: () => act(() => leaveShop(run)) }, 'Séance suivante'),
        ),
      ),
    ),
  };
}
