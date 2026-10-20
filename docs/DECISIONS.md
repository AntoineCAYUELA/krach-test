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
- Flux de hasard séparés (marché, pioche, tirage des trades, boutique) dérivés de la graine de run : chaque séance démarre sur le même marché quels que soient les choix du joueur (voir la version 2.0 pour les bougies d'une position).
- Perte plafonnée à la mise : si un stop sauté par un gap (ou tout autre sortie) ferait perdre plus que la mise, la position est traitée comme liquidée (perte = mise). Sinon le capital pourrait devenir négatif.
- Fin de séance avec le Scalpeur : la séance s'arrête quand il reste moins de bougies que la position la plus courte possible (1 avec le Scalpeur, 3 sinon), au lieu de « moins de 3 » dans tous les cas.
- Carnet de trading : le bonus accumulé est perdu si l'Outil est revendu (il ne s'applique que tant que l'Outil est possédé).
- Formation et Pack de signaux sont aussi utilisables en boutique ; les autres consommables seulement pendant une séance. Une seule Couverture peut être active à la fois.
- Pack de signaux : la carte ajoutée entre dans le deck de la run et dans la pioche de la séance en cours ; une carte retirée sort du deck et, si possible, de la pioche ou de la défausse (pas de la main).
- Formatage des nombres : un seul Intl.NumberFormat par nombre de décimales (toLocaleString rendait la simulation 13 fois plus lente).
- Architecture : séance, run, effets des Outils et des consommables sont dans `src/engine/run.ts` (une seule machine à états, l'état complet est un objet JSON sauvegardable), au lieu des fichiers seance.ts, items.ts et consumables.ts suggérés par le prompt. Les textes des Outils et consommables sont dans `src/data/`.
- Interface : le moteur résout la position d'un coup ; l'écran dévoile ensuite les bougies une par une. Pendant l'animation, la barre d'état montre le capital, la Performance et les Primes d'avant le trade ; ils se mettent à jour à la fin, avec la décomposition du score.
- Écran de trading : avant l'ouverture, les lignes d'entrée, de stop-loss et de take-profit de l'aperçu sont tracées en pointillés sur le graphique, avec la chance de chaque niveau, pour voir la position avant de la prendre.
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
- La simulation de référence (`npm run sim`, tableau 7.3) tourne sans le système de stress (`life: false`), pour rester comparable au GDD.

## Version 2.0 : graphique lisible (GDD 2.7)
- Tirage de l'issue : chaque séance a son propre flux de hasard (graine « roll »). Le tirage du prochain trade est fait à l'avance et gardé dans l'état ; la Boule de cristal le compare à la chance du ticket sans toucher au hasard. Comme la chance dépend des cartes, l'issue montrée change en direct quand on change de cartes.
- Bougies d'une position : elles sont regénérées pour respecter l'issue tirée (pont brownien en log-prix, cible atteinte entre 25 % et 100 % des ticks). La même graine ne redonne donc les mêmes bougies que si le joueur fait les mêmes choix ; défausser ou passer ne change rien au marché.
- News : celles déjà générées dans le cache (Calendrier économique) sont gardées dans le chemin, et celles prévues au-delà de la position restent dans le cache reconstruit après elle.
- Chemin introuvable : jusqu'à 80 essais, bruit réduit à 40 % après 60. Aucun échec sur les 400 positions du test ni sur les simulations.
- Après la sortie, le marché redevient libre jusqu'à la fin de la position : la bougie de sortie peut toucher l'autre niveau après la sortie, sans effet sur le trade.
- Marché scripté (tests) : pas de tirage ; la position est résolue bougie par bougie comme en version 1 (gap, stop-loss, liquidation, take-profit), ce qui permet de rejouer l'exemple 5.3 avec des bougies choisies.
- Contexte de marché et régime caché sont distincts : le contexte est calculé sur le graphique visible et ne concorde avec le régime caché que 53 % du temps (mesuré). C'est voulu : le joueur ne lit que le graphique, comme un vrai trader.
- Rapport d'analyste : +10 points de chance sur le prochain trade ; un seul rapport actif à la fois. Il remplace la révélation du régime, devenue inutile.
- Main de 7 cartes au lieu de 5 : avec 5 cartes, le robot ouvrait la moitié de ses trades sans carte valide ; avec 7, un quart.
- Taille Prudent quand le capital est sous 20 $ : la mise passe sous 10 $ et l'ordre est refusé (« Mise minimale »).
- Liquidation : gardée dans le moteur, mais elle n'arrive plus qu'avec un gap de news à fort levier.
- Robot de simulation : il énumère les sous-ensembles de cartes valides dans les deux directions et garde celui qui maximise l'espérance de Performance. Il ouvre si elle est positive ; sinon il défausse les cartes inutiles, puis passe, et ouvre quand même s'il n'a plus le temps. Taille : la plus petite qui comble le quota manquant sur les ordres restants, sinon la meilleure.
- Sauvegarde : version 3. Une run sauvegardée par une version précédente n'est pas reprise.
