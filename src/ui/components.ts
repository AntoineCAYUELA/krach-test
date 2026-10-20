// Éléments d'interface partagés par plusieurs écrans : barre du haut, cartes Signal,
// emplacements d'Outils et de consommables, utilisation d'un consommable.

import { CONFIG } from '../config.ts';
import { CONSUMABLES } from '../data/consumables.ts';
import { RARITY_NAMES, TOOLS } from '../data/tools.ts';
import { CARDS, FAMILY_NAMES, type CardCheck } from '../engine/cards.ts';
import { canUseConsumable, GameError, signalPackOffers, useConsumable, type RunState } from '../engine/run.ts';
import { SETUP_NAMES, SETUP_TYPES } from '../engine/scoring.ts';
import type { CardId, Direction } from '../engine/types.ts';
import { fmt } from '../format.ts';
import type { App } from './app.ts';
import { h, toast, type Child } from './dom.ts';
import { openModal } from './modal.ts';
import { term } from './tooltip.ts';

/** Terme du glossaire associé à chaque carte : son nom est cliquable. */
export const CARD_TERMS: Record<CardId, string> = {
  hammer: 'marteau',
  shootingStar: 'etoile-filante',
  bullishEngulfing: 'avalement',
  bearishEngulfing: 'avalement',
  rsiOversold: 'surachat-survente',
  rsiOverbought: 'surachat-survente',
  goldenCross: 'golden-cross',
  deathCross: 'death-cross',
  supportBounce: 'support',
  resistanceRejection: 'resistance',
  bullishBreakout: 'cassure',
  bearishBreakout: 'cassure',
  volumeSpike: 'pic-de-volume',
  volumeConfirmation: 'volume',
};

export const DIRECTION_LABELS: Record<Direction, string> = { long: 'Long', short: 'Short' };

/** Message d'erreur lisible pour une règle refusée par le moteur. */
export function errorMessage(error: unknown): string {
  if (error instanceof GameError) return error.message;
  console.error(error);
  return 'Action impossible';
}

/** Exécute une action du moteur ; une règle refusée s'affiche en bas de l'écran. */
export function attempt(action: () => void): boolean {
  try {
    action();
    return true;
  } catch (error) {
    toast(errorMessage(error), 'error');
    return false;
  }
}

export function stat(label: Child, value: Child, className = ''): HTMLElement {
  return h('div', { class: `stat ${className}` }, h('span', { class: 'stat-label' }, label), h('span', { class: 'stat-value' }, value));
}

export function progressBar(value: number, max: number): HTMLElement {
  const ratio = max > 0 ? Math.min(1, value / max) : 0;
  return h('div', { class: `progress${ratio >= 1 ? ' progress-full' : ''}` }, h('div', { class: 'progress-fill', style: `width: ${ratio * 100}%` }));
}

/** Barre du haut des écrans hors trading : titre, graine, glossaire, options, menu. */
export function topBar(app: App, title: Child, run: RunState | null): HTMLElement {
  return h(
    'header',
    { class: 'topbar' },
    h('div', { class: 'brand' }, 'Krach Test'),
    h('div', { class: 'topbar-title' }, title),
    h(
      'div',
      { class: 'topbar-actions' },
      run ? h('span', { class: 'seed', title: 'Graine de la run : rejoue exactement les mêmes marchés' }, `Graine ${run.seed}`) : null,
      h('button', { class: 'ghost', onClick: () => app.toggleGlossary() }, 'Glossaire (G)'),
      h('button', { class: 'ghost', onClick: () => app.openOptions() }, 'Options'),
      h('button', { class: 'ghost', onClick: () => app.quitToTitle() }, 'Menu'),
    ),
  );
}

// ---------------------------------------------------------------------------
// Cartes Signal

export interface CardViewOptions {
  /** Validité pour la direction choisie ; null tant qu'aucune direction n'est choisie. */
  check?: CardCheck | null;
  selected?: boolean;
  onClick?: () => void;
  compact?: boolean;
}

export function cardView(id: CardId, options: CardViewOptions = {}): HTMLElement {
  const def = CARDS[id];
  const directionText = def.direction === 'long' ? 'Long' : def.direction === 'short' ? 'Short' : 'Long ou short';
  const check = options.check;
  return h(
    options.onClick ? 'button' : 'div',
    {
      class: `card family-${def.family}${options.selected ? ' selected' : ''}${check ? (check.valid ? ' valid' : ' invalid') : ''}${options.compact ? ' compact' : ''}`,
      onClick: options.onClick,
      'aria-pressed': options.onClick ? String(Boolean(options.selected)) : undefined,
    },
    h('div', { class: 'card-head' }, h('span', { class: 'card-family' }, FAMILY_NAMES[def.family]), h('span', { class: 'card-direction' }, directionText)),
    h('div', { class: 'card-name' }, term(CARD_TERMS[id], def.name)),
    options.compact ? null : h('div', { class: 'card-rule' }, def.rule),
    check === undefined
      ? null
      : check === null
        ? h('div', { class: 'card-check muted' }, 'Choisis long ou short')
        : h('div', { class: 'card-check' }, h('strong', null, check.valid ? '✔ ' : '✘ '), check.reason),
  );
}

// ---------------------------------------------------------------------------
// Outils et consommables

export function toolSlots(run: RunState, onSell?: (index: number) => void, sellValue?: (index: number) => number): HTMLElement {
  const slots: HTMLElement[] = [];
  for (let i = 0; i < CONFIG.run.toolSlots; i++) {
    const id = run.tools[i];
    if (!id) {
      slots.push(h('div', { class: 'slot empty' }, 'Emplacement libre'));
      continue;
    }
    const tool = TOOLS[id];
    const journal = id === 'tradingJournal' && run.journalBonus > 0 ? ` (bonus actuel : +${fmt(run.journalBonus, 1)})` : '';
    slots.push(
      h(
        'div',
        { class: `slot tool rarity-${tool.rarity}`, tabindex: 0 },
        h('span', { class: 'slot-name' }, tool.name),
        onSell && sellValue ? h('button', { class: 'small', onClick: () => onSell(i) }, `Vendre +${sellValue(i)} P`) : null,
        h('div', { class: 'tip' }, h('strong', null, tool.name), h('em', null, RARITY_NAMES[tool.rarity]), h('p', null, tool.effect + journal), h('p', { class: 'muted' }, tool.concept)),
      ),
    );
  }
  return h('div', { class: 'slots tools-row' }, slots);
}

export function consumableSlots(app: App, run: RunState): HTMLElement {
  const slots: HTMLElement[] = [];
  for (let i = 0; i < CONFIG.run.consumableSlots; i++) {
    const id = run.consumables[i];
    if (!id) {
      slots.push(h('div', { class: 'slot empty' }, 'Vide'));
      continue;
    }
    const item = CONSUMABLES[id];
    const usable = canUseConsumable(run, id);
    // Tout l'emplacement est un bouton : cliquer utilise le consommable.
    slots.push(
      h(
        'button',
        { class: 'slot consumable', disabled: !usable, onClick: () => useConsumableFlow(app, run, i) },
        h('span', { class: 'slot-name' }, item.name),
        h('span', { class: 'slot-action' }, usable ? 'Utiliser' : 'Pas maintenant'),
        h('span', { class: 'tip' }, h('strong', null, item.name), h('span', { class: 'tip-line' }, item.effect), h('span', { class: 'tip-line muted' }, item.concept)),
      ),
    );
  }
  return h('div', { class: 'slots consumables-row' }, slots);
}

function applyConsumable(app: App, run: RunState, slot: number, choice?: Parameters<typeof useConsumable>[2]): void {
  attempt(() => {
    const outcome = useConsumable(run, slot, choice);
    toast(outcome.message);
  });
  app.commit();
}

/** Utilisation d'un consommable : choix du setup (Formation), de la carte (Pack), ou confirmation. */
export function useConsumableFlow(app: App, run: RunState, slot: number): void {
  const id = run.consumables[slot];
  if (!id) return;
  const item = CONSUMABLES[id];

  if (id === 'training') {
    const modal = openModal({
      title: item.name,
      content: [
        h('p', null, item.effect),
        h(
          'div',
          { class: 'choice-grid' },
          SETUP_TYPES.map((type) =>
            h(
              'button',
              { class: 'choice', onClick: () => { modal.close(); applyConsumable(app, run, slot, { setupType: type }); } },
              h('strong', null, SETUP_NAMES[type]),
              h('span', null, `Multi ×${fmt(CONFIG.scoring.setupMulti[type], 1)}${run.formations[type] ? ` (+${fmt(run.formations[type] ?? 0, 1)} déjà)` : ''}`),
            ),
          ),
        ),
      ],
    });
    return;
  }

  if (id === 'signalPack') {
    const counts = new Map<CardId, number>();
    for (const card of run.deck) counts.set(card, (counts.get(card) ?? 0) + 1);
    const modal = openModal({
      title: item.name,
      wide: true,
      content: [
        h('h3', null, 'Ajouter une carte au deck'),
        h(
          'div',
          { class: 'hand pack-offers' },
          signalPackOffers(run).map((card) => cardView(card, { onClick: () => { modal.close(); applyConsumable(app, run, slot, { addCard: card }); } })),
        ),
        h('h3', null, `Ou retirer une carte (deck : ${run.deck.length} cartes)`),
        h(
          'div',
          { class: 'deck-list' },
          [...counts.entries()].map(([card, count]) =>
            h(
              'div',
              { class: 'deck-row' },
              h('span', null, `${CARDS[card].name} ×${count}`),
              h('span', { class: 'muted' }, FAMILY_NAMES[CARDS[card].family]),
              h('button', { class: 'small', disabled: run.deck.length <= 1, onClick: () => { modal.close(); applyConsumable(app, run, slot, { removeCard: card }); } }, 'Retirer'),
            ),
          ),
        ),
      ],
    });
    return;
  }

  const modal = openModal({
    title: item.name,
    content: [h('p', null, item.effect), h('p', { class: 'muted' }, item.concept), id === 'crystalBall' ? h('p', null, 'Voir aussi : ', term('delit-d-initie')) : null],
    actions: [
      h('button', { onClick: () => modal.close() }, 'Annuler'),
      h('button', { class: 'primary', onClick: () => { modal.close(); applyConsumable(app, run, slot); } }, 'Utiliser'),
    ],
  });
}
