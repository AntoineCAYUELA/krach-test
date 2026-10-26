// Joueur automatique pour calibrer les quotas : il lit les signes correctement,
// sauf une part d'erreurs choisie, encaisse dès le quota et achète des trades bonus s'il peut.
// Avec la boutique, il achète les Outils qui rapportent et joue ses Cartes au trade suivant.
import type { CardId, ToolId } from '../data/items.ts';
import { readingFor } from '../engine/market.ts';
import { createRng, nextFloat } from '../engine/rng.ts';
import {
  beginTrade, buyBonusTrade, canPlayCard, cashOut, createRun, finishTrade, nextSeance, playCard, startSeance,
  type RunState,
} from '../engine/run.ts';
import { buyCard, buyTool, canBuyCard, canBuyTool, leaveShop } from '../engine/shop.ts';

export interface BotOptions {
  errorRate: number;
  /** Achète en boutique (sinon il la quitte sans rien prendre). */
  shop?: boolean;
}

// Les Outils d'information (Loupe, Détecteur, Abonnement presse, Terminal pro) aident un humain
// à moins se tromper ; ce robot a un taux d'erreur fixe, il ne les achète donc pas.
const TOOL_PRIORITY: readonly ToolId[] = ['range', 'trend', 'logbook', 'contrarian', 'composure', 'stop-loss', 'golden-ticket', 'interest'];
const CARD_PRIORITY: readonly CardId[] = ['insurance', 'leverage', 'overtime', 'tickets'];

function shopTurn(run: RunState): void {
  for (const id of TOOL_PRIORITY) if (canBuyTool(run, id)) buyTool(run, id);
  for (const id of CARD_PRIORITY) if (canBuyCard(run, id)) buyCard(run, id);
}

/** Joue une partie complète ; renvoie l'état final (phase « won » ou « lost »). */
export function playRun(tier: number, seed: number, options: BotOptions | number): RunState {
  const { errorRate, shop = false } = typeof options === 'number' ? { errorRate: options } : options;
  const run = createRun(tier, seed);
  const errors = createRng(seed ^ 0x9e3779b9);
  for (let guard = 0; guard < 10_000; guard++) {
    switch (run.phase) {
      case 'intro':
        startSeance(run);
        break;
      case 'trading': {
        const deal = beginTrade(run);
        for (const id of [...run.hand]) if (canPlayCard(run, deal, id)) playCard(run, deal, id);
        let dir = readingFor(deal.lead);
        if (nextFloat(errors) < errorRate) dir = dir === 'long' ? 'short' : 'long';
        finishTrade(run, deal, dir);
        break;
      }
      case 'cashout':
        cashOut(run);
        break;
      case 'bonus':
        buyBonusTrade(run);
        break;
      case 'seanceWon':
        nextSeance(run);
        break;
      case 'shop':
        if (shop) shopTurn(run);
        leaveShop(run);
        break;
      case 'won':
      case 'lost':
        return run;
    }
  }
  throw new Error('Partie sans fin');
}

export function winRate(tier: number, options: BotOptions | number, games: number, firstSeed = 1000): number {
  let won = 0;
  for (let i = 0; i < games; i++) if (playRun(tier, firstSeed + i, options).phase === 'won') won++;
  return won / games;
}
