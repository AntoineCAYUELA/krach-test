// Séances à événement (GDD 7.2). Les nombres viennent de CONFIG.

import { CONFIG } from '../config.ts';
import { fmt, pct } from '../format.ts';
import type { EventId } from '../engine/types.ts';

export interface EventDef {
  id: EventId;
  name: string;
  effect: string;
  lesson: string;
}

const E = CONFIG.events;

export const EVENTS: Record<EventId, EventDef> = {
  rangeMarket: {
    id: 'rangeMarket', name: 'Marché sans tendance',
    effect: 'Régime forcé en range toute la séance.',
    lesson: 'Les signaux de tendance (cassures, croisements) piègent en range.',
  },
  earningsDay: {
    id: 'earningsDay', name: 'Jour de résultats',
    effect: `Probabilité de news : ${pct(CONFIG.market.newsProb, 0)} → ${pct(E.earningsDay.newsProb, 0)} par bougie.`,
    lesson: 'Les annonces créent des gaps qui sautent par-dessus les stop-loss.',
  },
  doubleFees: {
    id: 'doubleFees', name: 'Frais doublés',
    effect: `Frais et spread ×${E.doubleFees.costMultiplier}.`,
    lesson: 'Les coûts de transaction tuent les stratégies à faible gain par trade.',
  },
  lowVolatility: {
    id: 'lowVolatility', name: 'Volatilité écrasée',
    effect: `σ ×${fmt(E.lowVolatility.sigmaMultiplier, 1)}.`,
    lesson: 'Peu de mouvement : il faut plus de taille ou plus de patience.',
  },
  crash: {
    id: 'crash', name: 'Krach',
    effect: `Régime forcé en bear market, σ ×${fmt(E.crash.sigmaMultiplier, 1)}.`,
    lesson: 'Dans un krach, les achats « pas chers » continuent souvent de baisser ; le short et le stop-loss protègent.',
  },
};

/** Événements tirés au hasard pour les séances 2, 4 et 6 (le Krach est réservé à la séance 8). */
export const RANDOM_EVENT_IDS: EventId[] = ['rangeMarket', 'earningsDay', 'doubleFees', 'lowVolatility'];
