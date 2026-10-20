// Formatage des nombres à la française (virgule décimale, espace pour les milliers).
// Utilisé par le moteur (raisons des cartes) et par l'interface.

// Les formateurs Intl sont coûteux à créer : un seul par nombre de décimales.
const formatters = new Map<number, Intl.NumberFormat>();

export function fmt(value: number, decimals = 2): string {
  let formatter = formatters.get(decimals);
  if (!formatter) {
    formatter = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    formatters.set(decimals, formatter);
  }
  return formatter.format(value);
}

export function money(value: number): string {
  return `${fmt(value, 2)} $`;
}

export function pct(ratio: number, decimals = 2): string {
  return `${fmt(ratio * 100, decimals)} %`;
}

export function signed(value: number, decimals = 2): string {
  const text = fmt(Math.abs(value), decimals);
  return value < 0 ? `−${text}` : `+${text}`;
}
