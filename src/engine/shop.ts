// Boutique entre deux séances (GDD 6 et 6.1) : 2 Outils, 2 consommables, relance, revente.

import { CONFIG } from '../config.ts';
import { CONSUMABLE_IDS, CONSUMABLES } from '../data/consumables.ts';
import { TOOL_IDS, TOOLS } from '../data/tools.ts';
import { GameError } from './errors.ts';
import { createRng, deriveSeed, nextInt, pick, weightedPick, type RngState } from './rng.ts';
import type { RunState, ShopState } from './run.ts';
import type { ConsumableId, Rarity, ToolId } from './types.ts';

export function createShop(run: RunState): ShopState {
  const shop: ShopState = {
    tools: [],
    consumables: [],
    rerolls: 0,
    rng: createRng(deriveSeed(run.seed, 'shop', run.seanceIndex)),
  };
  rollOffers(run, shop);
  return shop;
}

/** Tirage d'un Outil : rareté pondérée, sans doublon d'un Outil possédé ni déjà proposé. */
function drawTool(rng: RngState, excluded: readonly ToolId[]): ToolId | null {
  const available = TOOL_IDS.filter((id) => !excluded.includes(id));
  if (available.length === 0) return null;
  const w = CONFIG.shop.rarityWeights;
  const rarity: Rarity = weightedPick(rng, [
    ['common', w.common],
    ['uncommon', w.uncommon],
    ['rare', w.rare],
  ] as const);
  const sameRarity = available.filter((id) => TOOLS[id].rarity === rarity);
  return pick(rng, sameRarity.length > 0 ? sameRarity : available);
}

function rollOffers(run: RunState, shop: ShopState): void {
  shop.tools = [];
  for (let i = 0; i < CONFIG.shop.toolOffers; i++) {
    const excluded = [...run.tools, ...shop.tools.filter((id): id is ToolId => id !== null)];
    shop.tools.push(drawTool(shop.rng, excluded));
  }
  const pool = [...CONSUMABLE_IDS];
  shop.consumables = [];
  for (let i = 0; i < CONFIG.shop.consumableOffers && pool.length > 0; i++) {
    shop.consumables.push(pool.splice(nextInt(shop.rng, pool.length), 1)[0] ?? null);
  }
}

function requireShop(run: RunState): ShopState {
  if (run.phase !== 'shop' || !run.shop) throw new GameError('Pas de boutique ouverte');
  return run.shop;
}

export function rerollCost(shop: ShopState): number {
  return CONFIG.shop.rerollBaseCost + CONFIG.shop.rerollIncrement * shop.rerolls;
}

export function rerollShop(run: RunState): void {
  const shop = requireShop(run);
  const cost = rerollCost(shop);
  if (run.primes < cost) throw new GameError('Pas assez de Primes');
  run.primes -= cost;
  shop.rerolls++;
  rollOffers(run, shop);
}

export function buyTool(run: RunState, slot: number): ToolId {
  const shop = requireShop(run);
  const id = shop.tools[slot];
  if (!id) throw new GameError('Emplacement vide');
  if (run.tools.length >= CONFIG.run.toolSlots) throw new GameError('Tes 5 emplacements d’Outils sont pleins : vends-en un d’abord');
  if (run.primes < TOOLS[id].price) throw new GameError('Pas assez de Primes');
  run.primes -= TOOLS[id].price;
  run.tools.push(id);
  shop.tools[slot] = null;
  return id;
}

export function buyConsumable(run: RunState, slot: number): ConsumableId {
  const shop = requireShop(run);
  const id = shop.consumables[slot];
  if (!id) throw new GameError('Emplacement vide');
  if (run.consumables.length >= CONFIG.run.consumableSlots) throw new GameError('Tes 2 emplacements de consommables sont pleins');
  if (run.primes < CONSUMABLES[id].price) throw new GameError('Pas assez de Primes');
  run.primes -= CONSUMABLES[id].price;
  run.consumables.push(id);
  shop.consumables[slot] = null;
  return id;
}

export function sellValue(id: ToolId): number {
  return Math.floor(TOOLS[id].price * CONFIG.shop.sellRatio);
}

export function sellTool(run: RunState, index: number): number {
  requireShop(run);
  const id = run.tools[index];
  if (!id) throw new GameError('Aucun Outil à cet emplacement');
  run.tools.splice(index, 1);
  // Le bonus du Carnet de trading est lié à l'Outil : il disparaît avec lui.
  if (id === 'tradingJournal') run.journalBonus = 0;
  const value = sellValue(id);
  run.primes += value;
  return value;
}
