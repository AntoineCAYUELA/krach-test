# Avancement du prototype

Jalons du prompt docs/prompt-claude-code.md.

| Jalon | État |
|---|---|
| 1. Projet Vite + TS strict + Vitest + config + rng | Fait |
| 2. Marché et indicateurs | Fait |
| 3. Cartes, trade et score | Fait (exemple GDD 5.3 rejoué à 1e-6 près) |
| 4. Séance, run, Outils, consommables, boutique, simulation | Fait (`npm run sim` : toutes les cases vérifiées à ±5 points du GDD) |
| 5. Écran de trading jouable | Fait (graphique Canvas, main, ticket avec aperçu en direct, animation, décomposition du score) |
| 6. Autres écrans, glossaire, infobulles | Fait (9 écrans du GDD 9, glossaire G, infobulles de première rencontre, avertissement de risque ; test : glossaire = GDD 10 mot pour mot) |
| 7. Sauvegarde, README, GitHub Pages | Fait (run sauvegardée après chaque action, graine affichée et rejouable, workflow de déploiement ; reste à activer Pages : Settings > Pages > Source = GitHub Actions) |
| 8. Test de fumée Playwright | Fait (`npm run e2e`, aussi lancé par la CI sur chaque pull request) |

## Problèmes connus
- Aucun pour l'instant.
