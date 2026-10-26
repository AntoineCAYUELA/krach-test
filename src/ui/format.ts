// Formats des nombres à la française (un Intl.NumberFormat par nombre de décimales).
const nf2 = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nf0 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });

export const money = (v: number): string => `${nf2.format(v)} $`;
export const money0 = (v: number): string => `${nf0.format(v)} $`;
export const int = (v: number): string => nf0.format(v);
export const signed = (v: number): string => `${v >= 0 ? '+' : '−'}${nf2.format(Math.abs(v))} $`;
export const signed0 = (v: number): string => `${v >= 0 ? '+' : '−'}${nf0.format(Math.abs(v))} $`;
export const multiText = (m: number): string => `×${String(m).replace('.', ',')}`;
export const plural = (n: number, word: string): string => `${n} ${word}${n > 1 ? 's' : ''}`;

/** **gras** → <b>gras</b>, le reste échappé. */
export function richText(text: string): string {
  const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return escaped.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
}
