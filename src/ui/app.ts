// Contrôleur de l'interface : écran affiché, run en cours, réglages et raccourcis clavier.
// Les écrans de jeu suivent la phase de la run (GDD 9) ; seul l'écran de trading reste affiché
// après la fin d'une séance, le temps de montrer le dernier trade.

import { createRun, type RunState } from '../engine/run.ts';
import { randomSeed } from '../engine/rng.ts';
import { clear } from './dom.ts';
import { closeAllModals, closeTopModal, type Modal } from './modal.ts';
import { DECOR_QUERY, decorShown, wrapInScene } from './scene.ts';
import { renderBriefing } from './screens/briefing.ts';
import { renderEnd } from './screens/end.ts';
import { renderEntracte } from './screens/entracte.ts';
import { openGlossary } from './screens/glossary.ts';
import { renderOnboarding } from './screens/onboarding.ts';
import { openOptions } from './screens/options.ts';
import { renderShop } from './screens/shop.ts';
import { renderSummary } from './screens/summary.ts';
import { renderTitle } from './screens/title.ts';
import { hasPendingTrade, renderTrading, resetTrading } from './screens/trading.ts';
import { isOnboarded, loadRun, loadSettings, saveRun, saveSettings, setOnboarded, type Settings } from './storage.ts';
import { closeTermBoxes, closeTermPopup, scanTerms } from './tooltip.ts';

export type Screen = 'title' | 'onboarding' | 'game';

/** Ce que renvoie un écran : son élément, et de quoi le brancher puis le débrancher. */
export interface View {
  element: HTMLElement;
  /** Appelé une fois l'élément dans la page (tailles connues : dessin du graphique). */
  mount?(): void;
  unmount?(): void;
  /** Double écran : le même contenu réparti sur deux moniteurs (déplace les éléments de `element`). */
  panes?(): [HTMLElement, HTMLElement];
}

export class App {
  run: RunState | null = null;
  settings: Settings = loadSettings();
  private screen: Screen = 'title';
  /** Après le tutoriel : retour au titre, ou lancement de la partie demandée. */
  private afterOnboarding: (() => void) | null = null;
  private view: View | null = null;
  private glossary: Modal | null = null;
  private readonly root: HTMLElement;

  constructor(root: HTMLElement) {
    this.root = root;
  }

  start(): void {
    this.run = loadRun();
    this.screen = isOnboarded() ? 'title' : 'onboarding';
    document.addEventListener('keydown', (e) => this.onKey(e));
    // Le décor apparaît ou disparaît quand la fenêtre passe le seuil de taille.
    window.matchMedia(DECOR_QUERY).addEventListener('change', () => this.render());
    this.render();
  }

  /** Reconstruit l'écran courant à partir de l'état. */
  render(): void {
    this.view?.unmount?.();
    const view = this.buildView();
    this.view = view;
    clear(this.root);
    const inGame = this.screen === 'game' && this.run !== null && (hasPendingTrade() || (this.run.phase !== 'victory' && this.run.phase !== 'defeat'));
    this.root.appendChild(inGame && decorShown(this, this.run) ? wrapInScene(this.run!, view) : view.element);
    view.mount?.();
    scanTerms(this.root);
  }

  /** Sauvegarde la run puis redessine : à appeler après chaque action du joueur. */
  commit(): void {
    saveRun(this.run);
    this.render();
  }

  private buildView(): View {
    if (this.screen === 'onboarding') return renderOnboarding(this, () => this.finishOnboarding());
    const run = this.run;
    if (this.screen === 'title' || !run) return renderTitle(this);
    if (hasPendingTrade() || run.phase === 'seance') return renderTrading(this, run);
    switch (run.phase) {
      case 'briefing':
        return renderBriefing(this, run);
      case 'summary':
        return renderSummary(this, run);
      case 'entracte':
        return renderEntracte(this, run);
      case 'shop':
        return renderShop(this, run);
      case 'victory':
      case 'defeat':
        return renderEnd(this, run);
    }
  }

  private changeScreen(screen: Screen): void {
    closeAllModals();
    closeTermBoxes();
    this.screen = screen;
    this.render();
  }

  newRun(seed: number = randomSeed()): void {
    resetTrading();
    this.run = createRun(seed);
    saveRun(this.run);
    this.changeScreen('game');
  }

  continueRun(): void {
    if (!this.run) return;
    this.changeScreen('game');
  }

  quitToTitle(): void {
    this.changeScreen('title');
  }

  /** Abandon : la run sauvegardée est effacée. */
  abandonRun(): void {
    resetTrading();
    this.run = null;
    saveRun(null);
    this.changeScreen('title');
  }

  showOnboarding(then: () => void = () => this.changeScreen('title')): void {
    this.afterOnboarding = then;
    this.changeScreen('onboarding');
  }

  private finishOnboarding(): void {
    setOnboarded();
    const next = this.afterOnboarding;
    this.afterOnboarding = null;
    if (next) next();
    else this.changeScreen('title');
  }

  updateSettings(change: (settings: Settings) => void): void {
    change(this.settings);
    saveSettings(this.settings);
  }

  toggleGlossary(): void {
    if (this.glossary) {
      this.glossary.close();
      return;
    }
    this.glossary = openGlossary(() => {
      this.glossary = null;
    });
  }

  openOptions(): void {
    openOptions(this);
  }

  private onKey(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      if (!closeTermPopup()) closeTopModal();
      return;
    }
    const target = e.target as HTMLElement | null;
    const typing = target instanceof HTMLInputElement ? ['text', 'search', 'number'].includes(target.type) : target instanceof HTMLTextAreaElement;
    if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'g' || e.key === 'G') {
      e.preventDefault();
      this.toggleGlossary();
    }
  }
}
