// Termes du glossaire dans l'interface (GDD 9, « Règle des infobulles ») :
// chaque terme est souligné ; à sa première apparition, une infobulle s'ouvre automatiquement
// (fermeture au clic) ; ensuite, sa définition s'affiche au survol.

import { GLOSSARY_BY_ID } from '../data/glossary.ts';
import { h } from './dom.ts';
import { loadSeenTerms, saveSeenTerms } from './storage.ts';

const seen = loadSeenTerms();
const queue: HTMLElement[] = [];
let popup: HTMLElement | null = null;
/** Terme affiché dans l'infobulle ouverte, pour la replacer après un nouveau rendu. */
let popupAnchor: HTMLElement | null = null;
let hover: HTMLElement | null = null;

/** Libellé par défaut : le terme sans sa précision entre parenthèses, en minuscule sauf les sigles. */
function defaultLabel(text: string): string {
  const short = text.replace(/\s*\(.*\)$/, '');
  return /^\p{Lu}\p{Ll}/u.test(short) ? short.charAt(0).toLowerCase() + short.slice(1) : short;
}

/** Marque un terme du glossaire : term('stop-loss') ou term('levier', 'Levier ×5'). */
export function term(id: string, label?: string): HTMLElement {
  const entry = GLOSSARY_BY_ID[id];
  if (!entry) throw new Error(`Terme inconnu du glossaire : ${id}`);
  return h('span', { class: 'term', 'data-term': id, tabindex: 0 }, label ?? defaultLabel(entry.term));
}

export function seenTerms(): ReadonlySet<string> {
  return seen;
}

export function resetSeenTerms(): void {
  seen.clear();
  saveSeenTerms(seen);
}

function markSeen(id: string): void {
  if (seen.has(id)) return;
  seen.add(id);
  saveSeenTerms(seen);
}

function place(box: HTMLElement, anchor: HTMLElement): void {
  const rect = anchor.getBoundingClientRect();
  const width = Math.min(340, window.innerWidth - 24);
  box.style.width = `${width}px`;
  box.style.left = `${Math.max(12, Math.min(rect.left, window.innerWidth - width - 12))}px`;
  const below = rect.bottom + 8;
  box.style.top = below + 140 > window.innerHeight ? `${Math.max(12, rect.top - 148)}px` : `${below}px`;
}

function definitionBox(id: string, pinned: boolean): HTMLElement {
  const entry = GLOSSARY_BY_ID[id];
  return h(
    'div',
    { class: `term-box${pinned ? ' term-box-pinned' : ''}`, role: 'tooltip' },
    h('strong', null, entry?.term ?? id),
    h('p', null, entry?.definition ?? ''),
    pinned
      ? h(
          'div',
          { class: 'term-box-actions' },
          queue.length > 0 ? h('button', { class: 'link', onClick: (e: Event) => { e.stopPropagation(); skipAll(); } }, `Tout marquer comme vu (${queue.length + 1})`) : null,
          h('button', { class: 'small', onClick: (e: Event) => { e.stopPropagation(); closePopup(); } }, 'Compris'),
        )
      : null,
  );
}

function showPopup(anchor: HTMLElement): void {
  const id = anchor.dataset.term;
  if (!id) return;
  hideHover();
  popup?.remove();
  popup = definitionBox(id, true);
  popupAnchor = anchor;
  popup.addEventListener('click', closePopup);
  document.body.appendChild(popup);
  place(popup, anchor);
  markSeen(id);
}

function closePopup(): void {
  popup?.remove();
  popup = null;
  popupAnchor = null;
  showNextQueued();
}

function skipAll(): void {
  for (const el of queue) if (el.dataset.term) markSeen(el.dataset.term);
  queue.length = 0;
  closePopup();
}

function showNextQueued(): void {
  while (queue.length > 0) {
    const next = queue.shift();
    if (next && next.isConnected && next.dataset.term && !seen.has(next.dataset.term)) {
      showPopup(next);
      return;
    }
  }
}

function hideHover(): void {
  hover?.remove();
  hover = null;
}

/** À appeler après chaque rendu : branche le survol et ouvre les infobulles des termes nouveaux. */
export function scanTerms(root: HTMLElement): void {
  const queuedIds = new Set(queue.map((el) => el.dataset.term));
  root.querySelectorAll<HTMLElement>('.term').forEach((el) => {
    const id = el.dataset.term;
    if (!id) return;
    if (!el.dataset.bound) bind(el, id);
    if (!seen.has(id) && !queuedIds.has(id)) {
      queue.push(el);
      queuedIds.add(id);
    } else if (!seen.has(id)) {
      // Le même terme a été re-rendu : on remplace l'ancien élément dans la file.
      const i = queue.findIndex((q) => q.dataset.term === id);
      if (i >= 0) queue[i] = el;
    }
  });
  // L'écran a été redessiné : l'infobulle suit son terme, ou se ferme s'il a disparu.
  if (popup && popupAnchor && !popupAnchor.isConnected) {
    const replacement = root.querySelector<HTMLElement>(`.term[data-term="${popupAnchor.dataset.term ?? ''}"]`);
    if (replacement) {
      popupAnchor = replacement;
      place(popup, replacement);
    } else {
      popup.remove();
      popup = null;
      popupAnchor = null;
    }
  }
  // Une infobulle déjà ouverte reste affichée : les nouveaux termes attendent leur tour.
  if (!popup) showNextQueued();
}

function bind(el: HTMLElement, id: string): void {
  el.dataset.bound = '1';
  el.addEventListener('mouseenter', () => {
    if (popup) return;
    hideHover();
    hover = definitionBox(id, false);
    document.body.appendChild(hover);
    place(hover, el);
  });
  el.addEventListener('mouseleave', hideHover);
  el.addEventListener('click', (e) => {
    e.stopPropagation();
    showPopup(el);
  });
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') showPopup(el);
  });
}

/** Ferme les bulles affichées (changement d'écran) ; la file reprend au prochain rendu. */
export function closeTermBoxes(): void {
  hideHover();
  popup?.remove();
  popup = null;
  popupAnchor = null;
}

/** Échap : ferme l'infobulle ouverte ; renvoie false s'il n'y en avait aucune. */
export function closeTermPopup(): boolean {
  if (!popup) return false;
  closePopup();
  return true;
}
