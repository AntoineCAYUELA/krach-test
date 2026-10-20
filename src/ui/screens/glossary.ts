// Glossaire (GDD 9, écran 9 et GDD 10) : accessible partout avec la touche G.
// Liste alphabétique, recherche, termes déjà rencontrés marqués.

import { GLOSSARY, type GlossaryEntry } from '../../data/glossary.ts';
import { h } from '../dom.ts';
import { openModal, type Modal } from '../modal.ts';
import { seenTerms } from '../tooltip.ts';

/** Minuscules sans accents, pour une recherche tolérante. */
function normalize(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

const SORTED: GlossaryEntry[] = [...GLOSSARY].sort((a, b) => a.term.localeCompare(b.term, 'fr'));

export function openGlossary(onClose: () => void): Modal {
  const seen = seenTerms();
  const list = h('dl', { class: 'glossary-list' });
  const count = h('p', { class: 'muted small' });
  const search = h('input', { type: 'search', placeholder: 'Rechercher un terme ou une définition', class: 'glossary-search', 'aria-label': 'Rechercher dans le glossaire' });

  const update = () => {
    const query = normalize(search.value.trim());
    const entries = SORTED.filter((e) => query === '' || normalize(e.term).includes(query) || normalize(e.definition).includes(query));
    list.replaceChildren(
      ...entries.flatMap((e) => [
        h('dt', { class: seen.has(e.id) ? 'seen' : '' }, e.term, seen.has(e.id) ? h('span', { class: 'seen-mark', title: 'Déjà rencontré' }, ' ✓ rencontré') : null),
        h('dd', null, e.definition),
      ]),
    );
    const seenCount = SORTED.filter((e) => seen.has(e.id)).length;
    count.textContent = `${entries.length} terme${entries.length > 1 ? 's' : ''} affiché${entries.length > 1 ? 's' : ''} · ${seenCount} sur ${SORTED.length} déjà rencontrés`;
  };
  search.addEventListener('input', update);
  update();

  const modal = openModal({ title: 'Glossaire', wide: true, className: 'glossary', content: [search, count, list], onClose });
  search.focus();
  return modal;
}
