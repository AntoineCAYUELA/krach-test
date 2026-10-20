# Krach Test

Roguelike de cartes façon Balatro sur le thème du trading. On lit un graphique en chandeliers, on joue des cartes Signal (marteau, RSI, support, pic de volume…) qui augmentent la chance de gagner, et on ouvre des positions pour atteindre un quota de Performance à chaque séance. En chemin, le jeu apprend le vocabulaire et les mécanismes des marchés : long et short, levier, stop-loss, ratio risque/rendement, espérance de gain, spread.

**Jouer dans le navigateur : https://antoinecayuela.github.io/krach-test/**

![Écran de trading : graphique, main de cartes et ticket d'ordre](docs/screenshot-ticket.png)

![Résolution d'un trade : take-profit touché et décomposition du score](docs/screenshot-score.png)

> Les entreprises, les prix et les news sont fictifs. Le trading réel fait perdre de l'argent à la majorité des particuliers. Ce jeu est un entraînement au vocabulaire, pas un conseil d'investissement.

## Le jeu en bref

- Une run, c'est 8 séances. Une sur deux est une séance à événement (marché sans tendance, jour de résultats, frais doublés, volatilité écrasée), et la dernière est un krach.
- Chaque séance donne 5 ordres, 3 défausses et 24 bougies pour atteindre le quota.
- Le contexte de marché est toujours affiché : tendance haussière, tendance baissière ou sans tendance, d'après la pente de MM20.
- À chaque tour, on choisit long ou short. Chaque carte de la main (7 cartes) indique alors ✔ ou ✘ avec la raison (« RSI = 41, il faut < 30 »), et son bonus de chance dans le contexte : un retournement vaut +12 % sans tendance, une continuation +12 % dans le sens de la tendance.
- On joue 0 à 3 cartes et on choisit une taille : Prudent (50 % du capital, ×1), Normal (50 %, ×2) ou Agressif (100 %, ×2). Le stop-loss (1 u) et le take-profit (1,5 u) sont placés automatiquement, avec u = 2 σ de l'action.
- Le ticket affiche la chance de toucher le take-profit (40 % sans carte), le gain, la perte et l'espérance de gain. Le jeu tire l'issue avec cette chance, puis génère des bougies qui la respectent. Seul un gap de news peut sauter un niveau.
- Score : Résultat = P&L net. La Performance vaut Résultat × Multi si elle est positive, et Résultat × 0,5 si elle est négative. Les cartes valides comptent deux fois : elles augmentent la chance et le Multi. Une confluence de familles différentes vaut plus qu'un signal isolé.
- Le capital est conservé d'une séance à l'autre. Sous 10 $, c'est le margin call.
- Entre deux séances, la boutique vend des Outils (15, avec des synergies) et des consommables (6).
- Vie du trader (GDD 13) : une jauge de stress monte avec les pertes, le levier et la fatigue. Nerveux dès 50 (Multi ×0,8), tilt dès 80 (Multi ×0,6). Le soir, l'entracte verse un salaire en € sur une épargne séparée du capital. Elle paie des activités (soirée, spa, week-end, voyage), un meilleur poste (portable, PC tour, double écran) et un meilleur logement (studio, T2, loft). Le voyage remet le stress à 0 mais saute la boutique, et le briefing suivant résume le marché manqué.
- Vue à la première personne : sur un écran d'au moins 1 100 × 740 px, le jeu s'affiche dans l'écran du poste, posé sur un bureau, devant la fenêtre du logement. L'option Décor l'enlève.
- Chaque terme de trading affiché à l'écran est souligné. À sa première apparition, sa définition s'ouvre. Le glossaire complet s'ouvre avec la touche G.

## Stack et architecture

- Vite + TypeScript strict, sans framework : DOM et CSS natifs. Le graphique est dessiné en Canvas 2D par le code du projet. Le projet n'a aucune dépendance d'exécution.
- Tests : Vitest pour le moteur (133 tests), Playwright pour deux tests de fumée dans un vrai navigateur.
- Hébergement : GitHub Pages, publié par GitHub Actions.

```
src/
  config.ts        tous les nombres du game design (un seul endroit pour équilibrer)
  engine/          logique pure, sans DOM, entièrement testable
    rng.ts         générateur pseudo-aléatoire à graine (mulberry32)
    market.ts      bougies, régimes cachés (bull, bear, range), news et gaps ; chemin d'une position qui respecte l'issue tirée
    indicators.ts  MM5, MM20, RSI 14, support, résistance, volume moyen, pente
    cards.ts       conditions de validité des 14 cartes Signal, rôle (retournement ou continuation)
    forecast.ts    contexte de marché, bonus des cartes, chance de toucher le take-profit, unité de risque u
    trade.ts       résolution d'une position : gap, stop-loss, take-profit, liquidation
    scoring.ts     formule de score et multiplicateurs
    run.ts         machine à états de la run et de la séance, Outils, consommables, entracte
    shop.ts        boutique
    life.ts        stress, épargne, poste et logement (GDD 13)
    review.ts      revue de marché affichée au retour d'un voyage
  data/            textes : Outils, consommables, événements, glossaire, activités
  ui/              un module par écran, plus chart.ts (Canvas), tooltip.ts et scene.ts (décor)
  sim/bot.ts       robot qui joue l'espérance de gain, pour l'équilibrage
scripts/sim.ts     5 000 runs par construction d'Outils, comparées au GDD
scripts/sim-stress.ts  effet du stress et des dépenses d'entracte (GDD 13.7)
tests/             tests unitaires (dont l'exemple chiffré du GDD rejoué à 1e-10 près)
e2e/               tests de fumée Playwright
docs/              game design document, décisions, avancement
```

L'état complet d'une run est un objet JSON. Il se sauvegarde tel quel dans le localStorage. Avec la même graine, chaque séance démarre sur le même marché, et les mêmes choix redonnent les mêmes trades.

## Lancer le projet

Il faut Node.js 22.

```bash
npm ci
npm run dev      # jeu sur http://localhost:5173
npm test         # tests unitaires
npm run e2e      # test de fumée (Playwright, Chromium)
npm run sim      # simulation d'équilibrage (environ 1 min)
npm run sim:stress  # simulation de la vie du trader (GDD 13.7)
npm run build    # vérification TypeScript et build de production dans dist/
```

## Équilibrage

Les quotas de la version 2.0 sont calibrés par `npm run sim` : un robot joue 5 000 runs par construction d'Outils. Il choisit les cartes et la taille qui maximisent l'espérance de Performance, et passe quand elle est négative. Taux de réussite de chaque séance (en %, sur les runs qui l'atteignent), identiques au tableau 7.3 du GDD :

| Construction | S1 | S2 | S3 | S4 | S5 | S6 | S7 | S8 | Runs gagnées |
|---|---|---|---|---|---|---|---|---|---|
| Aucun Outil | 88 | 84 | 76 | 66 | 49 | 28 | 18 | — | 0,4 % |
| Communs seulement | 88 | 85 | 79 | 72 | 60 | 44 | 30 | 34 | 1,2 % |
| Synergies | 88 | 85 | 79 | 72 | 81 | 80 | 74 | 74 | 15,2 % |

Sans Outil, une run gagne rarement : la boutique est indispensable, comme dans Balatro. Le marché respecte la chance affichée à 4 points près, et 7 % des positions sont fermées par un gap de news.

## Déploiement

Le workflow `.github/workflows/deploy.yml` publie le jeu à chaque push sur `main`. Avant le premier déploiement, il faut aller dans **Settings > Pages** et choisir **GitHub Actions** comme source. Le workflow `ci.yml` lance le build, les tests et le test de fumée sur chaque pull request.

## Documentation

- [Game design document](docs/gdd.md) : règles, formules, Outils, glossaire. Il fait autorité.
- [Décisions d'implémentation](docs/DECISIONS.md) : les cas que le GDD ne précise pas, et le choix retenu.
- [Avancement](docs/PROGRESS.md)
- [Prompt de développement](docs/prompt-claude-code.md) : les 8 jalons suivis pour coder le prototype.

## Auteur

Game design : Antoine Cayuela, étudiant en BTS SIO (Lyon). Code écrit avec Claude Code à partir du GDD.
