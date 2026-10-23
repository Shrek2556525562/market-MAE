#!/usr/bin/env python3
"""
Viviers de formation utiles aux laboratoires pharmaceutiques.

Question : où sont les formations qui produisent les profils dont un
laboratoire pharmaceutique a besoin (chimie, biologie / biotechnologies,
procédés, pharmacie), à quel niveau de sortie, et près de quels sites ?

Entrées (déjà dans data/downloads/, voir manifest.json) :
  - Parcoursup 2025 (vœux et admissions) : une ligne = une formation
    post-bac, avec sa capacité d'accueil en 1re année et ses coordonnées.
  - SIES, effectifs d'étudiants inscrits par établissement public (2024-25) :
    une ligne = un établissement et une année, avec les inscrits par secteur
    disciplinaire SISE (03 chimie, 06 sciences de la vie, 09 pharmacie).
  - SIES, annuaire des principaux établissements : coordonnées.
  - data/pharmaceutical-companies-fr.json : sites industriels NAF 21.10Z / 21.20Z.

Sortie :
  - data/viviers-formations.json, intégré dans viviers.html par
    scripts/embed_data.py (aucun chargement au moment de l'ouverture).
  - Un résumé chiffré dans la console.

Usage : python scripts/build_viviers.py
"""

from __future__ import annotations

import json
import math
import re
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
DL = ROOT / "data" / "downloads"
OUT = ROOT / "data" / "viviers-formations.json"

PARCOURSUP = DL / "parcoursup-2025-applications-and-admission-responses.csv"
SIES_EFFECTIFS = DL / (
    "sies-student-enrolments-by-higher-education-institution-"
    "excluding-university-cpge-double-registrations.csv"
)
SIES_ANNUAIRE = DL / "sies-directory-of-principal-higher-education-institutions.csv"
SITES = ROOT / "data" / "pharmaceutical-companies-fr.json"

RAYON_KM = 50
ANNEE_SIES = "2024-25"

# --------------------------------------------------------------------------
# 1. Formations post-bac utiles aux labos (Parcoursup)
# --------------------------------------------------------------------------
# Chaque règle : (filière Parcoursup, motif sur l'intitulé, domaine, niveau de
# sortie). La première règle qui correspond l'emporte. Les intitulés hors
# règles sont écartés : esthétique-cosmétique, BTS agricoles, biologie médicale (laboratoires
# d'analyses médicales), parcours agronomie, diététique, environnement, PASS.
REGLES = [
    # BTS (Bac+2)
    ("BTS", r"Bioanalyses en laboratoire de contr[ôo]le", "Contrôle qualité & analyses", "Bac+2"),
    ("BTS", r"Bioqualit[ée]", "Contrôle qualité & analyses", "Bac+2"),
    ("BTS", r"M[ée]tiers de la chimie", "Chimie", "Bac+2"),
    ("BTS", r"Biotechnologie en recherche et en production", "Biologie & biotechnologies", "Bac+2"),
    ("BTS", r"Pilotage des proc[ée]d[ée]s", "Procédés & production", "Bac+2"),
    # BUT (Bac+3)
    ("BUT", r"^BUT - Chimie", "Chimie", "Bac+3"),
    ("BUT", r"G[ée]nie chimique", "Procédés & production", "Bac+3"),
    ("BUT", r"G[ée]nie biologique parcours (biologie m[ée]dicale et biotechnologie|sciences de l'aliment et biotechnologie)",
     "Biologie & biotechnologies", "Bac+3"),
    # Licence professionnelle et bachelors
    ("Autre formation", r"Licence professionnelle - Bio-industries", "Biologie & biotechnologies", "Bac+3"),
    ("Ecole d'Ingénieur", r"Bac \+ 3 .*(Biotech|Chimi)", "Biologie & biotechnologies", "Bac+3"),
    # Écoles d'ingénieurs post-bac (Bac+5)
    ("Ecole d'Ingénieur", r"chimi|biotech|biolog|proc[ée]d[ée]s|pharma", "Ingénieur chimie & biologie", "Bac+5"),
]

# Licences générales : chimie et sciences de la vie, hors parcours qui
# préparent à autre chose (professorat, kiné, géologie, vétérinaire) et portails
# de mathématiques avec une simple option biologie ou chimie.
LICENCE_EXCLUE = re.compile(
    r"professorat|PPPE|kin[ée]|g[ée]oscience|g[ée]ologie-|v[ée]t[ée]rinaire|agronom"
    r"|Portail Math[ée]matiques",
    re.I,
)


def classer_parcoursup(fili: str, intitule: str, detail: str) -> tuple[str, str] | None:
    texte = f"{intitule} {detail}"
    for filiere, motif, domaine, niveau in REGLES:
        if fili == filiere and re.search(motif, texte, re.I):
            return domaine, niveau
    if fili in {"Licence", "Licence_Las"} and not LICENCE_EXCLUE.search(texte):
        if re.search(r"chimi", intitule, re.I):
            return "Chimie", "Bac+3"
        if re.search(r"sciences de la vie|biolog", intitule, re.I):
            return "Biologie & biotechnologies", "Bac+3"
    return None


def coordonnees(valeur) -> tuple[float, float] | None:
    try:
        lat, lon = (float(x) for x in str(valeur).split(","))
    except (TypeError, ValueError):
        return None
    if not (-90 <= lat <= 90 and -180 <= lon <= 180):
        return None
    return lat, lon


def charger_formations() -> pd.DataFrame:
    p = pd.read_csv(PARCOURSUP, sep=";", low_memory=False, encoding="utf-8-sig")
    lignes = []
    for r in p.itertuples(index=False):
        cls = classer_parcoursup(
            str(r.fili), str(r.lib_for_voe_ins or ""), str(r.detail_forma or "")
        )
        if cls is None:
            continue
        xy = coordonnees(r.g_olocalisation_des_formations)
        if xy is None:
            continue
        domaine, niveau = cls
        lignes.append(
            {
                "uai": r.cod_uai,
                "etablissement": r.g_ea_lib_vx,
                "ville": r.ville_etab,
                "dep": str(r.dep).zfill(2),
                "dep_lib": r.dep_lib,
                "region": r.region_etab_aff,
                "statut": r.contrat_etab,
                "filiere": str(r.fili).replace("_", " ").replace("Licence Las", "Licence (LAS)"),
                "intitule": r.lib_for_voe_ins,
                "domaine": domaine,
                "niveau": niveau,
                "capacite": int(r.capa_fin) if pd.notna(r.capa_fin) else 0,
                "voeux": int(r.voe_tot) if pd.notna(r.voe_tot) else 0,
                "lat": round(xy[0], 5),
                "lon": round(xy[1], 5),
            }
        )
    return pd.DataFrame(lignes)


# --------------------------------------------------------------------------
# 2. Établissements avec étudiants en chimie, sciences de la vie, pharmacie
# --------------------------------------------------------------------------
# Secteurs disciplinaires SISE, contrôlés sur les données : la somme des
# secteurs 05, 06, 69 redonne la discipline « sciences de la vie, de la terre
# et de l'univers » ; le secteur 09 forme seul la discipline pharmacie
# (27 établissements, dont aucun à Brest, qui n'a pas de faculté de pharmacie).
SECTEURS = {
    "chimie": "sect_disciplinaire03",
    "sciences_vie": "sect_disciplinaire06",
    "pharmacie": "sect_disciplinaire09",
}


def charger_universites() -> pd.DataFrame:
    e = pd.read_csv(SIES_EFFECTIFS, sep=";", low_memory=False, encoding="utf-8-sig")
    e = e[e.annee_universitaire == ANNEE_SIES].copy()
    for col in SECTEURS.values():
        e[col] = e[col].fillna(0)
    e["total_utile"] = sum(e[c] for c in SECTEURS.values())
    e = e[e.total_utile > 0]

    a = pd.read_csv(SIES_ANNUAIRE, sep=";", low_memory=False, encoding="utf-8-sig")
    a = a[["etablissement_id_paysage", "coordonnees", "com_nom", "dep_id", "dep_nom", "reg_nom"]]
    # L'annuaire est rattaché par l'identifiant Paysage actuel, puis historique.
    m = e.merge(
        a.rename(columns={"etablissement_id_paysage": "etablissement_id_paysage_actuel"}),
        on="etablissement_id_paysage_actuel", how="left",
    )
    manque = m.coordonnees.isna()
    if manque.any():
        repli = e.loc[manque.values].merge(a, on="etablissement_id_paysage", how="left")
        m.loc[manque, "coordonnees"] = repli.coordonnees.values
        for col in ["com_nom", "dep_id", "dep_nom", "reg_nom"]:
            m.loc[manque, col] = repli[col].values

    lignes = []
    for r in m.itertuples(index=False):
        xy = coordonnees(r.coordonnees)
        lignes.append(
            {
                "etablissement": r.etablissement_lib,
                "type": r.etablissement_type,
                "ville": r.com_nom if isinstance(r.com_nom, str) else r.etablissement_commune,
                "dep": str(r.dep_id)[1:].lstrip("0").zfill(2) if isinstance(r.dep_id, str) else None,
                "dep_lib": r.dep_nom if isinstance(r.dep_nom, str) else None,
                "region": r.reg_nom if isinstance(r.reg_nom, str) else None,
                "chimie": int(getattr(r, SECTEURS["chimie"])),
                "sciences_vie": int(getattr(r, SECTEURS["sciences_vie"])),
                "pharmacie": int(getattr(r, SECTEURS["pharmacie"])),
                "lat": round(xy[0], 5) if xy else None,
                "lon": round(xy[1], 5) if xy else None,
            }
        )
    return pd.DataFrame(lignes)


# --------------------------------------------------------------------------
# 3. Croisement avec les sites industriels pharma
# --------------------------------------------------------------------------
def haversine_km(lat1, lon1, lat2, lon2):
    lat1, lon1, lat2, lon2 = map(np.radians, (lat1, lon1, lat2, lon2))
    a = (
        np.sin((lat2 - lat1) / 2) ** 2
        + np.cos(lat1) * np.cos(lat2) * np.sin((lon2 - lon1) / 2) ** 2
    )
    return 6371.0 * 2 * np.arcsin(np.sqrt(a))


def charger_sites() -> pd.DataFrame:
    snap = json.loads(SITES.read_text(encoding="utf-8-sig"))
    lignes = []
    for s in snap["sites"]:
        if not s.get("coordinates"):
            continue
        if s["etablissement"].get("activite_principale") not in {"21.10Z", "21.20Z"}:
            continue
        adresse = s["etablissement"].get("adresse", "")
        cp = re.search(r"\b(\d{5})\b", adresse)
        dep = None
        if cp:
            code = cp.group(1)
            if code.startswith("97"):
                dep = code[:3]
            elif code.startswith("20"):
                dep = "2A" if int(code) < 20200 else "2B"
            else:
                dep = code[:2]
        lignes.append(
            {
                "siret": s["siret"],
                "nom": s["companyName"],
                "commune": s["etablissement"].get("libelle_commune"),
                "dep": dep,
                "lat": s["coordinates"][0],
                "lon": s["coordinates"][1],
            }
        )
    return pd.DataFrame(lignes), snap.get("generatedAt")


def propre(valeur):
    """Remplace NaN par null et les entiers numpy par des entiers Python."""
    if isinstance(valeur, dict):
        return {k: propre(v) for k, v in valeur.items()}
    if isinstance(valeur, list):
        return [propre(v) for v in valeur]
    if isinstance(valeur, (np.integer,)):
        return int(valeur)
    if isinstance(valeur, (float, np.floating)):
        return None if math.isnan(valeur) else float(valeur)
    return valeur


def main() -> None:
    formations = charger_formations()
    universites = charger_universites()
    sites, date_sites = charger_sites()

    niveaux = ["Bac+2", "Bac+3", "Bac+5"]
    # Places de 1re année à moins de RAYON_KM km de chaque site, par niveau
    d = haversine_km(
        sites.lat.values[:, None], sites.lon.values[:, None],
        formations.lat.values[None, :], formations.lon.values[None, :],
    )
    proche = d <= RAYON_KM
    for niv in niveaux:
        masque = (formations.niveau == niv).values
        sites[f"places_{niv}"] = (proche[:, masque] * formations.capacite.values[masque]).sum(axis=1)
    sites["places_total"] = sites[[f"places_{n}" for n in niveaux]].sum(axis=1)

    uni = universites.dropna(subset=["lat"])
    du = haversine_km(
        sites.lat.values[:, None], sites.lon.values[:, None],
        uni.lat.values[None, :], uni.lon.values[None, :],
    )
    sites["pharmacie_50km"] = ((du <= RAYON_KM) * uni.pharmacie.values).sum(axis=1)

    # Résumé
    n = len(sites)
    resume = {
        "rayon_km": RAYON_KM,
        "sites": n,
        "formations": int(len(formations)),
        "places": int(formations.capacite.sum()),
        "places_par_niveau": {
            niv: int(formations.loc[formations.niveau == niv, "capacite"].sum()) for niv in niveaux
        },
        "formations_par_niveau": {
            niv: int((formations.niveau == niv).sum()) for niv in niveaux
        },
        "places_par_domaine": formations.groupby("domaine").capacite.sum().astype(int).to_dict(),
        "etablissements_universitaires": int(len(universites)),
        "etablissements_sans_coordonnees": universites.loc[universites.lat.isna(), "etablissement"].tolist(),
        "inscrits": {
            k: int(universites[k].sum()) for k in ["chimie", "sciences_vie", "pharmacie"]
        },
        "sites_avec_formation_par_niveau": {
            niv: int((sites[f"places_{niv}"] > 0).sum()) for niv in niveaux
        },
        "sites_sans_aucune_formation": int((sites.places_total == 0).sum()),
        "sites_avec_fac_pharmacie": int((sites.pharmacie_50km > 0).sum()),
        "places_mediane_par_site": float(sites.places_total.median()),
    }

    # Départements : sites pharma face aux places de formation
    par_dep_sites = sites.groupby("dep").size().rename("sites")
    par_dep_places = formations.groupby("dep").capacite.sum().rename("places")
    dep_lib = formations.groupby("dep").dep_lib.first()
    deps = pd.concat([par_dep_sites, par_dep_places], axis=1).fillna(0).astype(int)
    deps["dep_lib"] = dep_lib
    deps = deps[deps.sites > 0].sort_values("sites", ascending=False)
    deps["places_par_site"] = (deps.places / deps.sites).round(1)

    sortie = {
        "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "sources": {
            "parcoursup": "Parcoursup 2025, vœux de 1re année et admissions (MESR)",
            "sies": f"SIES, effectifs d'étudiants inscrits par établissement public, {ANNEE_SIES}",
            "annuaire": "SIES, principaux établissements d'enseignement supérieur",
            "sites": f"API Recherche d'entreprises, instantané du {date_sites}",
        },
        "resume": resume,
        "formations": formations.to_dict(orient="records"),
        "universites": universites.where(pd.notna(universites), None).to_dict(orient="records"),
        "sites": sites[["siret", "nom", "commune", "lat", "lon"]].to_dict(orient="records"),
        "departements": deps.reset_index(names="dep")
            .astype(object).where(deps.reset_index(names="dep").notna(), None)
            .to_dict(orient="records"),
    }
    OUT.write_text(
        json.dumps(propre(sortie), ensure_ascii=False, indent=1, allow_nan=False),
        encoding="utf-8",
    )

    print(json.dumps(resume, ensure_ascii=False, indent=2))
    print("\nDépartements avec le plus de sites pharma :")
    print(deps.head(15).to_string())
    print("\nSites sans aucune formation utile à moins de", RAYON_KM, "km :")
    print(sites[sites.places_total == 0][["nom", "commune", "dep"]].to_string(index=False))
    print(f"\nÉcrit : {OUT.relative_to(ROOT)}")

    # Les pages embarquent leurs données : on les met à jour dans la foulée.
    import embed_data
    embed_data.main()


if __name__ == "__main__":
    main()
