# Décisions d'implémentation

Points que le GDD ne précise pas, et le choix fait dans le code. Une ligne par cas : le cas, le choix, la raison.

## Imposés par le prompt de développement
- Pioche vide : la défausse est mélangée pour reformer la pioche.
- Boutique : 2 Outils tirés selon la rareté (70 / 25 / 5 %), sans doublon d'un Outil possédé ni dans la même boutique ; achat désactivé si les 5 emplacements sont pleins.
- Intérêts calculés sur le capital à la fin de la séance, après le dernier trade.
- Calendrier économique et Boule de cristal : le marché génère les 2 bougies suivantes à l'avance (avec leurs news) et les garde en cache ; révéler l'avenir ne modifie jamais le hasard.
- Couverture : le P&L net est multiplié par 0,5 avant le calcul du Résultat ; le capital reçoit ce P&L réduit.
- Frais doublés : frais et spread ×2, appliqués après les réductions des Outils.
- Régime forcé (Marché sans tendance, Krach) : aucun changement de régime pendant la séance.
- Séance gagnée en cours de tour : le trade va au bout de ses bougies, puis la séance s'arrête.

## Ajoutés pendant le développement
- Installation npm : `.npmrc` active `legacy-peer-deps`, car npm 10.9 plante (« edgesOut ») en résolvant les dépendances optionnelles de Vitest 4.
- Flux de hasard séparés (marché, pioche, boutique) dérivés de la graine de run : la même graine donne les mêmes marchés quels que soient les choix du joueur.
- Perte plafonnée à la mise : si un stop sauté par un gap (ou tout autre sortie) ferait perdre plus que la mise, la position est traitée comme liquidée (perte = mise). Sinon le capital pourrait devenir négatif.
- Aperçu du ticket : si le stop-loss est placé au-delà du prix de liquidation, la « perte maximale » affichée est la mise entière.
