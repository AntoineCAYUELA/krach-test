# Krach Test — Game Design Document (MVP)

*Titre provisoire. Version 1.1 du 19/10/2026. Cible technique : navigateur, HTML/CSS/TypeScript, sans serveur.*

Conventions du document :
- **$** = argent du compte de trading (capital). **P** = Primes, la monnaie de la boutique.
- Les pourcentages de prix sont relatifs au prix d'entrée. Les termes en *italique* sont définis au glossaire (section 10).

---

## 1. Pitch

1. Tu es un trader junior qui doit tenir 8 séances de bourse : à chaque séance, tu ouvres des positions *long* ou *short* sur une action fictive dont le graphique s'affiche en *chandeliers japonais*, et tu dois atteindre un quota de Performance avant la clôture, sinon tu es viré.
2. Ta main de cartes Signal (RSI survendu, marteau, rebond sur support…) ne vaut quelque chose que si le graphique confirme réellement le signal, et tes Outils (stop-loss automatique, effet de levier, analyste quant…) se combinent en synergies comme les jokers de Balatro.
3. Chaque partie t'apprend en jouant à lire un graphique, à gérer ton risque et à comprendre pourquoi le levier et les frais peuvent ruiner un compte, avec un glossaire qui définit chaque terme dès sa première apparition.

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
| Main | 5 cartes | Piochées dans le deck, mélangé au début de chaque séance. |

- Le graphique affiche les **40 bougies d'historique** générées avant le début de la séance, pour que les indicateurs soient calculables dès le premier tour.
- La séance se termine dès que l'une de ces conditions est remplie : Performance ≥ quota (victoire immédiate à la fin du tour en cours), ordres = 0, ou bougies restantes < 3.
- Chaque ordre non utilisé rapporte +1 P en fin de séance réussie.

### 2.3 Le tour

Un tour correspond à une décision. Étapes :

1. **Lecture** : le joueur voit le graphique (chandeliers, volume, *MM5*, *MM20*, *RSI* 14, lignes de *support* et *résistance*), sa main, ses Outils et ses ressources.
2. **Choix de la direction** : *long* ou *short*. Le jeu affiche aussitôt, sur chaque carte de la main, ✔ (valide) ou ✘ (invalide) avec la raison en une ligne (ex. « RSI = 41, il faut < 30 »).
3. **Choix de l'action**, une des trois :
   - **Défausser** : sélectionner 1 à 5 cartes, les défausser, repiocher autant. Coût : 1 défausse, 0 bougie. Retour à l'étape 1.
   - **Passer** : laisser le marché avancer d'1 bougie sans position. Coût : 1 bougie, 0 ordre. Retour à l'étape 1.
   - **Ouvrir une position** : passer à l'étape 4.
4. **Ticket d'ordre** : choisir 0 à 3 cartes à jouer, la *mise* (10 % à 100 % du capital, par pas de 10 %), le *levier* (×1 ou ×2 ; ×5 avec l'Outil Effet de levier), un *stop-loss* et un *take-profit* optionnels (en % du prix d'entrée). Le ticket affiche en direct : *notionnel*, frais estimés, perte maximale si le stop-loss est touché, prix de *liquidation*.
5. **Exécution** : entrée au prix de clôture de la dernière bougie, ajusté du *spread* (section 5).
6. **Déroulé** : le marché génère 3 bougies, animées une par une (0,6 s chacune). À chaque bougie, le jeu vérifie dans cet ordre : stop-loss, liquidation, take-profit (section 5.2).
7. **Clôture** : à la fin de la 3e bougie, ou plus tôt si un stop-loss, un take-profit ou une liquidation se déclenche. Si la position est fermée tôt, les bougies restantes du tour s'affichent quand même (le temps est consommé).
8. **Score** : affichage décomposé de la formule (section 5), mise à jour du capital et de la Performance.
9. Les cartes jouées partent à la défausse, la main est complétée à 5. Retour à l'étape 1.

**Cas limite : aucun trade.** Passer est autorisé et coûte seulement du temps (1 bougie sur 24). Qui passe trop n'a plus de bougies pour ses 5 ordres : attendre un bon setup est une vraie compétence, dans un temps limité.

### 2.4 Le marché : génération des prix

Le MVP contient **un marché d'actions** avec 3 actions fictives. Chaque séance en tire une au hasard.

| Action | Profil | Volatilité σ par bougie | Volume de base |
|---|---|---|---|
| Lugdunum Énergie (LGE) | Défensive | 1,2 % | 10 000 |
| Nexacorp (NXC) | Standard | 1,5 % | 10 000 |
| Rhône Robotics (RHR) | Tech volatile | 2,0 % | 10 000 |

**Régime de marché caché.** Le marché est à chaque instant dans un régime : *bull market*, *bear market* ou *range*. Régime initial tiré avec les probabilités 30 % / 30 % / 40 %. À chaque bougie, 4 % de chance de basculer vers l'un des deux autres régimes (au hasard). Le régime n'est pas affiché pendant la séance ; il est révélé dans le bilan (courbe colorée par régime). C'est le cœur du hasard maîtrisable : chaque carte Signal marche dans un régime et échoue dans les autres, et le joueur apprend à reconnaître le régime sur le graphique.

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

Tous ces paramètres (μ, κ, σ, probabilités) sont regroupés dans un fichier de configuration unique pour l'équilibrage.

### 2.5 Indicateurs calculés

- **MM5 / MM20** : moyenne simple des 5 / 20 derniers Close.
- **RSI 14** : sur les 14 dernières variations de Close, RSI = 100 − 100 / (1 + somme des hausses / somme des baisses). Si aucune baisse : 100.
- **Support** : plus bas des Low des 20 bougies précédant la dernière. **Résistance** : plus haut des High sur la même fenêtre.
- **Volume moyen** : moyenne des volumes des 20 bougies précédant la dernière.
- **Pente de tendance** : MM20 actuelle − MM20 d'il y a 5 bougies.

### 2.6 Les cartes Signal

Chaque condition est évaluée sur la dernière bougie close (t). Une carte est **valide** si sa condition est vraie **et** si sa direction correspond à celle de la position.

| Carte | Famille | Direction | Condition de validité | Exemplaires (deck de départ) |
|---|---|---|---|---|
| Marteau | Chandelier | Long | Mèche basse ≥ 2 × corps, mèche haute ≤ corps, Close < MM20 | 1 |
| Étoile filante | Chandelier | Short | Mèche haute ≥ 2 × corps, mèche basse ≤ corps, Close > MM20 | 1 |
| Avalement haussier | Chandelier | Long | Bougie t−1 rouge, bougie t verte, Open(t) ≤ Close(t−1) et Close(t) ≥ Open(t−1) | 1 |
| Avalement baissier | Chandelier | Short | Symétrique de l'avalement haussier | 1 |
| RSI survendu | Indicateur | Long | RSI < 30 | 2 |
| RSI suracheté | Indicateur | Short | RSI > 70 | 2 |
| Golden cross | Indicateur | Long | MM5 > MM20 maintenant, et MM5 ≤ MM20 sur au moins une des 3 bougies précédentes | 1 |
| Death cross | Indicateur | Short | Symétrique du golden cross | 1 |
| Rebond sur support | Niveau | Long | Low(t) ≤ support × 1,01 et Close(t) > support | 2 |
| Rejet de résistance | Niveau | Short | High(t) ≥ résistance × 0,99 et Close(t) < résistance | 2 |
| Cassure haussière | Niveau | Long | Close(t) > résistance | 1 |
| Cassure baissière | Niveau | Short | Close(t) < support | 1 |
| Pic de volume | Volume | Sens de la bougie t | Volume(t) ≥ 2 × volume moyen ; valide en long si bougie verte, en short si rouge | 2 |
| Volume confirmant | Volume | Sens des 3 dernières bougies | Moyenne des volumes t−2 à t ≥ 1,3 × volume moyen ; long si Close(t) > Close(t−3), short sinon | 2 |

Mesuré au simulateur (7.3) : tous régimes confondus, aucune carte n'a d'avantage ; dans son bon régime, une carte rapporte environ +0,8 % sur 3 bougies, et fait perdre autant dans le mauvais. Un signal ne vaut que dans son contexte.

---

## 3. Correspondance avec Balatro

| Balatro | Krach Test | Concept de trading réel enseigné |
|---|---|---|
| Cartes à jouer | Cartes Signal | Les signaux d'*analyse technique* (chandeliers, indicateurs, niveaux, volume). |
| Main de poker (paire, couleur…) | Setup (combinaison de signaux valides) | La *confluence* : plusieurs signaux indépendants qui concordent rendent un trade plus solide. |
| Jetons (chips) | P&L net + Points d'analyse | Le *P&L* réalisé, une fois les frais et le spread payés. |
| Multiplicateur (mult) | Multiplicateur de conviction | La qualité du processus de décision, jugée indépendamment du résultat. |
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
Notionnel N        = Mise × Levier
Prix d'entrée E    = Close(t) × (1 + s/2) en long ; Close(t) × (1 − s/2) en short     // s = spread = 0,20 %
Prix de sortie X   = Close de la 3e bougie, ou niveau du SL/TP déclenché
Sortie ajustée X'  = X × (1 − s/2) en long ; X × (1 + s/2) en short
Rendement r        = X'/E − 1 en long ; 1 − X'/E en short
P&L brut           = N × r
Frais              = 2 × f × N            // f = 0,10 % par côté (entrée + sortie)
P&L net            = P&L brut − Frais
Capital            = Capital + P&L net

Points d'analyse   = 5 × nombre de cartes valides jouées
Résultat           = Points d'analyse + P&L net
Multi total        = (Multi de setup + somme des bonus additifs) × produit des bonus multiplicatifs
Performance du trade  = Résultat × Multi total      si Résultat ≥ 0
                      = Résultat × 0,5              si Résultat < 0    // pénalité, sans Multi
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

Pourquoi une pénalité à 50 % : une perte compte contre le quota, comme pour un vrai trader jugé sur son P&L, mais sans excès. Elle n'est pas multipliée et la Performance de séance ne descend jamais sous 0, donc un mauvais départ ne condamne pas la séance. La perte entière frappe déjà le capital, et donc toutes les positions futures. Les Points d'analyse sont volontairement faibles : ils n'absorbent qu'une très petite perte.

### 5.2 Ordre de résolution pendant les 3 bougies

Pour chaque bougie, dans cet ordre :
1. **Gap à l'ouverture** : si l'Open dépasse déjà le stop-loss, la position est fermée au prix d'Open (pas au niveau du stop). C'est le *slippage* réel lors d'un gap.
2. **Stop-loss** : si Low (long) ou High (short) touche le niveau, fermeture au niveau du stop. Si stop-loss et take-profit sont touchés dans la même bougie, le stop-loss l'emporte (hypothèse prudente : on ne connaît pas l'ordre des ticks).
3. **Liquidation** : si la perte latente (pire prix de la bougie) atteint 80 % de la mise, la position est liquidée. P&L net = −Mise (frais inclus).
4. **Take-profit** : si High (long) ou Low (short) touche le niveau, fermeture au niveau.

Le levier ×2 implique une liquidation à −40 % de prix (quasi impossible) ; le levier ×5 à −16 % (possible lors d'un krach avec news).

### 5.3 Exemple chiffré d'un tour complet

Situation : séance 3 (quota 50), capital 1 000 $, Outils possédés : Chartiste (+1,5 Multi par carte Niveau valide) et Stop-loss discipliné (stop automatique à −5 %). Action NXC, dernière bougie close à 50,00 $, RSI = 27, le Low de la bougie a touché le support à 49,60 $ et le Close est au-dessus.

1. Direction : **long**. Cartes jouées : RSI survendu (✔, RSI 27 < 30), Rebond sur support (✔), Pic de volume (✘, volume = 1,4 × moyenne).
2. Ticket : mise 50 % = 500 $, levier ×2 → **N = 1 000 $**.
3. Entrée : E = 50,00 × 1,001 = **50,05 $**. Stop-loss : 50,05 × 0,95 = 47,5475 $.
4. Bougies : (O 50,00 / H 50,60 / L 49,40 / C 50,40), (50,40 / 51,30 / 50,20 / 51,10), (51,10 / 51,90 / 50,90 / **51,60**). Stop jamais touché.
5. Sortie : X' = 51,60 × 0,999 = 51,5484 $. r = 51,5484 / 50,05 − 1 = **+2,9938 %**.
6. P&L brut = 1 000 × 0,029938 = 29,94 $. Frais = 2 × 0,1 % × 1 000 = 2,00 $. **P&L net = +27,94 $** (27,938 non arrondi). Capital → 1 027,94 $.
7. Points d'analyse = 2 cartes valides × 5 = 10. Résultat = 10 + 27,938 = 37,938 (≥ 0). Les calculs gardent toute la précision ; seul l'affichage arrondit au centime.
8. Setup : 2 cartes valides de familles différentes (Indicateur + Niveau) → Confluence ×2,5. Chartiste : +1,5 (une carte Niveau valide). Multi total = (2,5 + 1,5) × 1 = **4**.
9. **Performance = 37,938 × 4 = 151,75** ≥ 50 → séance gagnée à la fin du tour, avec 4 ordres non utilisés (+4 P).

Variante perdante : la 1re bougie descend à 47,00 $. Le stop-loss se déclenche à 47,5475 $ ; X' = 47,5475 × 0,999 = 47,4999 $ ; r = −5,095 % ; P&L brut = −50,95 $ ; P&L net = −52,95 $. Capital → 947,05 $. Résultat = 10 − 52,95 = −42,95 (< 0), donc Performance du trade = −42,95 × 0,5 = **−21,475**. Si la Performance de séance était à 30, elle passe à 8,525 ; si elle était à 0, elle reste à 0.

---

## 6. Les 15 Outils du MVP

Rareté et apparition en boutique : Commun 70 %, Peu commun 25 %, Rare 5 %. Prix de revente = moitié du prix d'achat, arrondie à l'entier inférieur.

| # | Nom | Effet | Rareté | Prix | Concept enseigné |
|---|---|---|---|---|---|
| 1 | Stop-loss discipliné | Chaque position reçoit un stop-loss automatique à −5 % (sauf si le joueur en a fixé un plus proche). +1 P par position fermée par ce stop. | Commun | 4 P | Le stop-loss limite la perte maximale d'un trade. |
| 2 | Take-profit méthodique | Chaque position reçoit un take-profit automatique à +4 %. +1 Multi (additif) sur les trades fermés par ce take-profit. | Commun | 4 P | Le take-profit sécurise un gain avant un retournement. |
| 3 | Courtier low-cost | Frais : 0,10 % → 0,04 % par côté. | Commun | 3 P | Les frais de courtage réduisent chaque P&L. |
| 4 | Teneur de marché | Spread : 0,20 % → 0,08 %. | Commun | 3 P | Le spread est un coût caché payé à chaque trade. |
| 5 | Lecteur de chandeliers | +1 Multi (additif) par carte Chandelier valide jouée. | Commun | 4 P | Les figures de chandeliers résument la bataille acheteurs/vendeurs. |
| 6 | Oscillateur RSI | Seuils RSI : 35/65 au lieu de 30/70. | Commun | 4 P | Élargir les seuils donne plus de signaux, mais moins fiables. |
| 7 | Calendrier économique | Les news sont annoncées 2 bougies à l'avance (titre et sentiment, pas le résultat). | Commun | 4 P | Le calendrier économique permet d'anticiper les moments de forte volatilité. |
| 8 | Chartiste | +1,5 Multi (additif) par carte Niveau valide jouée. | Peu commun | 6 P | Les supports et résistances sont des zones où le prix réagit souvent. |
| 9 | Effet de levier | Levier maximal : ×2 → ×5. | Peu commun | 6 P | Le levier multiplie gains ET pertes, et rapproche le prix de liquidation. |
| 10 | Vendeur à découvert | +1 Multi (additif) sur les positions short. | Peu commun | 5 P | Le short permet de gagner quand le prix baisse. |
| 11 | Suiveur de tendance | ×1,5 Multi si la direction correspond au signe de la pente de tendance (MM20). | Peu commun | 6 P | « The trend is your friend » : trader dans le sens de la tendance. |
| 12 | Scalpeur | Débloque les positions d'1 bougie (1 ordre, 1 bougie de temps). +1 Multi (additif) sur ces positions. | Peu commun | 5 P | Le scalping multiplie les trades courts ; les frais pèsent lourd. |
| 13 | Règle des 2 % | ×2 Multi si le risque du trade (notionnel × distance du stop-loss) ≤ 2 % du capital. Sans stop-loss : aucun effet. | Rare | 8 P | Gestion du risque : ne jamais risquer plus de 1 à 2 % du capital par trade. |
| 14 | Carnet de trading | +0,5 Multi (additif) permanent pour la run à chaque trade gagnant joué avec au moins 2 cartes valides. Plafond : +4. | Rare | 8 P | Le journal de trading fait progresser par l'analyse de ses trades. |
| 15 | Analyste quant | ×2 Multi si le setup contient des cartes valides d'au moins 2 familles. | Rare | 10 P | L'analyse quantitative combine des signaux indépendants. |

**Synergies explicites :**

1. **Stop-loss discipliné + Règle des 2 %** : le stop automatique à −5 % fournit la distance de stop exigée. Avec 1 000 $ de capital, tout trade de notionnel ≤ 400 $ obtient ×2 (400 × 5 % = 20 $ = 2 %). Le jeu récompense exactement le calcul de taille de position d'un vrai trader.
2. **Effet de levier + Stop-loss discipliné** : sans stop, un levier ×5 est liquidé à −16 % (perte de 100 % de la mise). Avec le stop à −5 %, la perte maximale tombe à environ 25 % de la mise plus les frais. Le levier devient jouable, et le joueur voit pourquoi les traders pros ne l'utilisent jamais sans stop.
3. **Scalpeur + Courtier low-cost + Teneur de marché** : une position d'1 bougie bouge en moyenne d'environ 1,2 % ; frais + spread coûtent 0,40 % aller-retour au départ (un tiers du gain), 0,16 % avec les deux Outils. Sans eux, le Scalpeur perd de l'argent sur le long terme.
4. **Chartiste + Lecteur de chandeliers + Analyste quant** : Rebond sur support + Marteau = Confluence. Multi = (2,5 + 1,5 + 1) × 2 = **×10**.
5. **Vendeur à découvert + Suiveur de tendance** : en bear market (dont la séance Krach), un short avec Signal isolé vaut (1,5 + 1) × 1,5 = ×3,75.

### 6.1 Consommables (6)

Utilisables à tout moment pendant une séance, sauf pendant le déroulé d'une position. Usage unique.

| Nom | Effet | Prix | Concept enseigné |
|---|---|---|---|
| Rapport d'analyste | Révèle le régime de marché actuel (bull, bear, range). | 3 P | Un rapport de recherche aide à situer le contexte, sans garantir l'avenir. |
| Formation | +0,5 Multi permanent sur un type de setup choisi (cumulable). | 3 P | La pratique d'une stratégie précise améliore son exécution. |
| Pack de signaux | Choisir 1 carte Signal parmi 3 proposées et l'ajouter au deck ; ou retirer 1 carte du deck. | 4 P | Construire sa propre stratégie, c'est choisir quels signaux on suit. |
| Couverture | Le prochain trade voit son P&L net multiplié par 0,5 (gain comme perte). | 3 P | Une couverture (hedge) réduit le risque, mais réduit aussi le gain. |
| Ordre supplémentaire | +1 ordre pour la séance en cours. | 3 P | — |
| Boule de cristal | Affiche la couleur (verte ou rouge) de la prochaine bougie. | 5 P | Aucun : pouvoir surnaturel, voir section 11. |

**Boutique** : 2 Outils + 2 consommables par visite. Relance : 2 P, +1 P à chaque relance dans la même visite.

---

## 7. Progression

### 7.1 Courbe des quotas

| Séance | Semaine | Type | Quota de Performance | Contrainte |
|---|---|---|---|---|
| 1 | 1 | Normale | 20 | — |
| 2 | 1 | Événement | 25 | Tirée dans la liste 7.2 |
| 3 | 2 | Normale | 50 | — |
| 4 | 2 | Événement | 80 | Tirée dans la liste 7.2 |
| 5 | 3 | Normale | 130 | — |
| 6 | 3 | Événement | 200 | Tirée dans la liste 7.2 |
| 7 | 4 | Normale | 300 | — |
| 8 | 4 | Événement finale | 450 | Krach (fixe) |

Croissance d'environ ×1,5 par séance, comme les blinds de Balatro. La séance 2 monte peu car c'est déjà une séance à événement.

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

Un simulateur Python des règles de ce document est fourni dans `jeu-trading/simulation/`. Il fait jouer 1 500 runs à un robot volontairement naïf : il mise toujours 100 % du capital, joue les cartes valides sans lire le régime et défausse le reste. Taux de réussite par séance (parmi les runs qui atteignent cette séance) :

| Construction | S1 | S2 | S3 | S4 | S5 | S6 | S7 | S8 |
|---|---|---|---|---|---|---|---|---|
| Aucun Outil | 87 % | 77 % | 73 % | 72 % | 43 % | 18 % | 12 % | — * |
| Communs seulement | 87 % | 78 % | 77 % | 71 % | 48 % | 29 % | 21 % | — * |
| Synergies (Chartiste, Lecteur, Suiveur, Quant, Levier, Stop-loss) | 87 % | 78 % | 75 % | 72 % | 70 % | 62 % | 61 % | 65 % |

Contraintes simulées : S2 Marché sans tendance, S4 Jour de résultats, S6 Marché sans tendance, S8 Krach. Commande : `python3 run9.py "[20,25,50,80,130,200,300,450]"`.

\* Moins de 1 % des runs atteignent la séance 8 avec cette construction : échantillon trop petit pour un taux fiable. Testée seule à capital 1 000 $, la séance 8 passe environ 10 % du temps sans Outil.

Lecture : sans Outil rare, les séances 1-2 passent au moins 3 fois sur 4 ; les séances 7-8 sont quasi impossibles sans synergie. Un humain qui lit le régime devrait battre le robot ; à confirmer en test de jeu.

---

## 8. Conditions de défaite et de victoire

**Défaite :**
1. **Quota manqué** : la séance se termine (ordres épuisés ou moins de 3 bougies restantes) avec Performance < quota. Écran « Tu es viré ».
2. **Compte liquidé** : le capital passe sous 10 $ (mise minimale), immédiatement, même en pleine séance. Écran « Margin call ».

**Cas limite : capital à 0 en cours de séance.** Possible uniquement en misant 100 % du capital puis en étant liquidé. La run s'arrête aussitôt sur l'écran « Margin call », qui détaille la chaîne : mise, levier, prix de liquidation, perte de la mise. Aucun renflouement.

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
   - Main de 5 cartes avec indicateur ✔/✘ et sa raison une fois la direction choisie.
   - Ticket d'ordre : direction, mise, levier, stop-loss, take-profit, aperçu (notionnel, frais estimés, perte maximale, prix de liquidation).
   - Boutons : Ouvrir la position, Défausser, Passer 1 bougie.
   - Bandeau de news quand une news tombe.
5. **Résolution du trade** (superposée à l'écran 4) : animation des 3 bougies, lignes d'entrée/SL/TP sur le graphique, puis décomposition ligne par ligne : P&L brut, frais, P&L net, Points d'analyse, Multi de setup, chaque bonus d'Outil, Performance.
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
| Bear market | Marché baissier : les prix baissent durablement. |
| Bid / Ask | Bid : meilleur prix auquel on peut vendre. Ask : meilleur prix auquel on peut acheter. L'ask est toujours au-dessus du bid. |
| Bull market | Marché haussier : les prix montent durablement. |
| Carnet d'ordres | Liste de tous les ordres d'achat et de vente en attente sur un actif, à chaque prix. |
| Cassure (breakout) | Clôture du prix au-delà d'un support ou d'une résistance, souvent suivie d'une accélération. |
| CFD (Contract for Difference) | Contrat à levier qui paie la variation de prix d'un actif sans le posséder ; produit très risqué pour les particuliers. |
| Chandelier japonais (bougie, candlestick) | Représentation du prix sur une période avec 4 valeurs : ouverture, plus haut, plus bas, clôture. Verte si la clôture dépasse l'ouverture, rouge sinon. |
| Confluence | Plusieurs signaux indépendants qui indiquent la même direction au même moment. |
| Corps | Partie épaisse de la bougie, entre l'ouverture et la clôture. |
| Couverture (hedge) | Position prise pour réduire le risque d'une autre. Elle réduit les pertes possibles mais aussi les gains. |
| Courtier (broker) | Intermédiaire qui exécute les ordres et se rémunère par des frais. |
| Crypto-monnaie | Actif numérique décentralisé (ex. bitcoin), échangé 24 h/24, en général bien plus volatil que les actions. |
| Death cross | La moyenne mobile courte passe sous la longue : signal baissier. |
| Dividende | Part des bénéfices qu'une entreprise verse à ses actionnaires. |
| Délit d'initié | Utiliser une information non publique pour trader. Illégal et sanctionné pénalement. |
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
| Régime de marché | État général du marché à un moment donné : haussier, baissier ou sans tendance. |
| Séance | Période d'ouverture de la bourse pendant laquelle on peut trader. Dans le jeu, une manche de 24 bougies. |
| Résistance | Zone de prix où la hausse a déjà été stoppée plusieurs fois. |
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
| Teneur de marché (market maker) | Acteur qui propose en permanence un prix d'achat et de vente, et se rémunère sur le spread. |
| Trade / trader | Un trade est une opération d'achat puis de vente (ou l'inverse) ; un trader est la personne qui les réalise. |
| Tendance | Direction générale du prix sur plusieurs bougies. |
| Volatilité | Ampleur moyenne des variations de prix. Plus elle est forte, plus les gains et les pertes possibles sont grands. |
| Volume | Nombre de titres échangés pendant une bougie. |

---

## 11. Simplifications par rapport au vrai trading

1. **Signaux fiables par construction.** Le générateur de prix rend chaque signal profitable dans « son » régime. Sur les vrais marchés, l'avantage des signaux techniques est faible, instable et souvent nul après frais.
2. **Régimes à trois états.** Le vrai marché n'a pas de régime caché tiré au sort ; c'est un modèle pédagogique.
3. **Performance et Multi.** Les Points d'analyse et le Multiplicateur sont un score de jeu, pas de l'argent. Seul le capital suit une logique réaliste.
4. **Durée fixe de 3 bougies.** Un vrai trader ferme sa position quand il veut.
5. **Exécution instantanée** au Close ± spread, sans carnet d'ordres ; le seul slippage simulé est le gap qui saute un stop-loss.
6. **Frais** calculés deux fois sur le notionnel d'entrée, au lieu du montant réel à chaque côté.
7. **Short sans coût d'emprunt**, ni dividende à reverser ; levier sans frais de financement journaliers.
8. **Liquidation simplifiée** : seuil fixe à 80 % de perte de la mise, perte de 100 % de la mise.
9. **Calendrier économique** : le sentiment annoncé est juste à 70 %, une fiabilité arbitraire.
10. **Boule de cristal** : connaître la bougie suivante est impossible. Le jeu la présente comme un pouvoir surnaturel. En réel, la seule façon de « savoir avant » serait une information non publique, ce qui est un délit d'initié.
11. **Intérêts versés en Primes**, pas au capital.
12. **Pas de fiscalité**, pas de cotation la nuit ni le week-end.

---

## 12. Périmètre

### 12.1 MVP (premier prototype)

- 1 marché d'actions, 3 actions fictives, générateur de prix de la section 2.4.
- 14 types de cartes Signal, deck de départ de 20 cartes.
- 15 Outils, 6 consommables, boutique.
- 8 séances, 4 contraintes d'événement + Krach final.
- 9 écrans de la section 9, glossaire avec infobulles de première rencontre.
- Sauvegarde locale de la run, graine reproductible.

**Architecture suggérée** : logique de jeu en TypeScript pur, sans dépendance au DOM (générateur, règles, score), testable par des tests unitaires qui rejouent l'exemple de la section 5.3 ; rendu du graphique en Canvas ou avec une bibliothèque de chandeliers légère ; aucune dépendance serveur.

### 12.2 Après le MVP

1. **Crypto (v1.1).** Marché débloqué de façon permanente après avoir atteint la séance 5 une première fois ; il est ensuite proposé au choix pour les séances 5 à 8 des runs suivantes. Paramètres : σ 4 % à 6 % par bougie, news 8 %, frais 0,10 % mais spread 0,30 %. Justification : avec une volatilité trois fois supérieure, un levier ×5 est liquidé dès −16 %, soit 3 à 4 bougies défavorables. Le joueur doit d'abord avoir appris le stop-loss, la taille de position et le levier sur des actions calmes. L'atteinte de la séance 5 garantit qu'il a déjà vécu au moins deux séances à événement.
2. **Nouveaux Outils** (objectif 40) et nouvelles cartes : nouveaux indicateurs et figures de chandeliers à trois bougies, chacun ajouté au glossaire.
3. **Méta-progression** : débloquer des Outils et des « stratégies de départ » (équivalents des decks de Balatro, ex. un deck Chartiste avec plus de cartes Niveau) ; mises de difficulté croissante.
4. **Mode expert** : indicateur ✔/✘ des cartes masqué, régime jamais révélé.
5. **Autres marchés** : devises (levier élevé, faible volatilité), matières premières.
6. **Mode infini** après la séance 8.

---

## Questions ouvertes

Les 5 choix de la version 1.0 ont été tranchés par Antoine le 19/10/2026 ; ce document les applique :

1. **Les pertes font baisser la Performance, sans excès** : pénalité de 50 % du Résultat négatif, sans Multi, Performance de séance plancher à 0 (section 5.1).
2. **Points d'analyse conservés mais faibles** : 5 par carte valide au lieu de 10.
3. **Validité des cartes toujours affichée** (✔/✘ avec raison) pendant toute la partie. Le masquage reste réservé au futur mode expert.
4. **Capital persistant sans renflouement** entre les séances.
5. **Crypto débloquée par la méta-progression** (run suivante, après avoir atteint la séance 5).

Aucune question ouverte ne bloque le prototype. Les quotas restent à ajuster après les premiers tests de jeu humains.
