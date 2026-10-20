# Simulateur d'équilibrage (Krach Test)

Prototype Python des règles du GDD (`../gdd.md`), écrit pour calibrer les quotas. Code brut, non destiné au jeu.

- `sim.py` : générateur de prix (régimes, ticks, news), indicateurs, conditions des cartes Signal.
- `g.py` : règles d'une séance (ticket, SL/TP/liquidation, formule de score, Outils) et robot naïf.
- `run9.py` : runs complètes de 8 séances pour 4 constructions d'Outils.

Lancer : `python3 run9.py "[20,25,50,80,130,200,300,450]"` (quelques minutes).
