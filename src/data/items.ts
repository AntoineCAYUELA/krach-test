// Outils et Cartes de la boutique (GDD v3, sections 6 et 9).
// Outil = effet permanent pour la partie. Carte = effet unique, jouée avant LONG ou SHORT.

export type Rarity = 'common' | 'rare' | 'legendary';

export type ToolId =
  | 'stop-loss' | 'trend' | 'range' | 'loupe' | 'interest' | 'golden-ticket'
  | 'contrarian' | 'logbook' | 'composure' | 'detector' | 'press' | 'terminal';

export type CardId = 'leverage' | 'insurance' | 'denial' | 'tickets' | 'analyst' | 'overtime';

export interface ToolDef {
  id: ToolId;
  icon: string;
  name: string;
  effect: string;
  rarity: Rarity;
  price: number;
  /** Palier à gagner pour débloquer l'Outil (0 = dès le départ). */
  unlock: number;
  /** Terme du glossaire qui explique l'Outil. */
  term: string | null;
}

export interface CardDef {
  id: CardId;
  icon: string;
  name: string;
  effect: string;
  price: number;
  unlock: number;
  term: string | null;
}

export const RARITY_NAME: Record<Rarity, string> = { common: 'Commun', rare: 'Rare', legendary: 'Légendaire' };
export const RARITY_WEIGHT: Record<Rarity, number> = { common: 0.7, rare: 0.25, legendary: 0.05 };

export const TOOLS: readonly ToolDef[] = [
  { id: 'stop-loss', icon: '🛑', name: 'Stop-loss', effect: 'Une perte est plafonnée à −0,6 % du capital.', rarity: 'common', price: 60, unlock: 0, term: 'stop-loss' },
  { id: 'trend', icon: '📈', name: 'Suiveur de tendance', effect: "+30 % sur les gains dans le sens d'une tendance sans signe.", rarity: 'common', price: 60, unlock: 0, term: 'tendance-haussiere' },
  { id: 'range', icon: '↔️', name: 'Range trader', effect: '+50 % sur les gains en range (rebond ou cassure).', rarity: 'common', price: 60, unlock: 0, term: 'range' },
  { id: 'loupe', icon: '🔍', name: 'Loupe', effect: 'La bougie qui porte un signe clignote pendant le choix.', rarity: 'common', price: 60, unlock: 0, term: 'meche' },
  { id: 'interest', icon: '💰', name: 'Intérêts', effect: '+2 % du capital au début de chaque mois.', rarity: 'common', price: 60, unlock: 0, term: 'interets-composes' },
  { id: 'golden-ticket', icon: '🎫', name: "Ticket d'or", effect: '+1 ticket à chaque mois réussi.', rarity: 'common', price: 60, unlock: 0, term: null },
  { id: 'contrarian', icon: '🔄', name: 'Contrarien', effect: "+60 % sur les gains d'un retournement bien joué.", rarity: 'rare', price: 120, unlock: 1, term: 'retournement' },
  { id: 'logbook', icon: '📓', name: 'Carnet de bord', effect: 'Le multi peut monter jusqu\'à ×4 au lieu de ×3.', rarity: 'rare', price: 120, unlock: 2, term: null },
  { id: 'composure', icon: '🧊', name: 'Sang-froid', effect: 'Après une perte, la série est divisée par 2 au lieu de retomber à 0.', rarity: 'rare', price: 120, unlock: 3, term: null },
  { id: 'detector', icon: '📡', name: 'Détecteur de faux signaux', effect: 'Sur un signe, 1 chance sur 2 d\'afficher « fiable » ou « douteux », toujours juste.', rarity: 'rare', price: 120, unlock: 2, term: 'faux-signal' },
  { id: 'press', icon: '📰', name: 'Abonnement presse', effect: '1 news surprise sur 2 est annoncée avant le choix par une rumeur, avec son sens.', rarity: 'rare', price: 120, unlock: 3, term: 'news' },
  { id: 'terminal', icon: '🖥️', name: 'Terminal pro', effect: 'La 1re bougie du trade s\'affiche avant le choix.', rarity: 'legendary', price: 220, unlock: 4, term: null },
];

export const CARDS: readonly CardDef[] = [
  // « Levier × 2 » du GDD, affichée sous le nom choisi dans la bible.
  { id: 'leverage', icon: '✖️', name: 'Doubler la mise', effect: 'Levier ×2 : ce trade compte double, gain comme perte.', price: 40, unlock: 0, term: 'levier' },
  { id: 'insurance', icon: '🛡️', name: 'Assurance', effect: 'Si ce trade perd, la perte est annulée et la série gardée.', price: 40, unlock: 0, term: 'couverture' },
  { id: 'denial', icon: '🚫', name: 'Démenti', effect: "Annule la news surprise de ce trade s'il y en a une.", price: 40, unlock: 3, term: 'news' },
  { id: 'tickets', icon: '🎟️', name: 'Bonus de tickets', effect: '+2 tickets.', price: 40, unlock: 0, term: null },
  { id: 'analyst', icon: '📋', name: "Rapport d'analyste", effect: 'Dit si le mouvement va continuer ou se retourner (hors news).', price: 70, unlock: 1, term: null },
  { id: 'overtime', icon: '⏱️', name: 'Prolongation', effect: '+1 trade ce mois-ci, sans ticket.', price: 70, unlock: 2, term: null },
];

export function toolDef(id: string): ToolDef {
  const def = TOOLS.find((t) => t.id === id);
  if (!def) throw new Error(`Outil inconnu : ${id}`);
  return def;
}

export function cardDef(id: string): CardDef {
  const def = CARDS.find((c) => c.id === id);
  if (!def) throw new Error(`Carte inconnue : ${id}`);
  return def;
}

/** Outils et Cartes débloqués quand les paliers `beaten` ont été gagnés. */
export function unlockedItems(beaten: readonly number[]): { tools: ToolId[]; cards: CardId[] } {
  const ok = (unlock: number): boolean => unlock === 0 || beaten.includes(unlock);
  return {
    tools: TOOLS.filter((t) => ok(t.unlock)).map((t) => t.id),
    cards: CARDS.filter((c) => ok(c.unlock)).map((c) => c.id),
  };
}
