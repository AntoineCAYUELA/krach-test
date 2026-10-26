// Boutique entre deux mois (GDD v3, section 6) : 3 Outils et 2 Cartes, payés avec le capital.
// Comme les gains sont proportionnels au capital, chaque achat réduit les gains suivants.
import { CARDS, RARITY_WEIGHT, TOOLS, cardDef, toolDef, type CardId, type Rarity, type ToolId } from '../data/items.ts';
import { nextFloat, nextInt, type Rng } from './rng.ts';
import type { RunState } from './run.ts';

export const SHOP = {
  tools: 3,
  cards: 2,
  maxTools: 5,
  maxCards: 2,
  /** Les achats ne peuvent pas faire descendre le capital sous ce plancher. */
  floor: 100,
  rerollBase: 20,
  rerollStep: 10,
} as const;

export interface Offer {
  tools: ToolId[];
  cards: CardId[];
}

export interface ShopState {
  offer: Offer;
  /** Relances déjà payées pendant cette visite. */
  rerolls: number;
}

/** Tire un Outil : d'abord la rareté (70 / 25 / 5 %, parmi celles encore disponibles), puis l'Outil. */
function drawTool(luck: Rng, candidates: ToolId[]): ToolId | null {
  if (candidates.length === 0) return null;
  const byRarity = new Map<Rarity, ToolId[]>();
  for (const id of candidates) {
    const r = toolDef(id).rarity;
    byRarity.set(r, [...(byRarity.get(r) ?? []), id]);
  }
  const rarities = [...byRarity.keys()];
  const total = rarities.reduce((sum, r) => sum + RARITY_WEIGHT[r], 0);
  let x = nextFloat(luck) * total;
  let pick = rarities[rarities.length - 1] as Rarity;
  for (const r of rarities) {
    x -= RARITY_WEIGHT[r];
    if (x < 0) {
      pick = r;
      break;
    }
  }
  const ids = byRarity.get(pick) ?? [];
  return ids[nextInt(luck, ids.length)] ?? null;
}

/** Nouvelle offre : Outils pas encore possédés, Cartes toutes différentes. */
export function rollOffer(luck: Rng, pool: { tools: readonly ToolId[]; cards: readonly CardId[] }, owned: readonly ToolId[]): Offer {
  const tools: ToolId[] = [];
  // L'ordre du catalogue rend le tirage indépendant de l'ordre de déblocage.
  let candidates = TOOLS.map((t) => t.id).filter((id) => pool.tools.includes(id) && !owned.includes(id));
  for (let i = 0; i < SHOP.tools; i++) {
    const id = drawTool(luck, candidates);
    if (!id) break;
    tools.push(id);
    candidates = candidates.filter((c) => c !== id);
  }
  const cards: CardId[] = [];
  let deck = CARDS.map((c) => c.id).filter((id) => pool.cards.includes(id));
  for (let i = 0; i < SHOP.cards && deck.length > 0; i++) {
    const id = deck[nextInt(luck, deck.length)] as CardId;
    cards.push(id);
    deck = deck.filter((c) => c !== id);
  }
  return { tools, cards };
}

function shopOf(run: RunState): ShopState {
  if (run.phase !== 'shop' || !run.shop) throw new Error('La boutique est fermée');
  return run.shop;
}

export const canAfford = (run: RunState, price: number): boolean => run.capital - price >= SHOP.floor;
export const rerollCost = (run: RunState): number => SHOP.rerollBase + SHOP.rerollStep * (run.shop?.rerolls ?? 0);
/** Part des gains suivants perdue par un achat : 100 $ sur 1 000 $ = 10 %. */
export const gainCut = (run: RunState, price: number): number => price / run.capital;

export const canBuyTool = (run: RunState, id: ToolId): boolean =>
  !!run.shop?.offer.tools.includes(id) && run.tools.length < SHOP.maxTools && canAfford(run, toolDef(id).price);

export const canBuyCard = (run: RunState, id: CardId): boolean =>
  !!run.shop?.offer.cards.includes(id) && run.hand.length < SHOP.maxCards && canAfford(run, cardDef(id).price);

export function buyTool(run: RunState, id: ToolId): void {
  const shop = shopOf(run);
  if (!canBuyTool(run, id)) throw new Error(`Achat impossible : ${toolDef(id).name}`);
  run.capital -= toolDef(id).price;
  run.tools.push(id);
  shop.offer.tools = shop.offer.tools.filter((t) => t !== id);
}

export function buyCard(run: RunState, id: CardId): void {
  const shop = shopOf(run);
  if (!canBuyCard(run, id)) throw new Error(`Achat impossible : ${cardDef(id).name}`);
  run.capital -= cardDef(id).price;
  run.hand.push(id);
  shop.offer.cards = shop.offer.cards.filter((c) => c !== id);
}

/** Revend un Outil pour la moitié de son prix. */
export function sellTool(run: RunState, id: ToolId): void {
  shopOf(run);
  if (!run.tools.includes(id)) throw new Error(`Outil absent : ${toolDef(id).name}`);
  run.capital += toolDef(id).price / 2;
  run.tools = run.tools.filter((t) => t !== id);
}

export const canReroll = (run: RunState): boolean => run.phase === 'shop' && canAfford(run, rerollCost(run));

export function reroll(run: RunState): void {
  const shop = shopOf(run);
  if (!canReroll(run)) throw new Error('Relance impossible');
  run.capital -= rerollCost(run);
  shop.rerolls += 1;
  shop.offer = rollOffer(run.luck, run.pool, run.tools);
}

export function leaveShop(run: RunState): void {
  shopOf(run);
  run.shop = null;
  run.phase = 'intro';
}
