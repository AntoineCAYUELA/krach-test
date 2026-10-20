// Textes des 6 consommables (GDD 6.1). Les nombres viennent de CONFIG.

import { CONFIG } from '../config.ts';
import { fmt } from '../format.ts';
import type { ConsumableId } from '../engine/types.ts';

export interface ConsumableDef {
  id: ConsumableId;
  name: string;
  price: number;
  effect: string;
  concept: string;
  /** Utilisable depuis la boutique, entre deux séances. */
  usableInShop: boolean;
}

const K = CONFIG.consumables;

export const CONSUMABLES: Record<ConsumableId, ConsumableDef> = {
  analystReport: {
    id: 'analystReport', name: 'Rapport d’analyste', price: K.analystReport.price, usableInShop: false,
    effect: `+${K.analystReport.chanceBonus} % de chance sur le prochain trade.`,
    concept: 'Un rapport de recherche aide à situer le contexte, sans garantir l’avenir.',
  },
  training: {
    id: 'training', name: 'Formation', price: K.training.price, usableInShop: true,
    effect: `+${fmt(K.training.multiBonus, 1)} Multi permanent sur un type de setup choisi (cumulable).`,
    concept: 'La pratique d’une stratégie précise améliore son exécution.',
  },
  signalPack: {
    id: 'signalPack', name: 'Pack de signaux', price: K.signalPack.price, usableInShop: true,
    effect: `Choisis 1 carte Signal parmi ${K.signalPack.choices} et ajoute-la au deck, ou retire 1 carte du deck.`,
    concept: 'Construire sa propre stratégie, c’est choisir quels signaux on suit.',
  },
  hedge: {
    id: 'hedge', name: 'Couverture', price: K.hedge.price, usableInShop: false,
    effect: `Le prochain trade voit son P&L net multiplié par ${fmt(K.hedge.pnlFactor, 1)} (gain comme perte).`,
    concept: 'Une couverture (hedge) réduit le risque, mais réduit aussi le gain.',
  },
  extraOrder: {
    id: 'extraOrder', name: 'Ordre supplémentaire', price: K.extraOrder.price, usableInShop: false,
    effect: `+${K.extraOrder.orders} ordre pour la séance en cours.`,
    concept: 'Le nombre de trades est une ressource limitée.',
  },
  crystalBall: {
    id: 'crystalBall', name: 'Boule de cristal', price: K.crystalBall.price, usableInShop: false,
    effect: 'Montre l’issue du prochain trade avant de le confirmer : take-profit ou stop-loss (hors news).',
    concept: 'Aucun : pouvoir surnaturel. Connaître l’avenir est impossible ; utiliser une information non publique est un délit d’initié.',
  },
};

export const CONSUMABLE_IDS = Object.keys(CONSUMABLES) as ConsumableId[];
