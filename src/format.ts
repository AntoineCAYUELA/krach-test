// Formatage des nombres à la française (virgule décimale, espace pour les milliers).
// Utilisé par le moteur (raisons des cartes) et par l'interface.

export function fmt(value: number, decimals = 2): string {
  return value.toLocaleString('fr-FR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
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
