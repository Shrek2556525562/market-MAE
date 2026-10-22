#!/usr/bin/env python3
"""
Test du khi² d'indépendance : calcule la statistique khi², la p-value,
les degrés de liberté, les effectifs théoriques et le V de Cramér.

Deux façons de l'utiliser :

1) Données brutes (une ligne = un individu) : on croise deux colonnes
   python khi2_analyse.py donnees.csv --col1 sexe --col2 reponse

2) Tableau de contingence déjà fait (effectifs) : première colonne = étiquettes
   python khi2_analyse.py tableau.csv --contingence

Options :
   --sep ";"        séparateur du CSV (auto-détecté par défaut)
   --feuille Nom    feuille Excel à lire (.xlsx)
   --alpha 0.05     seuil de significativité
   --toutes         teste toutes les paires de colonnes (données brutes)
   --sortie res.csv enregistre les résultats dans un CSV

Dépendances : pip install pandas scipy openpyxl
"""

import argparse
import itertools
import sys

import numpy as np
import pandas as pd
from scipy import stats


def charger(chemin, sep=None, feuille=None, index_col=None):
    if chemin.lower().endswith((".xlsx", ".xls")):
        return pd.read_excel(chemin, sheet_name=feuille or 0, index_col=index_col)
    return pd.read_csv(chemin, sep=sep, engine="python", index_col=index_col)


def test_khi2(tableau, alpha=0.05, nom="", afficher=True):
    """tableau : DataFrame d'effectifs (lignes x colonnes)."""
    tableau = tableau.loc[tableau.sum(axis=1) > 0, tableau.sum(axis=0) > 0]
    if tableau.shape[0] < 2 or tableau.shape[1] < 2:
        raise ValueError("Il faut au moins 2 lignes et 2 colonnes non vides.")

    # Correction de Yates par défaut sur les tableaux 2x2 (comportement scipy)
    chi2, p, ddl, attendus = stats.chi2_contingency(tableau.values)
    n = tableau.values.sum()
    k = min(tableau.shape) - 1
    v_cramer = np.sqrt(chi2 / (n * k)) if k > 0 else np.nan

    attendus_df = pd.DataFrame(attendus, index=tableau.index, columns=tableau.columns)
    pct_faibles = (attendus < 5).mean() * 100

    res = {
        "test": nom,
        "n": int(n),
        "khi2": chi2,
        "ddl": ddl,
        "p_value": p,
        "V_cramer": v_cramer,
        "significatif": p < alpha,
        "pct_attendus_<5": round(pct_faibles, 1),
    }

    # Test exact de Fisher si 2x2 avec petits effectifs
    if tableau.shape == (2, 2) and (attendus < 5).any():
        _, p_fisher = stats.fisher_exact(tableau.values)
        res["p_fisher"] = p_fisher

    if afficher:
        titre = f"=== {nom} ===" if nom else "=== Test du khi² ==="
        print(f"\n{titre}")
        print("\nEffectifs observés :")
        print(tableau.assign(Total=tableau.sum(axis=1)).to_string())
        print("\nEffectifs théoriques :")
        print(attendus_df.round(2).to_string())
        print(f"\nKhi²         = {chi2:.4f}")
        print(f"ddl          = {ddl}")
        print(f"p-value      = {p:.4g}")
        print(f"V de Cramér  = {v_cramer:.3f}")
        if p < alpha:
            print(f"→ p < {alpha} : lien significatif, on rejette l'indépendance.")
        else:
            print(f"→ p ≥ {alpha} : pas de lien significatif (indépendance non rejetée).")
        if pct_faibles > 20:
            print(f"⚠ {pct_faibles:.0f}% des effectifs théoriques sont < 5 : "
                  "le khi² est peu fiable (regrouper des modalités ou utiliser Fisher).")
        if "p_fisher" in res:
            print(f"Test exact de Fisher : p-value = {res['p_fisher']:.4g}")
    return res


def main():
    ap = argparse.ArgumentParser(description="Test du khi² d'indépendance (khi², p-value).")
    ap.add_argument("fichier", help="fichier .csv ou .xlsx")
    ap.add_argument("--contingence", action="store_true",
                    help="le fichier est déjà un tableau d'effectifs")
    ap.add_argument("--col1", help="1re variable (données brutes)")
    ap.add_argument("--col2", help="2e variable (données brutes)")
    ap.add_argument("--toutes", action="store_true",
                    help="teste toutes les paires de colonnes")
    ap.add_argument("--sep", default=None, help="séparateur CSV (auto par défaut)")
    ap.add_argument("--feuille", default=None, help="feuille Excel")
    ap.add_argument("--alpha", type=float, default=0.05)
    ap.add_argument("--sortie", help="enregistrer les résultats en CSV")
    a = ap.parse_args()

    resultats = []

    if a.contingence:
        tab = charger(a.fichier, a.sep, a.feuille, index_col=0)
        tab = tab.apply(pd.to_numeric, errors="coerce").fillna(0)
        resultats.append(test_khi2(tab, a.alpha, "Tableau de contingence"))
    else:
        df = charger(a.fichier, a.sep, a.feuille)
        if a.toutes:
            paires = list(itertools.combinations(df.columns, 2))
        elif a.col1 and a.col2:
            paires = [(a.col1, a.col2)]
        else:
            print("Colonnes disponibles :", ", ".join(map(str, df.columns)))
            sys.exit("Indique --col1 et --col2, ou --toutes, ou --contingence.")

        for c1, c2 in paires:
            for c in (c1, c2):
                if c not in df.columns:
                    sys.exit(f"Colonne introuvable : {c}")
            tab = pd.crosstab(df[c1], df[c2])
            try:
                resultats.append(test_khi2(tab, a.alpha, f"{c1} × {c2}",
                                           afficher=not a.toutes))
            except ValueError as e:
                print(f"{c1} × {c2} ignoré : {e}")

        if a.toutes and resultats:
            r = pd.DataFrame(resultats).sort_values("p_value")
            print(r.to_string(index=False, float_format=lambda x: f"{x:.4g}"))

    if a.sortie and resultats:
        pd.DataFrame(resultats).to_csv(a.sortie, index=False)
        print(f"\nRésultats enregistrés dans {a.sortie}")


if __name__ == "__main__":
    main()
