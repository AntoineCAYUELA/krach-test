# Prompt 2 : prototype jouable dans Claude Code (Krach Test)

À coller comme premier message d'une session Claude Code ouverte dans un dépôt Git vide. Avant de lancer :

1. Crée un dépôt GitHub vide, par exemple `krach-test`, et ouvre-le dans Claude Code.
2. Copie `jeu-trading/gdd.md` dans le dépôt sous `docs/gdd.md`.
3. Copie le dossier `jeu-trading/simulation/` dans le dépôt sous `tools/simulation-python/`.

Si une session s'arrête avant la fin, ouvre-en une nouvelle et écris seulement : « Reprends le prototype : lis docs/PROGRESS.md puis continue au jalon en cours. »

```
# Contexte
Je suis Antoine, étudiant en 1re année de BTS SIO à Lyon. Ce jeu est un projet personnel pour mon portfolio : il doit tourner dans un navigateur, être hébergé gratuitement sur GitHub Pages, et son code doit être assez propre pour qu'un recruteur ou un formateur le lise. J'aime coder et je veux comprendre l'architecture, mais c'est toi qui écris tout le code.

Le jeu s'appelle Krach Test (titre provisoire) : un roguelike deckbuilder façon Balatro sur le thème du trading, qui apprend de vrais termes et mécanismes de marché. Tout le game design est dans docs/gdd.md. Ce document fait autorité : chaque règle, chaque nombre et chaque formule du code en vient.

# Tâche
Code le prototype jouable (MVP) décrit en section 12.1 du GDD, de l'écran titre jusqu'à la victoire ou la défaite d'une run complète de 8 séances.

# Entrées
- docs/gdd.md : le Game Design Document (sections 1 à 12). Lis-le en entier avant d'écrire du code.
- tools/simulation-python/ : simulateur Python qui a servi à calibrer les quotas (sim.py = marché et cartes, g.py = règles d'une séance et robot naïf, run9.py = runs complètes). C'est une référence de comportement, pas du code à porter ligne à ligne.

# Stack imposée
- Vite + TypeScript en mode strict, sans framework UI : DOM et CSS natifs.
- Graphique en chandeliers dessiné en Canvas 2D par ton propre code, sans bibliothèque de graphiques.
- Vitest pour les tests. Aucune dépendance d'exécution : seulement des devDependencies (vite, typescript, vitest, et @playwright/test pour le jalon 8).
- Aucun serveur. Sauvegarde dans le localStorage.
- Déploiement : workflow GitHub Actions qui publie le build sur GitHub Pages (configure `base` dans Vite pour le chemin du dépôt).

# Architecture attendue
- src/config.ts : tous les paramètres chiffrés du GDD (σ, μ, κ, probabilités, frais, spread, quotas, prix, effets des Outils). Aucun nombre de règle ailleurs dans le code.
- src/engine/ : logique pure, sans aucun accès au DOM, entièrement testable.
  - rng.ts (mulberry32 avec graine), market.ts (génération des bougies, régimes, news), indicators.ts (MM5, MM20, RSI 14, support, résistance, volume moyen, pente), cards.ts (conditions de validité des 14 cartes), scoring.ts (formules de la section 5), trade.ts (résolution SL / liquidation / TP de la section 5.2), items.ts et consumables.ts (effets), seance.ts et run.ts (machines à états), shop.ts.
  - Le moteur de marché expose une interface qui permet d'injecter des bougies fixées à la main, pour les tests.
- src/ui/ : un module par écran de la section 9, plus chart.ts (Canvas) et tooltip.ts.
- src/data/glossary.ts : les entrées de la section 10, mot pour mot.
- scripts/sim.ts : simulation headless qui rejoue le robot naïf et les 4 constructions d'Outils de tools/simulation-python/run9.py, sur 5 000 runs par construction (lancée par `npm run sim`).

# Jalons (dans cet ordre)
Ne passe au jalon suivant que lorsque les vérifications du jalon en cours passent. Fais un commit par jalon, avec un message clair en anglais.

1. Projet Vite + TS strict + Vitest + config.ts + rng.ts. Vérification : `npm run build` et `npm test` passent.
2. Marché et indicateurs. Vérification : tests unitaires des indicateurs sur des séries calculées à la main ; même graine = mêmes bougies ; sur 10 000 bougies générées, l'écart-type du rendement par bougie est à ±15 % du σ configuré (hors news).
3. Cartes, résolution d'un trade et score. Vérification : un test rejoue l'exemple de la section 5.3 avec les bougies injectées et retrouve, à 1e-6 près : E = 50,05 ; P&L net = 27,938061… ; Performance = 151,752… ; et pour la variante perdante : P&L net = −52,95 ; Performance du trade = −21,475 ; Performance de séance 30 → 8,525 et 0 → 0. Un test par condition de carte (valide et invalide).
4. Séance, run, 15 Outils, 6 consommables, boutique, Primes, contraintes d'événement. Vérification : un test par Outil et par consommable qui vérifie l'effet chiffré du tableau ; un test pour chaque synergie chiffrée de la section 6 (par exemple ×10 pour Chartiste + Lecteur + Quant) ; `npm run sim` affiche les taux de réussite par séance pour les 4 constructions de run9.py.
5. Écran de trading jouable : graphique, main, ticket d'ordre avec aperçu en direct, animation des 3 bougies, décomposition du score.
6. Tous les autres écrans de la section 9, glossaire, infobulles de première rencontre, avertissement de risque au premier lancement.
7. Sauvegarde et reprise de run, graine affichée et rejouable, README et déploiement GitHub Pages.
8. Test de fumée Playwright : lancer une partie avec une graine fixe, ouvrir une position, vérifier que la Performance et le capital se mettent à jour, puis terminer la séance.

# Contraintes
- Respecte les nombres du GDD tels quels. Si un nombre te semble faux, ne le change pas : note-le dans docs/DECISIONS.md avec ta proposition, parce que l'équilibrage a été simulé avec ces valeurs.
- Calcule en pleine précision flottante et arrondis seulement à l'affichage (2 décimales pour les $ et la Performance).
- Tous les textes visibles sont en français ; les termes de trading restent en anglais quand le GDD les écrit ainsi (long, short, stop-loss, spread…).
- Chaque terme du glossaire qui apparaît à l'écran est souligné et cliquable ; sa première apparition ouvre automatiquement l'infobulle (section 9, règle des infobulles). Les termes déjà vus sont mémorisés dans le localStorage.
- Les actions sont fictives : n'utilise aucun nom, logo ou ticker d'entreprise réelle.
- Le jeu ne présente jamais le trading réel comme un moyen facile de gagner de l'argent : l'avertissement de risque (entrée « Risque de perte » du glossaire) s'affiche au premier lancement et reste accessible depuis le menu.
- Lisibilité : les bougies vertes sont pleines et les rouges creuses, pour rester lisibles sans les couleurs. Le jeu doit être utilisable à 1280 × 720 et au-dessus ; le mobile n'est pas requis.
- Code lisible par un débutant : noms explicites en anglais, une responsabilité par module, un commentaire en tête de chaque fichier du moteur qui renvoie à la section du GDD appliquée (par exemple « GDD 5.2 »).

# Interprétation des points que le GDD ne précise pas
Applique ces choix par défaut, sans me poser de question :
- Pioche vide : mélange la défausse pour reformer la pioche.
- Boutique : 2 Outils tirés selon la rareté (70 / 25 / 5 %), sans doublon d'un Outil déjà possédé ni doublon dans la même boutique. Si les 5 emplacements d'Outils sont pleins, l'achat est désactivé tant que le joueur n'a pas vendu.
- Intérêts calculés sur le capital à la fin de la séance, après le dernier trade.
- Calendrier économique et Boule de cristal : le marché tire les news 2 bougies à l'avance et génère la bougie suivante à l'avance, puis les met en cache, pour que révéler l'avenir ne modifie jamais le hasard.
- Couverture : multiplie le P&L net par 0,5 avant le calcul du Résultat, et s'applique aussi au capital.
- Contrainte « Frais doublés » : frais et spread ×2, appliqués après les réductions des Outils.
- Régime forcé (Marché sans tendance, Krach) : aucun changement de régime pendant la séance.
- Séance gagnée en cours de tour : le trade se termine (les 3 bougies s'affichent), puis la séance s'arrête.
- Pour tout autre cas non couvert, choisis la lecture la plus simple qui reste cohérente avec la section 5, applique-la et note-la dans docs/DECISIONS.md (une ligne : le cas, ton choix, la raison).

# Suivi
Tiens à jour docs/PROGRESS.md : jalon en cours, ce qui est fait, ce qui reste, problèmes connus. Une nouvelle session doit pouvoir reprendre à partir de ce seul fichier.

# Vérification finale
Avant de dire que le prototype est terminé, contrôle :
- `npm run build` sans erreur TypeScript, `npm test` et le test Playwright au vert.
- Une run complète est jouable à la main de l'écran titre à la victoire ou à la défaite, sans erreur dans la console du navigateur.
- `npm run sim` : chaque taux de réussite est à ±8 points de pourcentage de la valeur du tableau 7.3 du GDD, pour la ligne « Aucun Outil » aux séances 1 à 6 et pour la ligne « Synergies » (construction « synergie + levier » de run9.py) aux séances 1 à 8. Les autres cases ont des échantillons trop petits pour être comparées.
- Chacun des 15 Outils, des 6 consommables et des 5 contraintes d'événement a un test.
- Chaque terme du glossaire défini en section 10 est présent dans src/data/glossary.ts.

# Cas limites
- Si `npm run sim` s'écarte de plus de 8 points du GDD : relis d'abord tes règles contre le GDD et contre g.py, et corrige le code. Ne modifie jamais les quotas pour faire coller les chiffres ; si l'écart persiste, documente-le dans docs/DECISIONS.md avec les deux séries de chiffres.
- Si le GDD et le simulateur Python divergent : le GDD l'emporte ; note la divergence dans docs/DECISIONS.md.
- Si le capital tombe sous 10 $ pendant l'animation d'un trade : termine l'animation, puis affiche l'écran « Margin call » (GDD section 8).
- Si le localStorage est indisponible (navigation privée) : le jeu fonctionne sans sauvegarde et le bouton « Continuer » est masqué.
- Si un jalon prend plus de temps que prévu : termine-le proprement avant d'en commencer un autre ; un jeu au cœur jouable vaut mieux que neuf écrans à moitié faits.

# Format de fin de session
Termine chaque session par un résumé de 10 lignes au maximum : jalons terminés, résultat des tests, sortie de `npm run sim` comparée au tableau 7.3, décisions ajoutées dans DECISIONS.md, prochaine étape.
```
