// Petits utilitaires DOM : création d'éléments et messages temporaires.

export type Child = Node | string | number | null | undefined | false | Child[];

type Props = Record<string, unknown>;

/** Crée un élément : h('button', { class: 'primary', onClick: fn }, 'Texte'). */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props?: Props | null, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props ?? {})) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class') el.className = String(value);
    else if (key === 'style') el.style.cssText = String(value);
    else if (key.startsWith('on') && typeof value === 'function') {
      el.addEventListener(key.slice(2).toLowerCase(), value as EventListener);
    } else if (key === 'value' || key === 'checked' || key === 'disabled') {
      (el as unknown as Record<string, unknown>)[key] = value;
    } else el.setAttribute(key, value === true ? '' : String(value));
  }
  append(el, children);
  return el;
}

function append(parent: Node, children: Child[]): void {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    if (Array.isArray(child)) append(parent, child);
    else parent.appendChild(typeof child === 'string' || typeof child === 'number' ? document.createTextNode(String(child)) : child);
  }
}

export function clear(el: HTMLElement): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}

/** Message bref en bas de l'écran (erreur de règle, confirmation) ; les messages s'empilent. */
export function toast(message: string, kind: 'info' | 'error' = 'info'): void {
  let stack = document.querySelector<HTMLElement>('.toasts');
  if (!stack) {
    stack = h('div', { class: 'toasts', 'aria-live': 'polite' });
    document.body.appendChild(stack);
  }
  const el = h('div', { class: `toast toast-${kind}`, role: 'status' }, message);
  stack.appendChild(el);
  setTimeout(() => el.classList.add('toast-out'), 2600);
  setTimeout(() => el.remove(), 3000);
}
