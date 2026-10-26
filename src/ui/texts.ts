// Textes des écrans de séance. Les termes du glossaire sont balisés <dfn data-term="id">
// pour ouvrir leur bulle à la première apparition (GDD v3, section 8).
import { getTier, fakeShare, type Level } from '../engine/tiers.ts';

const t = (id: string, word: string): string => `<dfn data-term="${id}">${word}</dfn>`;
const pct = (v: number): string => `${Math.round(v * 100)} %`;

/** Ce que le joueur doit savoir avant cette séance : la nouveauté du palier la première fois. */
export function seanceBriefing(tier: number, seance: number, level: Level): string {
  if (tier === 1 && seance === 0) {
    return `<ul>
      <li>Chaque ${t('bougie', 'bougie')} montre le prix sur une période : <span class="up">verte ▲</span> s'il a monté, <span class="down">rouge ▼</span> s'il a baissé.</li>
      <li>Le prix monte quand les <span class="up">acheteurs</span> dominent, baisse quand ce sont les <span class="down">vendeurs</span>. La ${t('acheteurs-vendeurs', 'jauge')} sous les boutons montre qui pousse.</li>
      <li><span class="up">${t('long', 'LONG')}</span> : tu gagnes si le prix monte. <span class="down">${t('short', 'SHORT')}</span> : tu gagnes s'il baisse. Un trade dure 5 bougies.</li>
      <li>Enchaîne les trades gagnants : ton gain passe à <span class="gold n">×1,5</span>, <span class="gold n">×2</span>… jusqu'à <span class="gold n">×3</span>.</li>
    </ul>`;
  }
  if (tier === 1 && seance === 1) {
    return `<p><span class="gold">Nouveau : le ${t('retournement', 'retournement')}.</span> Avant de se retourner, une tendance s'essouffle :</p>
      <ul><li>les bougies ralentissent ;</li><li>une bougie laisse une longue ${t('meche', 'mèche')} contre la tendance, avec un gros ${t('volume', 'volume')} ;</li><li>la jauge bascule vers l'autre camp.</li></ul>
      <p>Si tu vois ces signes, joue dans l'autre sens. Sinon, suis la tendance.</p>`;
  }
  if (seance === 0 && tier === 2) {
    return `<p><span class="gold">Nouveau mouvement : le ${t('range', 'range')}.</span> Le prix rebondit entre un plafond (la ${t('resistance', 'résistance')}) et un plancher (le ${t('support', 'support')}).</p>
      <ul><li>Près du plafond : <span class="down">SHORT</span>, il devrait redescendre. Près du plancher : <span class="up">LONG</span>.</li>
      <li>Si le prix colle au niveau avec un volume qui grossit, il va sans doute le casser : joue la ${t('cassure', 'cassure')}.</li></ul>`;
  }
  if (seance === 0 && tier === 3) {
    return `<p><span class="gold">Nouveau piège : le ${t('faux-signal', 'faux signal')}.</span> Un essoufflement ou une pression sur un niveau peut ne déboucher sur rien.</p>
      <ul><li>Au début, ${pct(fakeShare(level))} des signes sont faux ; plus tard, bien davantage.</li><li>Un signe net (longue mèche, très gros volume) se trompe moins qu'un signe discret.</li></ul>`;
  }
  if (seance === 0 && tier === 4) {
    return `<p><span class="gold">Nouveau risque : la ${t('news', 'news')} surprise.</span> Rare (${pct(level.news)} des trades au début), rien ne l'annonce sur le graphique.</p>
      <ul><li>Elle part toujours contre le mouvement prévu : c'est la part de hasard de tout trade.</li><li>Un bandeau NEWS s'affiche quand elle tombe.</li></ul>`;
  }
  if (seance === 0 && tier === 5) {
    return `<p><span class="gold">Nouvel actif : KRYP, une ${t('crypto', 'crypto')}.</span> Deux fois plus de ${t('volatilite', 'volatilité')} : les tendances vont deux fois plus vite, le bruit aussi.</p>
      <ul><li>Les gains et les pertes doublent en moyenne.</li><li>Les signes se lisent de la même façon.</li></ul>`;
  }
  const fakes = level.fake > 0 ? ` Faux signes : ${pct(fakeShare(level))}.` : '';
  return `<p>Le loyer monte et les signes deviennent plus discrets.${fakes}</p>`;
}

export function tierLabel(tier: number): string {
  const t2 = getTier(tier);
  return `${t2.name} · ${t2.novelty}`;
}

/** SMS du proprio quand le loyer n'est pas payé (bible, section 5). */
export const LANDLORD_SMS = [
  'Bonjour, le loyer de ce mois n\'est toujours pas arrivé.',
  'Je repasse demain. Merci de régulariser rapidement.',
];
