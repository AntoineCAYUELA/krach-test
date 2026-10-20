// Textes de la vie du trader (GDD 13) : poste, logement, activités. Les nombres viennent de CONFIG.

import { CONFIG } from '../config.ts';
import { fmt } from '../format.ts';
import type { ActivityId, HomeId, SetupId } from '../engine/types.ts';

export interface LifeItemDef {
  name: string;
  description: string;
}

const L = CONFIG.life;

export const SETUPS: Record<SetupId, LifeItemDef> = {
  laptop: { name: 'Ordinateur portable', description: 'Petit écran, clavier serré : tout le stress de la séance compte.' },
  tower: { name: 'PC tour', description: `Un vrai moniteur : stress pris en séance ×${fmt(L.setups.tower.factor, 1)}.` },
  dualScreen: { name: 'Double écran', description: `Graphique à gauche, ordres à droite : stress pris en séance ×${fmt(L.setups.dualScreen.factor, 1)}.` },
};

export const HOMES: Record<HomeId, LifeItemDef> = {
  studio: { name: 'Studio', description: `Petite fenêtre sur la cour : −${L.homes.studio.recovery} de stress par nuit.` },
  t2: { name: 'T2', description: `Une vraie chambre, une plante, de la lumière : −${L.homes.t2.recovery} de stress par nuit.` },
  loft: { name: 'Loft', description: `Baie vitrée sur les toits de Lyon : −${L.homes.loft.recovery} de stress par nuit.` },
};

export const ACTIVITIES: Record<ActivityId, LifeItemDef> = {
  evening: { name: 'Soirée entre amis', description: 'Un resto, des rires, on ne parle pas de bourse.' },
  spa: { name: 'Spa', description: 'Hammam et massage : le corps relâche ce que la tête retient.' },
  weekend: { name: 'Week-end entre amis', description: 'Deux jours à la montagne, téléphone éteint.' },
  trip: { name: 'Voyage', description: 'Deux semaines loin des écrans. Tu rates la boutique, et une revue de marché t’attend au retour.' },
};
