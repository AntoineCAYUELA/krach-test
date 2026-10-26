// News surprises (GDD v3, section 3) : titre et sens du choc (+1 hausse, −1 baisse).
// Elles viennent du journal parodique de la bible, Le Pigeon Financier.

export interface NewsItem {
  dir: 1 | -1;
  title: string;
}

export const NEWS: Record<string, readonly NewsItem[]> = {
  KRCH: [
    { dir: -1, title: 'Le PDG de Krach Corp démissionne sans prévenir' },
    { dir: -1, title: 'Enquête du régulateur sur les comptes de Krach Corp' },
    { dir: -1, title: "Une usine de Krach Corp à l'arrêt après un incendie" },
    { dir: 1, title: 'Krach Corp reçoit une offre de rachat surprise' },
    { dir: 1, title: "Krach Corp décroche un contrat géant avec l'État" },
    { dir: 1, title: 'Résultats de Krach Corp bien meilleurs que prévu' },
  ],
  KRYP: [
    { dir: -1, title: 'Une plateforme d\'échange de KRYP piratée cette nuit' },
    { dir: -1, title: 'Un influenceur vend tous ses KRYP en direct' },
    { dir: -1, title: 'Rumeur d\'interdiction des cryptos en Europe' },
    { dir: 1, title: 'Un milliardaire tweete un emoji fusée sur KRYP' },
    { dir: 1, title: 'Une grande banque accepte les paiements en KRYP' },
    { dir: 1, title: 'KRYP listé sur la plus grosse plateforme du monde' },
  ],
};
