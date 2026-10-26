// Glossaire de la base (GDD v3, section 8). Une bulle s'ouvre à la première apparition
// d'un terme, puis le terme renvoie au glossaire.

export interface GlossaryEntry {
  id: string;
  term: string;
  definition: string;
}

export const GLOSSARY: readonly GlossaryEntry[] = [
  { id: 'long', term: 'Long', definition: "Acheter en pariant que le prix va monter. On gagne si le prix de sortie est plus haut que le prix d'entrée." },
  { id: 'short', term: 'Short', definition: "Vendre en pariant que le prix va baisser. On gagne si le prix de sortie est plus bas que le prix d'entrée." },
  { id: 'bougie', term: 'Bougie (chandelier japonais)', definition: "Rectangle qui résume le prix sur une période : ouverture, clôture, plus haut et plus bas. Verte si le prix a monté, rouge s'il a baissé." },
  { id: 'meche', term: 'Mèche', definition: "Trait au-dessus ou en dessous d'une bougie : les prix atteints puis rejetés pendant la période." },
  { id: 'volume', term: 'Volume', definition: "Quantité échangée pendant une période. Un gros volume montre qu'un mouvement est soutenu." },
  { id: 'acheteurs-vendeurs', term: 'Acheteurs et vendeurs', definition: 'Le prix monte quand les acheteurs sont plus pressés que les vendeurs, et baisse dans le cas inverse.' },
  { id: 'tendance-haussiere', term: 'Tendance haussière (bull market)', definition: 'Le prix monte de façon régulière, chaque creux plus haut que le précédent.' },
  { id: 'tendance-baissiere', term: 'Tendance baissière (bear market)', definition: 'Le prix baisse de façon régulière, chaque sommet plus bas que le précédent.' },
  { id: 'retournement', term: 'Retournement', definition: "Changement de sens d'une tendance, souvent précédé d'un ralentissement et d'une mèche avec un gros volume." },
  { id: 'range', term: 'Range', definition: 'Période où le prix oscille entre deux niveaux sans tendance.' },
  { id: 'support', term: 'Support', definition: 'Niveau de prix où les acheteurs reviennent et font rebondir le prix vers le haut.' },
  { id: 'resistance', term: 'Résistance', definition: 'Niveau de prix où les vendeurs reviennent et font rebondir le prix vers le bas.' },
  { id: 'cassure', term: 'Cassure (breakout)', definition: "Sortie du prix au-delà d'un support ou d'une résistance, souvent avec un gros volume." },
  { id: 'faux-signal', term: 'Faux signal', definition: 'Signe qui annonce un mouvement qui ne se produit pas.' },
  { id: 'news', term: 'News', definition: "Information qui change d'un coup ce que les acheteurs et vendeurs pensent d'un actif." },
  { id: 'pnl', term: 'P&L', definition: "Profit and Loss : gain ou perte d'un trade, en dollars." },
  { id: 'capital', term: 'Capital', definition: 'Argent disponible pour trader. Les gains et pertes sont proportionnels au capital engagé.' },
  { id: 'stop-loss', term: 'Stop-loss', definition: 'Ordre qui ferme un trade perdant à un niveau fixé pour limiter la perte.' },
  { id: 'levier', term: 'Levier', definition: "Emprunt qui multiplie la taille d'une position : il multiplie les gains et les pertes." },
  { id: 'couverture', term: 'Couverture (hedging)', definition: "Protection qui réduit une perte possible, en échange d'un coût." },
  { id: 'interets-composes', term: 'Intérêts composés', definition: 'Intérêts calculés sur un capital qui inclut les intérêts déjà gagnés.' },
  { id: 'volatilite', term: 'Volatilité', definition: 'Amplitude des variations du prix. Plus elle est forte, plus gains et pertes sont grands.' },
  { id: 'crypto', term: 'Crypto', definition: "Actif numérique, en général beaucoup plus volatil qu'une action." },
];

export function glossaryEntry(id: string): GlossaryEntry {
  const entry = GLOSSARY.find((e) => e.id === id);
  if (!entry) throw new Error(`Terme inconnu : ${id}`);
  return entry;
}
