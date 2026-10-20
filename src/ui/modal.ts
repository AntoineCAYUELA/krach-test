// Fenêtres superposées (glossaire, options, choix d'un consommable, confirmation).
// Échap ferme la fenêtre du dessus.

import { h, type Child } from './dom.ts';
import { scanTerms } from './tooltip.ts';

export interface Modal {
  element: HTMLElement;
  close(): void;
}

const stack: Modal[] = [];

export interface ModalOptions {
  title: string;
  content: Child;
  /** Boutons du bas ; sans bouton, une croix suffit pour fermer. */
  actions?: Child;
  wide?: boolean;
  onClose?: () => void;
  className?: string;
}

export function openModal(options: ModalOptions): Modal {
  const panel = h(
    'div',
    { class: `modal${options.wide ? ' modal-wide' : ''} ${options.className ?? ''}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': options.title },
    h('header', { class: 'modal-header' }, h('h2', null, options.title), h('button', { class: 'icon', 'aria-label': 'Fermer', onClick: () => modal.close() }, '×')),
    h('div', { class: 'modal-body' }, options.content),
    options.actions ? h('footer', { class: 'modal-actions' }, options.actions) : null,
  );
  const backdrop = h('div', { class: 'modal-backdrop', onMousedown: (e: Event) => e.target === backdrop && modal.close() }, panel);
  const modal: Modal = {
    element: panel,
    close() {
      const i = stack.indexOf(modal);
      if (i < 0) return;
      stack.splice(i, 1);
      backdrop.remove();
      options.onClose?.();
    },
  };
  stack.push(modal);
  document.body.appendChild(backdrop);
  scanTerms(panel);
  return modal;
}

/** Ferme la fenêtre du dessus ; renvoie false s'il n'y en avait aucune. */
export function closeTopModal(): boolean {
  const top = stack[stack.length - 1];
  if (!top) return false;
  top.close();
  return true;
}

export function closeAllModals(): void {
  while (closeTopModal());
}

export function hasModal(): boolean {
  return stack.length > 0;
}

/** Demande de confirmation pour une action irréversible. */
export function confirmModal(title: string, message: string, confirmLabel: string, onConfirm: () => void): void {
  const modal = openModal({
    title,
    content: h('p', null, message),
    actions: [
      h('button', { onClick: () => modal.close() }, 'Annuler'),
      h('button', { class: 'danger', onClick: () => { modal.close(); onConfirm(); } }, confirmLabel),
    ],
  });
}
