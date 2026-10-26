// Paliers du GDD v3 (section 4) : une nouvelle mécanique par palier, difficulté croissante.
// Les paramètres de marché vont de la valeur de la 1re séance à celle de la dernière.

export type Regime = 'up' | 'down' | 'range';

export interface Level {
  /** Part des trades où le mouvement se retourne (toujours annoncé par un signe). */
  reversal: number;
  /** Netteté des signes : 1 = évidents, 0,5 = discrets. */
  clarity: number;
  /** Chance d'un faux signe quand le mouvement continue. */
  fake: number;
  /** Chance d'une news surprise pendant le trade. */
  news: number;
  /** Bruit par bougie. */
  sigma: number;
  /** Pente d'une tendance par bougie. */
  drift: number;
  regimes: readonly Regime[];
}

interface MarketParams {
  reversal: number;
  clarity: number;
  fake: number;
  news: number;
  sigma: number;
}

export interface Tier {
  id: number;
  name: string;
  /** Ce que le palier ajoute, en quelques mots. */
  novelty: string;
  quotas: readonly number[];
  from: MarketParams;
  to: MarketParams;
  range: boolean;
  crypto: boolean;
  /** Actif tradé : KRCH (Krach Corp), puis KRYP au palier 5. */
  ticker: string;
}

// Quotas calibrés par simulation (scripts/sim.ts), en encaissant dès le quota. P1 sans boutique ;
// P2 à P5 remontés pour qu'un joueur qui achète en boutique garde le taux de victoire du GDD
// (GDD v3, section 11, point 5).
export const TIERS: readonly Tier[] = [
  {
    id: 1, name: 'Palier 1', novelty: 'Tendances, puis retournements', ticker: 'KRCH',
    quotas: [105, 130, 165], range: false, crypto: false,
    from: { reversal: 0, clarity: 1, fake: 0, news: 0, sigma: 0.002 },
    to: { reversal: 0.3, clarity: 0.95, fake: 0, news: 0, sigma: 0.0025 },
  },
  {
    id: 2, name: 'Palier 2', novelty: 'Range', ticker: 'KRCH',
    quotas: [205, 220, 250, 280, 315, 350], range: true, crypto: false,
    from: { reversal: 0.3, clarity: 1, fake: 0, news: 0, sigma: 0.0022 },
    to: { reversal: 0.3, clarity: 0.85, fake: 0, news: 0, sigma: 0.003 },
  },
  {
    id: 3, name: 'Palier 3', novelty: 'Faux signaux', ticker: 'KRCH',
    quotas: [215, 230, 255, 270, 290, 320, 340, 370, 400, 430], range: true, crypto: false,
    from: { reversal: 0.3, clarity: 0.9, fake: 0.05, news: 0, sigma: 0.0025 },
    to: { reversal: 0.32, clarity: 0.7, fake: 0.2, news: 0, sigma: 0.0035 },
  },
  {
    id: 4, name: 'Palier 4', novelty: 'News surprises', ticker: 'KRCH',
    quotas: [165, 185, 195, 210, 225, 245, 270, 285, 310, 335], range: true, crypto: false,
    from: { reversal: 0.3, clarity: 0.8, fake: 0.15, news: 0.03, sigma: 0.003 },
    to: { reversal: 0.35, clarity: 0.6, fake: 0.2, news: 0.08, sigma: 0.004 },
  },
  {
    id: 5, name: 'Palier 5', novelty: 'Crypto', ticker: 'KRYP',
    quotas: [300, 330, 375, 410, 465, 520], range: true, crypto: true,
    from: { reversal: 0.32, clarity: 0.7, fake: 0.2, news: 0.06, sigma: 0.0025 },
    to: { reversal: 0.35, clarity: 0.55, fake: 0.2, news: 0.08, sigma: 0.0035 },
  },
];

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export function getTier(id: number): Tier {
  const tier = TIERS[id - 1];
  if (!tier) throw new Error(`Palier inconnu : ${id}`);
  return tier;
}

/** Paramètres du marché pour une séance (index 0) d'un palier. */
export function levelFor(tier: Tier, seance: number, baseDrift: number): Level {
  const n = tier.quotas.length;
  const t = n === 1 ? 1 : seance / (n - 1);
  const k = tier.crypto ? 2 : 1;
  return {
    reversal: lerp(tier.from.reversal, tier.to.reversal, t),
    clarity: lerp(tier.from.clarity, tier.to.clarity, t),
    fake: lerp(tier.from.fake, tier.to.fake, t),
    news: lerp(tier.from.news, tier.to.news, t),
    sigma: lerp(tier.from.sigma, tier.to.sigma, t) * k,
    drift: baseDrift * k,
    regimes: tier.range ? ['up', 'down', 'range'] : ['up', 'down'],
  };
}

/** Part des signes qui sont faux à ce niveau. */
export function fakeShare(level: Level): number {
  const fakes = (1 - level.reversal) * level.fake;
  const total = level.reversal + fakes;
  return total === 0 ? 0 : fakes / total;
}
