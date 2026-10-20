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
- Fin de séance avec le Scalpeur : la séance s'arrête quand il reste moins de bougies que la position la plus courte possible (1 avec le Scalpeur, 3 sinon), au lieu de « moins de 3 » dans tous les cas.
- Carnet de trading : le bonus accumulé est perdu si l'Outil est revendu (il ne s'applique que tant que l'Outil est possédé).
- Formation et Pack de signaux sont aussi utilisables en boutique ; les autres consommables seulement pendant une séance. Une seule Couverture peut être active à la fois.
- Pack de signaux : la carte ajoutée entre dans le deck de la run et dans la pioche de la séance en cours ; une carte retirée sort du deck et, si possible, de la pioche ou de la défausse (pas de la main).
- Choix du stop et du take-profit : à distance égale, c'est l'Outil qui s'applique (et donne son bonus).
- Robot de simulation : comme dans g.py, il « gaspille » une défausse quand il n'a rien à jeter. Différence restante avec g.py : une position fermée tôt laisse quand même passer ses 3 bougies (règle du GDD), alors que g.py arrêtait le marché.
- Formatage des nombres : un seul Intl.NumberFormat par nombre de décimales (toLocaleString rendait la simulation 13 fois plus lente).
- Architecture : séance, run, effets des Outils et des consommables sont dans `src/engine/run.ts` (une seule machine à états, l'état complet est un objet JSON sauvegardable), au lieu des fichiers seance.ts, items.ts et consumables.ts suggérés par le prompt. Les textes des Outils et consommables sont dans `src/data/`.
- Interface : le moteur résout la position d'un coup ; l'écran dévoile ensuite les bougies une par une. Pendant l'animation, la barre d'état montre le capital, la Performance et les Primes d'avant le trade ; ils se mettent à jour à la fin, avec la décomposition du score.
- Écran de trading : avant l'ouverture, les lignes d'entrée, de stop-loss, de take-profit et de liquidation de l'aperçu sont tracées en pointillés sur le graphique, pour voir la position avant de la prendre.
- Mise : curseur de 10 % à 100 % du capital par pas de 10 % ; à 100 %, la mise vaut exactement le capital.
- Événements : les 8 séances et leurs événements sont visibles dès le début de la run (frise du briefing et de la boutique), comme les boss de Balatro, pour préparer ses achats.
- Infobulles de première rencontre : une seule ouverte à la fois, les autres attendent leur tour ; un terme est marqué « vu » dès que son infobulle s'affiche ; un bouton « Tout marquer comme vu » vide la file.
- Sans localStorage : le bouton Continuer est masqué (le prompt l'impose), même si une run est encore en mémoire.

## Vie du trader (GDD 13)
- Les 3 choix de 13.10 (épargne en € séparée, état de stress fixé au début de la séance, interface dans l'écran du poste) sont codés tels quels en attendant la confirmation d'Antoine.
- Stress d'un trade : les parties (perte, levier, liquidation, gain) sont additionnées, puis seul un total positif est multiplié par le facteur du poste et arrondi. Un gain n'est donc jamais réduit par le poste.
- Ordre au briefing : le +10 d'une séance à événement s'ajoute d'abord, puis l'état (calme, nerveux, tilt) est fixé. La fatigue de fin de séance (+10) ne compte que si la séance est gagnée ; une défaite termine la run.
- Le malus de stress est un terme « × » de la décomposition du Multi, appliqué après les autres termes, pour qu'on le voie dans le détail du score.
- Pas d'entracte après la séance 8 : la run est finie.
- Voyage : la boutique est sautée, les Primes sont gardées. La revue de marché porte sur l'historique de la séance suivante (déjà généré par sa graine), puis disparaît quand la séance commence.
- Décor : affiché seulement si l'option est cochée et que la fenêtre fait au moins 1 100 × 740 px. En dessous, l'écran de trading n'a plus la place pour le graphique et la main.
- Double écran : l'écran de trading est coupé en deux (graphique et main à gauche, ticket d'ordre à droite). Sur les autres écrans, le second moniteur montre un tableau de bord (capital, Primes, épargne, stress, frise des séances, Outils).
- Sauvegarde : version 2. Une run sauvegardée par la version 1 (sans stress) n'est pas reprise.
- La simulation de référence (`npm run sim`, tableau 7.3) tourne sans le système de stress (`life: false`), pour rester comparable au GDD.
