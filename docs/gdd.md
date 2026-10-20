# Krach Test — Game Design Document (MVP)

*Titre provisoire. Version 2.0 du 20/10/2026 : refonte du cœur du jeu autour d'une prévision affichée (sections 2.3, 2.7, 5, 6, 7). La section 13 (la vie du trader) date de la version 1.2. Cible technique : navigateur, HTML/CSS/TypeScript, sans serveur.*

Conventions du document :
- **$** = argent du compte de trading (capital). **P** = Primes, la monnaie de la boutique. **€** = épargne personnelle (section 13).
- Les pourcentages de prix sont relatifs au prix d'entrée. Les termes en *italique* sont définis au glossaire (section 10).

---

## 1. Pitch

1. Tu es un trader junior qui doit tenir 8 séances de bourse. À chaque tour, tu choisis *long* ou *short*, jusqu'à 3 cartes Signal et une taille de position, sur une action fictive dont le graphique s'affiche en *chandeliers japonais*. Avant de valider, le jeu affiche ta chance de toucher le *take-profit*, ce que tu gagnes et ce que tu perds. Tu dois atteindre un quota de Performance avant la clôture, sinon tu es viré.
2. Une carte Signal (RSI survendu, marteau, rebond sur support…) ne compte que si le graphique confirme réellement le signal, et elle vaut plus ou moins selon le contexte du marché : un *retournement* marche sans tendance, une *cassure* marche en tendance. Tes Outils (stop-loss discipliné, effet de levier, analyste quant…) se combinent en synergies comme les jokers de Balatro.
3. Chaque partie t'apprend en jouant à lire un graphique, à raisonner en *taux de réussite*, *ratio risque/rendement* et *espérance de gain*, et à comprendre pourquoi le levier et les frais peuvent ruiner un compte, avec un glossaire qui définit chaque terme dès sa première apparition.

---

## 2. Boucle de jeu

### 2.1 La run (une partie)

1. Le joueur démarre avec **1 000 $** de capital, **4 P**, un deck de 20 cartes Signal, 0 Outil.
2. La run enchaîne **8 séances**, regroupées en 4 semaines de 2 séances. La 2e séance de chaque semaine est une **séance à événement** (boss).
3. Avant chaque séance : écran de briefing (action tirée au hasard, quota, contrainte éventuelle).
4. Après chaque séance réussie : bilan, gain de Primes, puis boutique.
5. La run se termine par une victoire (séance 8 réussie) ou une défaite (section 8).
6. **Le capital est persistant** entre les séances : les gains et pertes réels s'accumulent sur toute la run.

### 2.2 La séance (une manche)

Ressources de départ de chaque séance :

| Ressource | Valeur | Rôle |
|---|---|---|
| Ordres | 5 | Nombre de positions ouvrables (équivalent des mains de Balatro). |
| Défausses | 3 | Nombre de fois où l'on peut défausser des cartes et repiocher. |
| Bougies | 24 | Temps disponible. Une position consomme 3 bougies, passer en consomme 1. |
| Main | 7 cartes | Piochées dans le deck, mélangé au début de chaque séance. |

- Le graphique affiche les **40 bougies d'historique** générées avant le début de la séance, pour que les indicateurs soient calculables dès le premier tour.
- La séance se termine dès que l'une de ces conditions est remplie : Performance ≥ quota (victoire immédiate à la fin du tour en cours), ordres = 0, ou bougies restantes < 3.
- Chaque ordre non utilisé rapporte +1 P en fin de séance réussie.

### 2.3 Le tour

Un tour correspond à une décision. Étapes :

1. **Lecture** : le joueur voit le graphique (chandeliers, volume, *MM5*, *MM20*, *RSI* 14, lignes de *support* et *résistance*), le contexte de marché (section 2.7), sa main, ses Outils et ses ressources.
2. **Choix de la direction** : *long* ou *short*. Le jeu affiche aussitôt, sur chaque carte de la main, ✔ (valide) ou ✘ (invalide) avec la raison en une ligne (ex. « RSI = 41, il faut < 30 »), et pour une carte valide son bonus de chance dans le contexte (ex. « +12 % : retournement sans tendance »).
3. **Choix de l'action**, une des trois :
   - **Défausser** : sélectionner 1 à 7 cartes, les défausser, repiocher autant. Coût : 1 défausse, 0 bougie. Retour à l'étape 1.
   - **Passer** : laisser le marché avancer d'1 bougie sans position. Coût : 1 bougie, 0 ordre. Retour à l'étape 1.
   - **Ouvrir une position** : passer à l'étape 4.
4. **Ticket d'ordre** : choisir 0 à 3 cartes à jouer et une taille de position. Le *stop-loss* et le *take-profit* sont placés automatiquement (section 2.7).

| Taille | Mise | Levier | Notionnel |
|---|---|---|---|
| Prudent | 50 % du capital | ×1 | 0,5 × capital |
| Normal | 50 % du capital | ×2 | 1 × capital |
| Agressif | 100 % du capital | ×2 (×5 avec l'Outil Effet de levier) | 2 × capital (5 × capital) |

   Le ticket affiche en direct : la chance de toucher le take-profit et son détail, le gain au take-profit, la perte au stop-loss, l'*espérance de gain*, le risque en % du capital, le *notionnel* et les frais.
5. **Exécution** : entrée au prix de clôture de la dernière bougie, ajusté du *spread* (section 5).
6. **Tirage et déroulé** : le jeu tire l'issue avec la chance affichée (section 2.7), puis génère 3 bougies qui la respectent, animées une par une (0,6 s chacune).
7. **Clôture** : au niveau touché (stop-loss ou take-profit), ou au prix d'Open si une news fait sauter un niveau par un *gap* (section 5.2). Si la position est fermée avant la 3e bougie, les bougies restantes du tour s'affichent quand même (le temps est consommé).
8. **Score** : affichage décomposé de la formule (section 5), mise à jour du capital et de la Performance.
9. Les cartes jouées partent à la défausse, la main est complétée à 7. Retour à l'étape 1.

**Cas limite : aucun trade.** Passer est autorisé et coûte seulement du temps (1 bougie sur 24). Qui passe trop n'a plus de bougies pour ses 5 ordres : attendre un meilleur contexte ou une meilleure main est une vraie compétence, dans un temps limité.

### 2.4 Le marché : génération des prix

Le MVP contient **un marché d'actions** avec 3 actions fictives. Chaque séance en tire une au hasard.

| Action | Profil | Volatilité σ par bougie | Volume de base |
|---|---|---|---|
| Lugdunum Énergie (LGE) | Défensive | 1,2 % | 10 000 |
| Nexacorp (NXC) | Standard | 1,5 % | 10 000 |
| Rhône Robotics (RHR) | Tech volatile | 2,0 % | 10 000 |

**Régime de marché caché.** Le marché est à chaque instant dans un régime : *bull market*, *bear market* ou *range*. Régime initial tiré avec les probabilités 30 % / 30 % / 40 %. À chaque bougie, 4 % de chance de basculer vers l'un des deux autres régimes (au hasard). Le régime n'est pas affiché pendant la séance ; il est révélé dans le bilan (courbe colorée par régime). Il façonne le graphique entre les positions : tendances, ranges, supports et résistances. Le joueur voit à la place le contexte calculé sur le graphique (section 2.7), qui correspond au vrai régime environ une fois sur deux (mesuré au simulateur).

**Génération d'une bougie** (10 ticks par bougie, prix P, référence P_ref = prix au début du régime courant) :

```
pour chaque tick (10 fois) :
  dérive    = μ / 10           // μ = +0,3 % (bull), −0,3 % (bear), 0 (range)
  rappel    = −κ × ln(P / P_ref) / 10   // κ = 0,3, uniquement en range
  bruit     = σ / √10 × Z      // Z ~ loi normale centrée réduite
  P = P × exp(dérive + rappel + bruit)
Open = Close précédent (ou Open avec gap si news)
High = max des ticks (Open inclus), Low = min, Close = dernier tick
Volume = V_base × (1 + 2 × |Close/Open − 1| / σ) × exp(N(0 ; 0,3)) × (3 si news)
```

**News.** À chaque bougie, 4 % de chance d'une news. Un titre s'affiche avec un sentiment (positif / négatif), ex. « NXC : résultats trimestriels supérieurs aux attentes ». Le prix fait un *gap* à l'ouverture de 3 % à 6 % (tirage uniforme), dans le sens du sentiment dans 70 % des cas, dans le sens opposé dans 30 % des cas (« le marché avait déjà anticipé »). Volume ×3 sur cette bougie.

**Aléatoire reproductible.** Utiliser un générateur pseudo-aléatoire initialisé par une graine (ex. mulberry32) ; la graine de la run s'affiche sur l'écran de fin pour rejouer une partie.

**Pendant une position**, les bougies ne suivent pas ce modèle libre : elles sont générées pour respecter l'issue tirée (section 2.7). Les news déjà tirées (et annoncées par le Calendrier économique) sont gardées.

Tous ces paramètres (μ, κ, σ, probabilités) sont regroupés dans un fichier de configuration unique pour l'équilibrage.

### 2.5 Indicateurs calculés

- **MM5 / MM20** : moyenne simple des 5 / 20 derniers Close.
- **RSI 14** : sur les 14 dernières variations de Close, RSI = 100 − 100 / (1 + somme des hausses / somme des baisses). Si aucune baisse : 100.
- **Support** : plus bas des Low des 20 bougies précédant la dernière. **Résistance** : plus haut des High sur la même fenêtre.
- **Volume moyen** : moyenne des volumes des 20 bougies précédant la dernière.
- **Pente de tendance** : MM20 actuelle − MM20 d'il y a 5 bougies.

### 2.6 Les cartes Signal

Chaque condition est évaluée sur la dernière bougie close (t). Une carte est **valide** si sa condition est vraie **et** si sa direction correspond à celle de la position.

| Carte | Famille | Rôle | Direction | Condition de validité | Exemplaires (deck de départ) |
|---|---|---|---|---|---|
| Marteau | Chandelier | Retournement | Long | Mèche basse ≥ 2 × corps, mèche haute ≤ corps, Close < MM20 | 1 |
| Étoile filante | Chandelier | Retournement | Short | Mèche haute ≥ 2 × corps, mèche basse ≤ corps, Close > MM20 | 1 |
| Avalement haussier | Chandelier | Retournement | Long | Bougie t−1 rouge, bougie t verte, Open(t) ≤ Close(t−1) et Close(t) ≥ Open(t−1) | 1 |
| Avalement baissier | Chandelier | Retournement | Short | Symétrique de l'avalement haussier | 1 |
| RSI survendu | Indicateur | Retournement | Long | RSI < 30 | 2 |
| RSI suracheté | Indicateur | Retournement | Short | RSI > 70 | 2 |
| Golden cross | Indicateur | Continuation | Long | MM5 > MM20 maintenant, et MM5 ≤ MM20 sur au moins une des 3 bougies précédentes | 1 |
| Death cross | Indicateur | Continuation | Short | Symétrique du golden cross | 1 |
| Rebond sur support | Niveau | Retournement | Long | Low(t) ≤ support × 1,01 et Close(t) > support | 2 |
| Rejet de résistance | Niveau | Retournement | Short | High(t) ≥ résistance × 0,99 et Close(t) < résistance | 2 |
| Cassure haussière | Niveau | Continuation | Long | Close(t) > résistance | 1 |
| Cassure baissière | Niveau | Continuation | Short | Close(t) < support | 1 |
| Pic de volume | Volume | Continuation | Sens de la bougie t | Volume(t) ≥ 2 × volume moyen ; valide en long si bougie verte, en short si rouge | 2 |
| Volume confirmant | Volume | Continuation | Sens des 3 dernières bougies | Moyenne des volumes t−2 à t ≥ 1,3 × volume moyen ; long si Close(t) > Close(t−3), short sinon | 2 |

Rôle : un **retournement** parie que le mouvement en cours s'inverse ; une **continuation** parie qu'il continue. Le bonus de chance de chaque carte dépend de son rôle et du contexte (section 2.7) : un signal ne vaut que dans son contexte.

### 2.7 La prévision : contexte, chance, stop-loss et take-profit

**Contexte de marché**, affiché en permanence et calculé sur le graphique visible :
- pente relative = (MM20(t) − MM20(t−5)) / MM20(t) ;
- **tendance haussière** si la pente ≥ +0,6 % et Close > MM20 ;
- **tendance baissière** si la pente ≤ −0,6 % et Close < MM20 ;
- **sans tendance** sinon.

**Unité de risque u** = 2 × σ de l'action (après la contrainte d'événement) pour une position de 3 bougies, × √(1/3) pour une position d'1 bougie (Scalpeur). Exemple : Nexacorp, σ = 1,5 %, u = 3 %.

**Stop-loss et take-profit automatiques** : stop-loss à 1 u du prix d'entrée, take-profit à 1,5 u, soit un *ratio risque/rendement* de 1,5 (2 avec l'Outil Take-profit méthodique).

**Chance de toucher le take-profit :**

```
Chance de base = stop / (stop + take)                          // 1 / (1 + 1,5) = 40 %
Chance         = Chance de base + bonus des cartes valides + confluence (+ Rapport d'analyste)
                 bornée entre 5 % et 85 %
Confluence     = +4 points par famille de cartes valides au-delà de la première
```

Pourquoi 40 % de base : sur un marché sans avantage, un prix qui doit monter de 1,5 u avant de baisser de 1 u y arrive une fois sur 2,5. À 40 %, l'espérance de gain est nulle avant frais, donc négative après : trader sans signal fait perdre de l'argent.

**Bonus de chance d'une carte valide** (en points de pourcentage) :

| Rôle | Sans tendance | Dans le sens de la tendance | Contre la tendance |
|---|---|---|---|
| Retournement | +12 | +8 (repli dans la tendance) | 0 |
| Continuation | −6 (souvent un faux signal) | +12 | 0 |

« Dans le sens de la tendance » : long en tendance haussière, short en tendance baissière.

**Le marché respecte la chance affichée.** À l'ordre, le jeu tire un nombre entre 0 et 1 ; s'il est inférieur à la chance, le take-profit sera touché, sinon le stop-loss. Les bougies de la position sont générées pour respecter cette issue : le prix suit un pont brownien (un trajet aléatoire qui finit en un point fixé) jusqu'au niveau visé, atteint entre 25 % et 100 % de la durée de la position, sans toucher l'autre niveau. Après la sortie, le marché redevient libre jusqu'à la fin de la position. Seule exception : une news dont le gap saute un niveau ferme la position à l'Open, quelle que soit l'issue tirée (*slippage*, section 5.2). Mesuré au simulateur (7.3) : 7 % des positions sont fermées par un gap de news, et entre 30 % et 80 % de chance affichée, le taux de take-profit réel reste à 4 points près.

**Espérance de gain** = chance × gain au take-profit + (1 − chance) × perte au stop-loss. Le ticket l'affiche en $.

---

## 3. Correspondance avec Balatro

| Balatro | Krach Test | Concept de trading réel enseigné |
|---|---|---|
| Cartes à jouer | Cartes Signal | Les signaux d'*analyse technique* (chandeliers, indicateurs, niveaux, volume). |
| Main de poker (paire, couleur…) | Setup (combinaison de signaux valides) | La *confluence* : plusieurs signaux indépendants qui concordent rendent un trade plus solide. |
| Jetons (chips) | P&L net | Le *P&L* réalisé, une fois les frais et le spread payés. |
| Multiplicateur (mult) | Multiplicateur de conviction | La qualité du processus de décision, jugée indépendamment du résultat. |
| — | Chance affichée sur le ticket | Le *taux de réussite*, le *ratio risque/rendement* et l'*espérance de gain* d'un trade. |
| Mains par manche | Ordres (5) | Le nombre de trades est une ressource ; surtrader coûte des frais. |
| Défausses | Défausses (3) | Écarter les signaux non pertinents. |
| Jokers | Outils (15) | Outils et méthodes réels : stop-loss, levier, journal de trading, gestion du risque. |
| Blind (score à atteindre) | Séance avec quota de Performance | L'objectif de performance fixé à un trader par sa banque. |
| Boss blind | Séance à événement | Les conditions de marché difficiles : *krach*, range, *frais* élevés, saison des résultats. |
| Ante | Semaine (2 séances) | — |
| Boutique | Boutique | — |
| Tarots / Planètes | Consommables | Rapports d'analyste, *couverture*, formation. |
| Argent ($) | Primes (P) | La prime de performance d'un trader. |

---

## 4. Ressources

| Ressource | Départ | Persistance | Rôle |
|---|---|---|---|
| Capital ($) | 1 000 $ | Toute la run | Argent réel du compte. Détermine la taille des positions. Varie uniquement du P&L net. |
| Performance | 0 | Remise à 0 à chaque séance | Score de la séance, comparé au quota. |
| Quota | Voir 7.1 | Par séance | Performance minimale à atteindre. |
| Ordres | 5 | Par séance | Positions ouvrables. |
| Défausses | 3 | Par séance | Repioches. |
| Bougies | 24 | Par séance | Temps. |
| Primes (P) | 4 P | Toute la run | Monnaie de boutique, distincte du capital. |
| Emplacements d'Outils | 5 | — | Nombre maximum d'Outils possédés. |
| Emplacements de consommables | 2 | — | Nombre maximum de consommables possédés. |

**Gains de Primes en fin de séance réussie :**
- Séance normale : +3 P. Séance à événement : +5 P.
- +1 P par ordre non utilisé.
- *Intérêts* : +1 P par tranche complète de 250 $ de capital, maximum +4 P.

---

## 5. Formule de score

### 5.1 Formules

```
Mise, Levier       = selon la taille de position (section 2.3)
Notionnel N        = Mise × Levier
Prix d'entrée E    = Close(t) × (1 + s/2) en long ; Close(t) × (1 − s/2) en short     // s = spread = 0,20 %
Stop-loss          = E × (1 − u) en long ; E × (1 + u) en short                       // u : section 2.7
Take-profit        = E × (1 + 1,5 u) en long ; E × (1 − 1,5 u) en short
Prix de sortie X   = niveau touché, ou Open si un gap de news saute un niveau
Sortie ajustée X'  = X × (1 − s/2) en long ; X × (1 + s/2) en short
Rendement r        = X'/E − 1 en long ; 1 − X'/E en short
P&L brut           = N × r
Frais              = 2 × f × N            // f = 0,10 % par côté (entrée + sortie)
P&L net            = P&L brut − Frais
Capital            = Capital + P&L net

Résultat           = P&L net
Multi total        = (Multi de setup + somme des bonus additifs) × produit des bonus multiplicatifs
Performance du trade  = Résultat × Multi total      si Résultat ≥ 0
                      = Résultat × 0,5              si Résultat < 0    // pénalité, sans Multi ; 0,25 au stop-loss avec Stop-loss discipliné
Performance de séance = max(0 ; Performance de séance + Performance du trade)   // jamais négative
```

**Multi de setup** (cartes invalides ignorées, maximum 3 cartes jouées) :

| Setup | Cartes valides | Multi |
|---|---|---|
| Trade au feeling | 0 | ×1 |
| Signal isolé | 1 | ×1,5 |
| Double signal | 2, même famille | ×2 |
| Confluence | 2, familles différentes | ×2,5 |
| Triple signal | 3, deux familles | ×3 |
| Confluence totale | 3, trois familles | ×4 |

Pourquoi une pénalité à 50 % : une perte compte contre le quota, comme pour un vrai trader jugé sur son P&L, mais sans excès. Elle n'est pas multipliée et la Performance de séance ne descend jamais sous 0, donc un mauvais départ ne condamne pas la séance. La perte entière frappe déjà le capital, et donc toutes les positions futures.

Les Points d'analyse de la version 1 sont supprimés : une carte valide rapporte maintenant par la chance qu'elle ajoute et par le Multi de setup.

### 5.2 Ordre de résolution pendant les 3 bougies

1. **Tirage de l'issue** à l'ordre : take-profit si le tirage est inférieur à la chance affichée, stop-loss sinon (section 2.7).
2. **À chaque bougie, gap à l'ouverture** : si une news fait ouvrir le prix au-delà du stop-loss ou du take-profit, la position est fermée au prix d'Open, en perte ou en gain, quelle que soit l'issue tirée. C'est le *slippage* réel lors d'un gap.
3. **Sinon**, le prix suit son chemin jusqu'au niveau de l'issue tirée, et la position est fermée exactement à ce niveau.

La règle de liquidation (perte latente ≥ 80 % de la mise : toute la mise est perdue) reste dans le moteur, mais le stop-loss automatique l'empêche en pratique. Au pire, une position ×5 surprise par un gap de news perd environ 60 % de sa mise (Rhône Robotics pendant le Krach : u = 6 %, gap de 6 %).

### 5.3 Exemple chiffré d'un tour complet

Situation : séance 3 (quota 120), capital 1 000 $, Outil possédé : Chartiste (+1,5 Multi par carte Niveau valide). Action NXC (σ = 1,5 %, donc u = 3 %), dernière bougie close à 50,00 $, contexte **sans tendance**. RSI = 27, le Low de la bougie a touché le support à 49,60 $ et le Close est au-dessus.

1. Direction : **long**. Cartes jouées : RSI survendu (✔, RSI 27 < 30, retournement sans tendance : +12), Rebond sur support (✔, retournement sans tendance : +12), Pic de volume (✘, volume = 1,4 × moyenne).
2. Chance = 40 % + 12 + 12 + 4 (confluence de 2 familles) = **68 %**.
3. Taille **Normal** : mise 50 % = 500 $, levier ×2 → **N = 1 000 $**.
4. Entrée : E = 50,00 × 1,001 = **50,05 $**. Stop-loss : 50,05 × 0,97 = **48,5485 $**. Take-profit : 50,05 × 1,045 = **52,30225 $**.
5. Gain au take-profit : X' = 52,30225 × 0,999 = 52,24994775 $ ; r = +4,3955 % ; P&L brut = 43,955 $ ; frais = 2 × 0,1 % × 1 000 = 2,00 $ ; **P&L net = +41,955 $**.
6. Perte au stop-loss : X' = 48,5485 × 0,999 = 48,4999515 $ ; r = −3,097 % ; P&L brut = −30,97 $ ; **P&L net = −32,97 $**.
7. Espérance de gain = 0,68 × 41,955 + 0,32 × (−32,97) = **+17,98 $**. Le ticket affiche ces trois nombres avant la validation.
8. Multi : 2 cartes valides de familles différentes (Indicateur + Niveau) → Confluence ×2,5. Chartiste : +1,5 (une carte Niveau valide). Multi total = (2,5 + 1,5) × 1 = **4**.
9. Tirage 0,41 < 0,68 : le take-profit est touché. Capital → 1 041,955 $. **Performance = 41,955 × 4 = 167,82** ≥ 120 → séance gagnée à la fin du tour, avec 4 ordres non utilisés (+4 P). Les calculs gardent toute la précision ; seul l'affichage arrondit au centime.

Variante perdante : tirage 0,85 ≥ 0,68, le stop-loss est touché à 48,5485 $. Capital → 967,03 $. Résultat = −32,97 (< 0), donc Performance du trade = −32,97 × 0,5 = **−16,485**. Si la Performance de séance était à 30, elle passe à 13,515 ; si elle était à 0, elle reste à 0.

---

## 6. Les 15 Outils du MVP

Rareté et apparition en boutique : Commun 70 %, Peu commun 25 %, Rare 5 %. Prix de revente = moitié du prix d'achat, arrondie à l'entier inférieur.

| # | Nom | Effet | Rareté | Prix | Concept enseigné |
|---|---|---|---|---|---|
| 1 | Stop-loss discipliné | Un trade fermé au stop-loss ne retire que 25 % de sa perte à la Performance, au lieu de 50 %. +1 P par position fermée au stop-loss. | Commun | 4 P | Une perte coupée au stop-loss est une perte maîtrisée : elle fait partie du métier. |
| 2 | Take-profit méthodique | Take-profit à 2 u au lieu de 1,5 u : ratio risque/rendement de 2, la chance de base passe de 40 % à 33 %. | Commun | 4 P | Viser plus loin rapporte plus par trade gagnant, mais on gagne moins souvent. |
| 3 | Courtier low-cost | Frais : 0,10 % → 0,04 % par côté. | Commun | 3 P | Les frais de courtage réduisent chaque P&L. |
| 4 | Teneur de marché | Spread : 0,20 % → 0,08 %. | Commun | 3 P | Le spread est un coût caché payé à chaque trade. |
| 5 | Lecteur de chandeliers | +1 Multi (additif) par carte Chandelier valide jouée. | Commun | 4 P | Les figures de chandeliers résument la bataille acheteurs/vendeurs. |
| 6 | Oscillateur RSI | Seuils RSI : 35/65 au lieu de 30/70. | Commun | 4 P | Élargir les seuils donne plus de signaux, mais moins fiables. |
| 7 | Calendrier économique | Les news sont annoncées 2 bougies à l'avance (titre et sentiment, pas le résultat). | Commun | 4 P | Le calendrier économique permet d'anticiper les moments de forte volatilité. |
| 8 | Chartiste | +1,5 Multi (additif) par carte Niveau valide jouée. | Peu commun | 6 P | Les supports et résistances sont des zones où le prix réagit souvent. |
| 9 | Effet de levier | Taille Agressif : levier ×2 → ×5. | Peu commun | 6 P | Le levier multiplie gains ET pertes : à ×5, chaque stop-loss coûte environ 15 % du capital. |
| 10 | Vendeur à découvert | +1 Multi (additif) sur les positions short. | Peu commun | 5 P | Le short permet de gagner quand le prix baisse. |
| 11 | Suiveur de tendance | ×1,5 Multi si la direction correspond au signe de la pente de tendance (MM20). | Peu commun | 6 P | « The trend is your friend » : trader dans le sens de la tendance. |
| 12 | Scalpeur | Débloque les positions d'1 bougie (1 ordre, 1 bougie de temps, u × √(1/3)). +1 Multi (additif) sur ces positions. | Peu commun | 5 P | Le scalping multiplie les trades courts ; les frais pèsent lourd. |
| 13 | Règle des 2 % | ×2 Multi si le risque du trade (notionnel × distance du stop-loss) ≤ 2 % du capital. | Rare | 8 P | Gestion du risque : ne jamais risquer plus de 1 à 2 % du capital par trade. |
| 14 | Carnet de trading | +0,5 Multi (additif) permanent pour la run à chaque trade gagnant joué avec au moins 2 cartes valides. Plafond : +4. | Rare | 8 P | Le journal de trading fait progresser par l'analyse de ses trades. |
| 15 | Analyste quant | ×2 Multi si le setup contient des cartes valides d'au moins 2 familles. | Rare | 10 P | L'analyse quantitative combine des signaux indépendants. |

**Synergies explicites :**

1. **Règle des 2 % + taille Prudent** : un trade Prudent risque 0,5 × u du capital, soit 1,5 % avec u = 3 %. Il obtient ×2 et rapporte autant de Performance qu'un trade Normal, pour la moitié du risque. Le jeu récompense exactement le calcul de taille de position d'un vrai trader.
2. **Effet de levier + Stop-loss discipliné** : à ×5, chaque stop-loss coûte environ 15 % du capital. Le Stop-loss discipliné ne protège pas le capital, mais divise par deux la pénalité de Performance : le levier devient jouable pour le score, et le joueur voit pourquoi les traders pros le limitent.
3. **Take-profit méthodique + bonnes cartes** : avant frais, l'espérance d'un trade vaut (1 + ratio) × avantage × u, où l'avantage est la chance gagnée par les cartes. Passer d'un ratio de 1,5 à 2 multiplie la valeur de chaque point de chance par 1,2.
4. **Scalpeur + Courtier low-cost + Teneur de marché** : une position d'1 bougie vise u ≈ 1,7 % (NXC) ; frais + spread coûtent 0,40 % aller-retour au départ (un quart de u), 0,16 % avec les deux Outils. Sans eux, le Scalpeur perd de l'argent sur le long terme.
5. **Chartiste + Lecteur de chandeliers + Analyste quant** : Rebond sur support + Marteau = Confluence. Multi = (2,5 + 1,5 + 1) × 2 = **×10**.
6. **Vendeur à découvert + Suiveur de tendance** : en tendance baissière (dont la séance Krach), un short avec Signal isolé vaut (1,5 + 1) × 1,5 = ×3,75.

### 6.1 Consommables (6)

Utilisables à tout moment pendant une séance, sauf pendant le déroulé d'une position. Usage unique.

| Nom | Effet | Prix | Concept enseigné |
|---|---|---|---|
| Rapport d'analyste | +10 % de chance sur le prochain trade. | 3 P | Un rapport de recherche aide à décider, sans garantir l'avenir. |
| Formation | +0,5 Multi permanent sur un type de setup choisi (cumulable). | 3 P | La pratique d'une stratégie précise améliore son exécution. |
| Pack de signaux | Choisir 1 carte Signal parmi 3 proposées et l'ajouter au deck ; ou retirer 1 carte du deck. | 4 P | Construire sa propre stratégie, c'est choisir quels signaux on suit. |
| Couverture | Le prochain trade voit son P&L net multiplié par 0,5 (gain comme perte). | 3 P | Une couverture (hedge) réduit le risque, mais réduit aussi le gain. |
| Ordre supplémentaire | +1 ordre pour la séance en cours. | 3 P | — |
| Boule de cristal | Montre l'issue du prochain trade avant de le confirmer : take-profit ou stop-loss (hors news). | 5 P | Aucun : pouvoir surnaturel, voir section 11. |

**Boutique** : 2 Outils + 2 consommables par visite. Relance : 2 P, +1 P à chaque relance dans la même visite.

---

## 7. Progression

### 7.1 Courbe des quotas

| Séance | Semaine | Type | Quota de Performance | Contrainte |
|---|---|---|---|---|
| 1 | 1 | Normale | 60 | — |
| 2 | 1 | Événement | 80 | Tirée dans la liste 7.2 |
| 3 | 2 | Normale | 120 | — |
| 4 | 2 | Événement | 180 | Tirée dans la liste 7.2 |
| 5 | 3 | Normale | 300 | — |
| 6 | 3 | Événement | 500 | Tirée dans la liste 7.2 |
| 7 | 4 | Normale | 800 | — |
| 8 | 4 | Événement finale | 1 300 | Krach (fixe) |

Croissance d'environ ×1,5 à ×1,6 par séance, comme les blinds de Balatro. La séance 2 monte peu car c'est déjà une séance à événement. Quotas calibrés au simulateur (7.3) pour la version 2.0.

### 7.2 Séances à événement

Les séances 2, 4 et 6 tirent une contrainte sans remise dans cette liste. La séance 8 est toujours le Krach.

| Événement | Effet chiffré | Leçon |
|---|---|---|
| Marché sans tendance | Régime forcé en range toute la séance. | Les signaux de tendance (cassures, croisements) piègent en range. |
| Jour de résultats | Probabilité de news : 4 % → 15 % par bougie. | Les annonces créent des gaps qui sautent par-dessus les stop-loss. |
| Frais doublés | Frais et spread ×2. | Les coûts de transaction tuent les stratégies à faible gain par trade. |
| Volatilité écrasée | σ ×0,5. | Peu de mouvement : il faut plus de taille ou plus de patience. |
| **Krach** (séance 8) | Régime forcé en bear market, σ ×1,5. | Dans un krach, les achats « pas chers » continuent souvent de baisser ; le short et le stop-loss protègent. |

### 7.3 Vérification de l'équilibrage

Commande : `npm run sim`, qui fait jouer 5 000 runs par construction au moteur du jeu. Le robot lit la prévision comme un joueur attentif :
- il choisit les cartes qui maximisent la Performance attendue (chance × gain × Multi + (1 − chance) × perte × 0,5) ;
- il ouvre si l'espérance de gain est positive ; sinon il défausse les cartes inutiles, puis il passe ; quand il n'a plus de temps à perdre, il trade quand même ;
- taille : la plus petite dont la Performance attendue, sur les ordres restants, couvre ce qui manque au quota ; sinon la plus grande ;
- il ne passe pas par la boutique : ses Outils sont fixés par la construction.

Taux de réussite par séance (parmi les runs qui atteignent cette séance) :

| Construction | S1 | S2 | S3 | S4 | S5 | S6 | S7 | S8 | Victoires |
|---|---|---|---|---|---|---|---|---|---|
| Aucun Outil | 88 % | 84 % | 76 % | 66 % | 49 % | 28 % | 18 % | — * | 0,4 % |
| Communs seulement | 88 % | 85 % | 79 % | 72 % | 60 % | 44 % | 30 % | 34 % | 1,2 % |
| Synergies | 88 % | 85 % | 79 % | 72 % | 81 % | 80 % | 74 % | 74 % | 15,2 % |

Constructions : « Communs » = Stop-loss discipliné dès S2, puis Courtier low-cost, Lecteur de chandeliers, Teneur de marché, Oscillateur RSI. « Synergies » = Stop-loss discipliné dès S2, puis Lecteur de chandeliers, Chartiste, Effet de levier (S5), Suiveur de tendance, Analyste quant. Contraintes simulées : S2 Marché sans tendance, S4 Jour de résultats, S6 Marché sans tendance, S8 Krach.

\* Moins de 60 runs atteignent la séance 8 avec cette construction : taux non fiable.

Lecture :
- Sans Outil, les séances 1 à 4 passent au moins 2 fois sur 3 ; la séance 6 passe une fois sur 4. Comme dans Balatro, la boutique est indispensable.
- L'Effet de levier fait le saut de la séance 5 : avec la taille Agressif ×5, les synergies passent 4 fois sur 5.
- Toute l'information est affichée : un humain qui joue bien joue à peu près comme le robot. Son avantage est la boutique, où il choisit ses Outils au lieu d'une construction fixe.
- Le simulateur Python de la version 1 (`jeu-trading/simulation/`) reste en archive ; il ne correspond plus aux règles.

---

## 8. Conditions de défaite et de victoire

**Défaite :**
1. **Quota manqué** : la séance se termine (ordres épuisés ou moins de 3 bougies restantes) avec Performance < quota. Écran « Tu es viré ».
2. **Compte liquidé** : le capital passe sous 10 $ (mise minimale), immédiatement, même en pleine séance. Écran « Margin call ».

**Cas limite : capital sous 10 $ en cours de séance.** Impossible en une seule position, grâce au stop-loss automatique. Le margin call arrive après une série de pertes, surtout en taille Agressif ×5, où chaque stop-loss coûte environ 15 % du capital. La run s'arrête aussitôt sur l'écran « Margin call », qui détaille la chaîne : taille, levier, pertes successives. Aucun renflouement.

**Victoire :** réussir la séance 8. L'écran de victoire affiche le capital final, le P&L total de la run en $ et en %, et la liste des termes appris.

---

## 9. Écrans du MVP

1. **Menu titre** : Nouvelle partie, Continuer (run sauvegardée en localStorage), Glossaire, Options.
2. **Avertissement et tutoriel** (premier lancement uniquement) : texte de risque (voir section 10, entrée « Risque de perte ») puis 3 écrans : lire une bougie, ouvrir une position, la formule de score.
3. **Briefing de séance** : numéro de séance, action tirée et son profil (σ), quota, contrainte d'événement avec son effet chiffré et sa leçon, ressources de départ.
4. **Écran de trading** (écran principal) :
   - Graphique en chandeliers (40 bougies d'historique + bougies de la séance), volume en barres sous le graphique, MM5 et MM20 superposées, panneau RSI avec lignes 30/70, lignes horizontales de support et de résistance. Chaque élément peut être masqué.
   - Barre d'état : capital, Performance / quota (barre de progression), ordres, défausses, bougies restantes, Primes.
   - Rangée d'Outils (5 emplacements) et de consommables (2 emplacements), avec infobulle d'effet.
   - Contexte de marché (tendance haussière, tendance baissière ou sans tendance), toujours visible.
   - Main de 7 cartes avec indicateur ✔/✘, sa raison et le bonus de chance une fois la direction choisie.
   - Ticket d'ordre : direction, taille (Prudent, Normal, Agressif), prévision (chance et son détail, gain au take-profit, perte au stop-loss, espérance de gain, risque en % du capital), notionnel et frais. Sur le graphique : lignes d'entrée, de stop-loss et de take-profit, avec la chance de chacun.
   - Boutons : Ouvrir la position, Défausser, Passer 1 bougie.
   - Bandeau de news quand une news tombe.
5. **Résolution du trade** (superposée à l'écran 4) : animation des 3 bougies, lignes d'entrée/SL/TP sur le graphique, puis décomposition ligne par ligne : chance affichée et issue, P&L brut, frais, P&L net, Multi de setup, chaque bonus d'Outil, Performance.
6. **Bilan de séance** : Performance vs quota, Primes gagnées (détail), capital avant/après, liste des trades (direction, cartes, P&L net), graphique de la séance coloré par régime réel.
7. **Boutique** : 2 Outils, 2 consommables, bouton Relancer, vente d'Outils, bouton Séance suivante.
8. **Fin de run** (défaite ou victoire) : cause, séance atteinte, capital final, meilleur trade, termes rencontrés, graine de la run, bouton Rejouer.
9. **Glossaire** : accessible depuis tous les écrans (touche G). Liste alphabétique, recherche, termes déjà rencontrés marqués.

**Règle des infobulles** : la première fois qu'un terme du glossaire apparaît à l'écran, il est souligné et une infobulle s'ouvre automatiquement avec sa définition (fermeture au clic). Ensuite, il reste souligné et sa définition s'affiche au survol.

---

## 10. Glossaire

| Terme | Définition |
|---|---|
| Appel de marge (margin call) | Avertissement du courtier quand la perte d'une position à levier menace de dépasser la mise ; sans nouvel apport, la position est liquidée. |
| Action | Part du capital d'une entreprise, échangée en bourse. Toutes les actions du jeu sont fictives. |
| Actif | Tout ce qui s'achète et se vend sur un marché : action, devise, crypto-monnaie, matière première. |
| Analyse quantitative | Approche qui prend des décisions à partir de règles chiffrées et de statistiques plutôt que de l'intuition. |
| Analyse technique | Étude des graphiques de prix et de volume pour tenter d'anticiper les mouvements. Son efficacité réelle est débattue. |
| Avalement (engulfing) | Figure de deux bougies où le corps de la seconde englobe celui de la première, en sens inverse. Signale un possible retournement. |
| Aversion à la perte | Biais psychologique : une perte fait plus mal qu'un gain du même montant ne fait plaisir, environ deux fois plus selon les travaux de Kahneman et Tversky. Elle pousse souvent à garder trop longtemps les positions perdantes. |
| Bear market | Marché baissier : les prix baissent durablement. |
| Bid / Ask | Bid : meilleur prix auquel on peut vendre. Ask : meilleur prix auquel on peut acheter. L'ask est toujours au-dessus du bid. |
| Bull market | Marché haussier : les prix montent durablement. |
| Carnet d'ordres | Liste de tous les ordres d'achat et de vente en attente sur un actif, à chaque prix. |
| Cassure (breakout) | Clôture du prix au-delà d'un support ou d'une résistance, souvent suivie d'une accélération. |
| CFD (Contract for Difference) | Contrat à levier qui paie la variation de prix d'un actif sans le posséder ; produit très risqué pour les particuliers. |
| Chandelier japonais (bougie, candlestick) | Représentation du prix sur une période avec 4 valeurs : ouverture, plus haut, plus bas, clôture. Verte si la clôture dépasse l'ouverture, rouge sinon. |
| Confluence | Plusieurs signaux indépendants qui indiquent la même direction au même moment. |
| Continuation | Signal qui parie que le mouvement en cours va continuer : cassure, golden cross, volume confirmant. Il marche surtout en tendance. |
| Corps | Partie épaisse de la bougie, entre l'ouverture et la clôture. |
| Couverture (hedge) | Position prise pour réduire le risque d'une autre. Elle réduit les pertes possibles mais aussi les gains. |
| Courtier (broker) | Intermédiaire qui exécute les ordres et se rémunère par des frais. |
| Crypto-monnaie | Actif numérique décentralisé (ex. bitcoin), échangé 24 h/24, en général bien plus volatil que les actions. |
| Death cross | La moyenne mobile courte passe sous la longue : signal baissier. |
| Dividende | Part des bénéfices qu'une entreprise verse à ses actionnaires. |
| Délit d'initié | Utiliser une information non publique pour trader. Illégal et sanctionné pénalement. |
| Espérance de gain | Gain moyen d'un trade si on le répétait un grand nombre de fois : chance de gain × gain + chance de perte × perte. Une stratégie à espérance négative finit par perdre, même avec de beaux trades isolés. |
| Étoile filante (shooting star) | Bougie à longue mèche haute et petit corps, après une hausse : possible retournement baissier. |
| Frais (commission) | Somme payée au courtier à chaque achat et chaque vente. Ils réduisent le P&L, même quand le trade gagne. |
| Gap | Écart entre la clôture d'une bougie et l'ouverture de la suivante, souvent causé par une news. |
| Gestion du risque | Ensemble des règles qui limitent ce qu'on peut perdre : stop-loss, taille de position, risque maximal par trade. |
| Golden cross | La moyenne mobile courte passe au-dessus de la longue : signal haussier. |
| Intérêts | Rémunération versée sur l'argent non investi. Dans le jeu, ils sont versés en Primes. |
| Journal de trading | Carnet où l'on note chaque trade et sa raison, pour analyser ses erreurs. |
| Krach | Chute brutale et générale des prix sur une courte période. |
| Levier | Multiplicateur qui permet de prendre une position plus grosse que sa mise. Il amplifie les gains et les pertes dans la même proportion. |
| Liquidation | Fermeture forcée d'une position à levier quand la perte approche le montant de la mise. On perd alors toute la mise. |
| Long | Position acheteuse : on gagne si le prix monte. |
| Marteau (hammer) | Bougie à longue mèche basse et petit corps, après une baisse : possible retournement haussier. |
| Mèche | Trait fin au-dessus ou au-dessous du corps, qui montre le plus haut et le plus bas atteints. |
| Mise (marge) | Part du capital engagée dans une position, perdue entièrement en cas de liquidation. |
| Moyenne mobile (MM5, MM20) | Moyenne des derniers prix de clôture (5 ou 20), recalculée à chaque bougie. Elle lisse le bruit et montre la tendance. |
| News | Information (résultats, annonce) qui fait bouger le prix brusquement. |
| Notionnel | Taille réelle d'une position : mise × levier. Les gains, pertes et frais sont calculés sur le notionnel. |
| OHLC | Open, High, Low, Close : ouverture, plus haut, plus bas, clôture d'une bougie. |
| P&L (Profit and Loss) | Gain ou perte d'un trade. Brut avant frais, net après frais ; latent tant que la position est ouverte, réalisé une fois fermée. |
| Pic de volume | Volume nettement supérieur à la moyenne : beaucoup d'intervenants ont agi, le mouvement est plus crédible. |
| Position | Pari ouvert sur un actif, en long ou en short, jusqu'à sa clôture. |
| Range | Marché sans tendance : le prix oscille entre un support et une résistance. |
| Ratio risque/rendement | Gain visé divisé par la perte acceptée. Avec un ratio de 1,5, on vise 1,50 $ de gain pour 1 $ risqué. |
| Régime de marché | État général du marché à un moment donné : haussier, baissier ou sans tendance. |
| Séance | Période d'ouverture de la bourse pendant laquelle on peut trader. Dans le jeu, une manche de 24 bougies. |
| Résistance | Zone de prix où la hausse a déjà été stoppée plusieurs fois. |
| Retournement | Signal qui parie que le mouvement en cours va s'inverser : marteau, RSI survendu, rebond sur support. Il marche surtout sans tendance. |
| Revenge trading | Trade ouvert pour « se refaire » juste après une perte, souvent plus gros et sans vrai signal. Il aggrave en général les pertes. |
| Revue de marché | Résumé de ce qui s'est passé sur un marché pendant une période : variation du cours, plus haut, plus bas, tendance, indicateurs et news. |
| Risque de perte | Le trading réel fait perdre de l'argent à la majorité des particuliers : en Europe, les courtiers doivent afficher la part de clients perdants sur les CFD, souvent entre 70 % et 80 %. Ce jeu est un entraînement, il ne prouve pas qu'on sait gagner sur un vrai marché. |
| RSI (Relative Strength Index) | Indicateur de 0 à 100 qui compare hausses et baisses récentes. Au-dessus de 70 : surachat ; en dessous de 30 : survente. |
| Scalping | Style de trading fait de nombreuses positions très courtes visant de petits gains. |
| Sentiment | Ton d'une news ou humeur générale du marché, positif ou négatif ; il influence le prix sans le déterminer. |
| Short (vente à découvert) | Position vendeuse : on gagne si le prix baisse. En réel, on emprunte l'actif pour le vendre et on le rachète plus tard. |
| Slippage | Écart entre le prix voulu et le prix réellement obtenu, par exemple quand un gap saute un stop-loss. |
| Spread | Écart entre le prix d'achat (ask) et le prix de vente (bid). On le paie à chaque aller-retour. |
| Stop-loss | Ordre qui ferme automatiquement une position quand la perte atteint un niveau fixé. Il limite la perte maximale. |
| Support | Zone de prix où la baisse a déjà été stoppée plusieurs fois. |
| Surachat / survente | Situation où le prix a monté (ou baissé) très vite ; un retour en arrière devient plus probable, sans être garanti. |
| Take-profit | Ordre qui ferme automatiquement une position quand le gain atteint un niveau fixé. |
| Taille de position | Montant engagé dans un trade, calculé pour que la perte au stop-loss reste dans la limite de risque choisie. |
| Taux de réussite | Part des trades gagnants. Il ne suffit pas à juger une stratégie : avec un ratio risque/rendement de 1,5, il faut gagner plus de 40 % du temps pour être rentable avant frais. |
| Teneur de marché (market maker) | Acteur qui propose en permanence un prix d'achat et de vente, et se rémunère sur le spread. |
| Tilt | Mot venu du poker : état de frustration après des pertes, où l'on prend des décisions impulsives. Un trader en tilt devrait arrêter et faire une pause. |
| Trade / trader | Un trade est une opération d'achat puis de vente (ou l'inverse) ; un trader est la personne qui les réalise. |
| Tendance | Direction générale du prix sur plusieurs bougies. |
| Volatilité | Ampleur moyenne des variations de prix. Plus elle est forte, plus les gains et les pertes possibles sont grands. |
| Volume | Nombre de titres échangés pendant une bougie. |

---

## 11. Simplifications par rapport au vrai trading

1. **Chances connues, signaux fiables par construction.** Le jeu affiche la chance exacte de chaque trade et le marché la respecte. Les bonus des cartes sont des choix de game design. Sur les vrais marchés, personne ne connaît ses chances, et l'avantage des signaux techniques est faible, instable et souvent nul après frais.
2. **Régimes à trois états.** Le vrai marché n'a pas de régime caché tiré au sort ; c'est un modèle pédagogique.
3. **Performance et Multi.** Le Multiplicateur est un score de jeu, pas de l'argent. Seul le capital suit une logique réaliste.
4. **Stop-loss et take-profit imposés** à 1 u et 1,5 u, et durée fixe de 3 bougies. Un vrai trader place ses niveaux selon le graphique (sous un support, par exemple) et ferme sa position quand il veut.
5. **Exécution instantanée** au Close ± spread, sans carnet d'ordres ; le seul slippage simulé est le gap qui saute un niveau.
6. **Frais** calculés deux fois sur le notionnel d'entrée, au lieu du montant réel à chaque côté.
7. **Short sans coût d'emprunt**, ni dividende à reverser ; levier sans frais de financement journaliers.
8. **Liquidation simplifiée** : seuil fixe à 80 % de perte de la mise, perte de 100 % de la mise ; le stop-loss automatique l'empêche en pratique.
9. **Calendrier économique** : le sentiment annoncé est juste à 70 %, une fiabilité arbitraire.
10. **Boule de cristal** : connaître l'issue d'un trade à l'avance est impossible. Le jeu la présente comme un pouvoir surnaturel. En réel, la seule façon de « savoir avant » serait une information non publique, ce qui est un délit d'initié.
11. **Intérêts versés en Primes**, pas au capital.
12. **Pas de fiscalité**, pas de cotation la nuit ni le week-end.

---

## 12. Périmètre

### 12.1 MVP (premier prototype)

- 1 marché d'actions, 3 actions fictives, générateur de prix de la section 2.4.
- 14 types de cartes Signal, deck de départ de 20 cartes, main de 7.
- 15 Outils, 6 consommables, boutique.
- 8 séances, 4 contraintes d'événement + Krach final.
- 9 écrans de la section 9, glossaire avec infobulles de première rencontre.
- Sauvegarde locale de la run, graine reproductible.

**Architecture suggérée** : logique de jeu en TypeScript pur, sans dépendance au DOM (générateur, règles, score), testable par des tests unitaires qui rejouent l'exemple de la section 5.3 ; rendu du graphique en Canvas ou avec une bibliothèque de chandeliers légère ; aucune dépendance serveur.

### 12.2 Après le MVP

1. **Crypto (v1.1).** Marché débloqué de façon permanente après avoir atteint la séance 5 une première fois ; il est ensuite proposé au choix pour les séances 5 à 8 des runs suivantes. Paramètres : σ 4 % à 6 % par bougie, news 8 %, frais 0,10 % mais spread 0,30 %. Justification : avec une volatilité trois fois supérieure, u vaut 8 à 12 % ; à ×5, un seul stop-loss coûte 40 à 60 % de la mise. Le joueur doit d'abord avoir appris le stop-loss, la taille de position et le levier sur des actions calmes. L'atteinte de la séance 5 garantit qu'il a déjà vécu au moins deux séances à événement.
2. **Nouveaux Outils** (objectif 40) et nouvelles cartes : nouveaux indicateurs et figures de chandeliers à trois bougies, chacun ajouté au glossaire.
3. **Méta-progression** : débloquer des Outils et des « stratégies de départ » (équivalents des decks de Balatro, ex. un deck Chartiste avec plus de cartes Niveau) ; mises de difficulté croissante.
4. **Mode expert** : indicateur ✔/✘ des cartes et chance du ticket masqués, régime jamais révélé.
5. **Autres marchés** : devises (levier élevé, faible volatilité), matières premières.
6. **Mode infini** après la séance 8.

---

## 13. Addendum : la vie du trader (v1.2)

Demandé par Antoine le 20/10/2026 : vue à la première personne devant un poste qui évolue (ordinateur portable, puis PC tour, puis double écran), appartement qui s'améliore, taux de stress à gérer, activités pour se détendre avec une revue de marché au retour d'un long voyage.

Principe : un joueur qui gère son stress joue à la difficulté calibrée en 7.3 ; un joueur qui l'ignore perd environ un tiers de ses chances de victoire. Le capital, les Primes et les quotas ne changent pas.

### 13.1 Nouvelles ressources

| Ressource | Départ | Persistance | Rôle |
|---|---|---|---|
| Stress | 15 sur 100 | Toute la run | Au-delà de 50, il réduit le Multi (13.2). |
| Épargne (€) | 60 € | Toute la run | Argent personnel : paie le poste, le logement et les activités. Ne sert jamais à trader. |
| Salaire | 60 € | Après chaque séance réussie | Fixe, versé par ta société de trading. |
| Poste | Ordinateur portable | Toute la run | Réduit le stress pris pendant les séances (13.4). |
| Logement | Studio | Toute la run | Fait récupérer entre deux séances (13.4). |

Trois caisses séparées : le capital ($) pour trader, les Primes (P) pour les Outils, l'épargne (€) pour ta vie. Comme dans la réalité, l'argent du loyer et des loisirs ne va jamais sur le compte de trading, et une perte de trading ne vide jamais l'épargne.

### 13.2 Le stress

**Ce qui le fait monter ou baisser :**

| Cause | Variation |
|---|---|
| Trade perdant | +3, plus 1,5 par % du capital perdu |
| Liquidation | +25 en plus |
| Trade gagnant | −2 |
| Levier au-delà de ×2, gagnant ou perdant | +3 par cran, par trade (×5 : +9) |
| Fin de séance (fatigue) | +10 |
| Début d'une séance à événement | +10 |
| Nuit au logement, à l'entracte | −10 à −30 selon le logement |
| Activité, à l'entracte | −15 à remise à 0 (13.3) |

- Un trade donne une seule variation : levier + perte (ou gain). Si elle est positive, on la multiplie par le facteur du poste. La fatigue de fin de séance est aussi multipliée par ce facteur.
- Chaque variation est arrondie à l'entier. Le stress reste entre 0 et 100.
- Une perte ajoute nettement plus de stress qu'un gain du même montant n'en retire : c'est l'*aversion à la perte*. Le levier stresse même quand on gagne.

**Exemple.** Avec un PC tour (×0,8), un trade à levier ×5 qui perd 4 % du capital : (3 + 1,5 × 4 + 9) × 0,8 = 14,4, arrondi à **+14**. Le même trade gagnant : (9 − 2) × 0,8 = 5,6, arrondi à **+6**.

**Effets.** L'état est fixé au début de chaque séance, après le +10 éventuel de l'événement, et vaut pour toute la séance. Le stress continue de bouger pendant la séance : il comptera pour la suivante.

| État | Stress | Effet pendant la séance |
|---|---|---|
| Calme | 0 à 49 | Aucun. |
| Nerveux | 50 à 79 | Multi de chaque trade ×0,8. |
| Tilt | 80 à 100 | Multi de chaque trade ×0,6. |

Le malus apparaît comme une ligne du calcul du Multi (« Stress : nerveux ×0,8 »), au même titre qu'un Outil multiplicatif. Il ne touche pas les trades perdants, qui n'ont pas de Multi (5.1). Le Multi mesure la qualité de la décision (section 3) : sous stress, on décide moins bien. En *tilt*, on fait du *revenge trading*.

### 13.3 L'entracte (nouvel écran entre le bilan et la boutique)

Ordre après une séance réussie : bilan (avec le détail du stress de la séance), entracte, boutique, briefing, séance. Pas d'entracte après la séance 8.

À l'entracte, dans l'ordre :
1. Le salaire est versé : +60 €.
2. La nuit au logement fait baisser le stress.
3. Le joueur choisit **une activité au plus** et achète autant d'améliorations de poste et de logement que son épargne le permet.

| Activité | Prix | Stress | Particularité |
|---|---|---|---|
| Soirée entre amis | 20 € | −15 | — |
| Spa | 50 € | −30 | — |
| Week-end entre amis | 90 € | −50 | — |
| Voyage | 150 € | remis à 0 | Pas de boutique cette fois (les Primes sont gardées). Au retour, le briefing commence par une *revue de marché* (13.6). |

Le Voyage est le seul moyen de sortir du tilt en un entracte. Il coûte une visite à la boutique, donc un Outil de retard.

### 13.4 Poste et logement

Améliorations permanentes, achetées dans l'ordre, l'une après l'autre. Elles jouent le rôle des Bons (vouchers) de Balatro.

| Poste | Prix | Stress pris en séance |
|---|---|---|
| Ordinateur portable | départ | ×1 |
| PC tour | 100 € | ×0,8 |
| Double écran | 200 € | ×0,6 |

| Logement | Prix | Récupération par nuit |
|---|---|---|
| Studio | départ | −10 |
| T2 | 120 € | −20 |
| Loft | 250 € | −30 |

Tout acheter coûte 670 €, alors que l'épargne atteint au plus 480 € avant la séance 8 (60 € de départ et 7 salaires) : il faut choisir.

### 13.5 La vue à la première personne

Le joueur est assis à son bureau, chez lui. L'écran de trading s'affiche **dans l'écran de son poste** :
- **Ordinateur portable** : l'interface est dans l'écran du portable, avec le haut du clavier en bas de la vue.
- **PC tour** : un moniteur plus grand, la tour posée à côté.
- **Double écran** : le graphique sur l'écran de gauche ; la main, le ticket d'ordre et les Outils sur celui de droite.

Autour du poste, on voit le logement : studio (petite fenêtre sur une cour), T2 (plante, lampe, plus de lumière), loft (grande baie vitrée sur les toits de Lyon). Le bureau montre le stress : tasses de café et post-its quand on est nerveux, bord de l'écran rougi en tilt. Aucune animation clignotante ou tremblante. Le briefing et l'entracte utilisent le même décor, l'entracte en lumière du soir.

L'option « Décor » est activée par défaut ; désactivée, l'interface s'affiche seule, en plein écran. Le décor se masque aussi automatiquement quand la fenêtre fait moins de 1 100 × 740 px, pour garder l'interface lisible.

Nouvel élément de la barre d'état (écran 4) : jauge de stress de 0 à 100 avec l'état de la séance (« Stress 62 · Nerveux »).

### 13.6 Revue de marché après un voyage

Calculée sur les 40 bougies d'historique de l'action de la séance suivante, affichée en tête du briefing :

> **Pendant ton voyage : Nexacorp (NXC)**
> - Le cours est passé de 48,20 $ à 52,10 $ (+8,1 %).
> - Plus haut 53,40 $, plus bas 47,90 $.
> - Tendance haussière : la MM5 est au-dessus de la MM20.
> - RSI 14 à 68 : proche du surachat.
> - 1 news : « NXC : prévisions annuelles revues à la hausse » (gap de +4,2 %).

Chaque ligne reprend un terme du glossaire. Le joueur apprend à résumer un graphique avant de trader.

### 13.7 Vérification de l'équilibrage

Commande : `node scripts/sim-stress.ts 2000`, qui fait tourner le moteur du jeu avec les règles de cette section. Même robot qu'en 7.3 : il ne regarde pas son stress pendant la séance ; à l'entracte, il suit une politique fixe. Contraintes simulées comme en 7.3. Taux de réussite par séance (parmi les runs qui l'atteignent), 2 000 runs par ligne, règles de la version 2.0 :

| Construction | Politique | S3 | S4 | S5 | S6 | S7 | S8 | Victoires |
|---|---|---|---|---|---|---|---|---|
| Aucun Outil | Sans le système (rappel 7.3) | 76 % | 66 % | 48 % | 27 % | 23 % | — * | 0,5 % |
| | Stress ignoré | 74 % | 60 % | 41 % | 19 % | 20 % | — * | 0,1 % |
| | Activités | 76 % | 66 % | 48 % | 27 % | 23 % | — * | 0,5 % |
| Communs seulement | Sans le système | 80 % | 70 % | 59 % | 44 % | 33 % | 32 % | 1,1 % |
| | Stress ignoré | 78 % | 66 % | 52 % | 29 % | 28 % | — * | 0,4 % |
| | Activités | 80 % | 70 % | 59 % | 44 % | 33 % | 32 % | 1,1 % |
| Synergies (levier ×5 dès S5) | Sans le système | 80 % | 72 % | 81 % | 78 % | 74 % | 74 % | 15,2 % |
| | Stress ignoré | 78 % | 68 % | 79 % | 73 % | 66 % | 64 % | 9,8 % |
| | Activités | 80 % | 72 % | 81 % | 78 % | 74 % | 72 % | 14,8 % |
| | Logement, puis activités | 80 % | 72 % | 81 % | 78 % | 74 % | 73 % | 15,2 % |
| | Poste, puis activités | 80 % | 72 % | 81 % | 78 % | 73 % | 74 % | 15,1 % |
| | Voyage dès 70 de stress | 79 % | 72 % | 79 % | 77 % | 75 % | 74 % | 14,9 % |

\* Moins de 60 runs atteignent la séance 8 : taux non fiable.

Politiques : « Activités » = à chaque entracte, si le stress est à 40 ou plus, l'activité la moins chère qui le ramène sous 40 (sinon la plus forte abordable), sans Voyage. « Logement, puis activités » et « Poste, puis activités » = en plus, une amélioration par entracte dès que l'épargne suffit et que le stress est sous 40.

Lecture :
- Stress ignoré, toutes les constructions sont nerveuses à la séance 4 dans une run sur deux. Avec le levier ×5, le stress moyen atteint 82 à la séance 6 et 97 à la séance 8 (tilt dans 94 % des runs) ; les victoires passent de 15,2 % à 9,8 %.
- Une activité au bon moment suffit presque à revenir au niveau de 7.3 (14,8 % de victoires). Le logement acheté tôt fait aussi bien que sans le système (15,2 %) et garde le stress moyen entre 22 et 35 de S3 à S8, contre 29 à 43 avec les activités seules.
- Le Voyage coûte peu (14,9 % de victoires) : il fait sauter une boutique.
- Limite : le robot dépense peu (30 à 75 € d'activités par run, 125 à 190 € avec le confort). L'épargne est donc large pour lui. Le salaire et les prix sont à revoir après les premiers tests humains.

### 13.8 Ce que le joueur apprend

1. Une perte pèse plus qu'un gain (*aversion à la perte*) : la jauge le montre trade après trade.
2. Le levier stresse même quand il rapporte : c'est un coût caché du levier, en plus de la *liquidation*.
3. Le *tilt* dégrade la qualité des décisions ; le *revenge trading* aggrave les pertes.
4. Le repos fait partie de la performance.
5. L'argent personnel et le capital de trading se gardent séparés.
6. Une *revue de marché* résume un graphique en quelques chiffres avant de décider.

### 13.9 Simplifications

1. Le stress réel ne se mesure pas sur 100 et ses effets varient d'une personne à l'autre. Le jeu le réduit à une jauge et deux paliers.
2. Le facteur d'aversion à la perte du jeu illustre le biais, il ne le mesure pas. En laboratoire, une perte pèse environ deux fois plus qu'un gain du même montant.
3. Un trader salarié ne paie pas son poste de travail. Ici, c'est le bureau à domicile du joueur.
4. Le salaire ne dépend pas des résultats : la part variable reste la Prime.

### 13.10 Choix pris par défaut (à confirmer par Antoine)

1. **Épargne en € séparée** pour la vie perso. Écartés : payer en Primes (le confort entrerait en concurrence avec les Outils, indispensables) ; payer en capital (le capital ne varie que du P&L net, section 4).
2. **Effets du stress fixés au début de la séance**, pour une règle prévisible. Écarté pour l'instant : un état qui change en direct, avec « Passer 1 bougie » qui fait souffler (−3). Plus riche contre le revenge trading, mais plus punitif en fin de séance.
3. **Interface affichée dans l'écran du poste**, avec l'option « Décor » pour l'enlever.

---

## Questions ouvertes

Les 5 choix de la version 1.0 ont été tranchés par Antoine le 19/10/2026 ; ce document les applique :

1. **Les pertes font baisser la Performance, sans excès** : pénalité de 50 % du Résultat négatif, sans Multi, Performance de séance plancher à 0 (section 5.1).
2. **Points d'analyse conservés mais faibles** : 5 par carte valide au lieu de 10. Supprimés en version 2.0 : les cartes rapportent maintenant par la chance qu'elles ajoutent.
3. **Validité des cartes toujours affichée** (✔/✘ avec raison) pendant toute la partie. Le masquage reste réservé au futur mode expert.
4. **Capital persistant sans renflouement** entre les séances.
5. **Crypto débloquée par la méta-progression** (run suivante, après avoir atteint la séance 5).

Version 2.0 : Antoine a choisi le 20/10/2026 la direction « graphique lisible » (choix discret, chances affichées). Choix pris par défaut, à confirmer :

1. **Main de 7 cartes** au lieu de 5 : avec 5 cartes, la moitié des trades partait sans carte valide ; avec 7, un sur quatre.
2. **Stop-loss et take-profit imposés** (1 u et 1,5 u) : le joueur ne règle que la taille.
3. **Pas de bonus de tendance hors cartes** : sans carte valide, la chance reste à 40 %, pour que trader sans signal ait une espérance négative.
4. **Stop-loss discipliné et Take-profit méthodique refaits** (section 6) : avec un stop-loss toujours présent, leurs effets de la version 1 n'avaient plus de sens.

Section 13 : les 3 choix pris par défaut sont listés en 13.10 et attendent la confirmation d'Antoine.

Aucune question ouverte ne bloque le prototype. Les quotas restent à ajuster après les premiers tests de jeu humains.
