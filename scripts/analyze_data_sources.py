#!/usr/bin/env python3
"""Profile the source catalogue and the locally bundled pharmaceutical snapshot."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd


ROOT = Path(__file__).resolve().parents[1]
CATALOG_PATH = ROOT / "pharmaceutical_data_sources_fr.csv"
SNAPSHOT_PATH = ROOT / "data" / "pharmaceutical-companies-fr.json"
REPORT_PATH = ROOT / "data" / "pharmaceutical_data_sources_analysis.md"
ANALYSIS_PATH = ROOT / "data" / "pharmaceutical_data_sources_analysis.json"

SOURCE_NOTES = {
    "INSEE Sirene": (
        "Unité légale ou établissement",
        "SIREN/SIRET (qualitative nominale), adresse, code NAF (qualitative nominale), "
        "état actif/fermé (qualitative nominale). Effectifs, chiffre d'affaires et "
        "coordonnées dépendent des champs et de l'extrait téléchargé.",
    ),
    "Base de données publique des médicaments (BDPM)": (
        "Médicament ou présentation",
        "Identifiants produit (qualitative nominale), laboratoire/titulaire "
        "(qualitative nominale), statut d'autorisation et de commercialisation "
        "(qualitative nominale).",
    ),
    "Open Medic (Assurance Maladie)": (
        "Agrégat de consommation (la dimension exacte dépend du fichier)",
        "Dépenses/remboursements (quantitative continue), boîtes dispensées "
        "(quantitative discrète), âge, sexe, région et spécialité du prescripteur "
        "(qualitatives).",
    ),
    "Medic'AM (Assurance Maladie)": (
        "Médicament (CIP) × période × type de prescripteur",
        "CIP (qualitative nominale), base et montant remboursés "
        "(quantitatives continues), boîtes remboursées (quantitative discrète), "
        "prescripteur (qualitative nominale), période (temporelle).",
    ),
    "Eurostat Structural Business Statistics (NACE C21)": (
        "Secteur × territoire × année × indicateur",
        "Entreprises et emplois (quantitatives discrètes), ETP, salaires et "
        "chiffre d'affaires (quantitatifs, généralement continus), année et "
        "indicateur (temporels/catégoriels).",
    ),
    "EMA EudraGMDP": (
        "Autorisation, certificat, site ou enregistrement réglementaire",
        "Pays, site, type d'autorisation/certificat et statut "
        "(qualitatives nominales); dates de délivrance/validité (temporelles).",
    ),
    "EU Clinical Trials Information System (CTIS)": (
        "Essai clinique, pays ou site participant selon l'extraction",
        "Promoteur, médicament, pays et statut (qualitatives nominales); "
        "identifiants et dates d'essai (nominales/temporelles).",
    ),
    "Eurostat Comext international trade in goods": (
        "Produit × pays partenaire × période",
        "Code produit et pays (qualitatives nominales), période (temporelle), "
        "valeur commerciale (quantitative continue), quantité (quantitative dont "
        "la nature dépend de l'unité publiée).",
    ),
    "French public procurement data (DECP)": (
        "Marché ou contrat public",
        "Acheteur, fournisseur et identifiants (qualitatifs nominaux), date "
        "(temporelle), montant (quantitatif continu), description (texte).",
    ),
    "ANSM medicine availability and shortages": (
        "Médicament ou présentation",
        "Produit/laboratoire (qualitatifs nominaux), état de disponibilité "
        "(qualitatif nominal), dates de mise à jour (temporelles). La source "
        "ne fournit pas nécessairement des volumes de pénurie.",
    ),
    "European Patent Office Espacenet": (
        "Demande ou famille de brevets",
        "Identifiant, déposant et domaine technologique (qualitatifs nominaux), "
        "dates de dépôt/publication (temporelles). Un compte de brevets est "
        "quantitatif discret après agrégation.",
    ),
}

SOURCE_VARIABLES = {
    "INSEE Sirene": [
        ("SIREN / SIRET", "Qualitative nominale", "Identifiant d'une unité légale / d'un établissement.", "qualitative"),
        ("Dénomination", "Qualitative nominale", "Nom de l'entreprise ou de l'établissement.", "qualitative"),
        ("Adresse et commune", "Qualitative textuelle / nominale", "Localisation administrative.", "text"),
        ("Code NAF", "Qualitative nominale", "Code d'activité, pas une quantité.", "qualitative"),
        ("État administratif", "Qualitative nominale", "Établissement actif ou fermé.", "qualitative"),
        ("Effectif salarié", "Quantitative discrète", "Nombre de salariés, si inclus dans l'extrait.", "discrete"),
        ("Chiffre d'affaires", "Quantitative continue", "Montant en euros, si disponible pour l'unité observée.", "continuous"),
        ("Coordonnées", "Quantitatives continues", "Latitude et longitude, si présentes.", "continuous"),
    ],
    "Base de données publique des médicaments (BDPM)": [
        ("CIS / CIP", "Qualitative nominale", "Identifiants du médicament ou de sa présentation.", "qualitative"),
        ("Dénomination du médicament", "Qualitative textuelle", "Nom du produit.", "text"),
        ("Laboratoire / titulaire", "Qualitative nominale", "Entité associée à l'autorisation.", "qualitative"),
        ("Statut d'autorisation / commercialisation", "Qualitative nominale", "État réglementaire ou commercial du produit.", "qualitative"),
        ("Dates d'autorisation / commercialisation", "Temporelles", "Dates associées au cycle de vie du produit, selon le fichier.", "temporal"),
    ],
    "Open Medic (Assurance Maladie)": [
        ("Période", "Temporelle", "Année de consommation couverte par le fichier.", "temporal"),
        ("Dépenses / remboursements", "Quantitative continue", "Montants en euros.", "continuous"),
        ("Boîtes dispensées", "Quantitative discrète", "Comptage d'unités dispensées.", "discrete"),
        ("Âge / tranche d'âge", "Qualitative ordinale ou quantitative", "La nature dépend du codage : tranche ou âge mesuré.", "qualitative"),
        ("Sexe, région, prescripteur", "Qualitatives nominales", "Dimensions de ventilation des agrégats.", "qualitative"),
        ("Produit / classification", "Qualitative nominale", "Détail produit dépendant du fichier et de la nomenclature.", "qualitative"),
    ],
    "Medic'AM (Assurance Maladie)": [
        ("CIP", "Qualitative nominale", "Identifiant de présentation du médicament.", "qualitative"),
        ("Période", "Temporelle", "Mois ou année de publication.", "temporal"),
        ("Type de prescripteur", "Qualitative nominale", "Catégorie du prescripteur.", "qualitative"),
        ("Base / montant remboursé", "Quantitatives continues", "Montants en euros.", "continuous"),
        ("Boîtes remboursées", "Quantitative discrète", "Comptage de boîtes.", "discrete"),
    ],
    "Eurostat Structural Business Statistics (NACE C21)": [
        ("Année", "Temporelle (discrète)", "Année de référence de l'indicateur.", "temporal"),
        ("Géographie / secteur NACE", "Qualitatives nominales", "Territoire et secteur agrégé C21.", "qualitative"),
        ("Indicateur", "Qualitative nominale", "Nature de la mesure publiée.", "qualitative"),
        ("Nombre d'entreprises / de salariés", "Quantitatives discrètes", "Effectifs agrégés.", "discrete"),
        ("ETP, salaires, chiffre d'affaires", "Quantitatives continues", "Mesures d'emploi et montants agrégés.", "continuous"),
    ],
    "EMA EudraGMDP": [
        ("Type d'enregistrement / identifiant", "Qualitative nominale", "Autorisation, certificat ou enregistrement.", "qualitative"),
        ("Site / pays", "Qualitatives nominales", "Lieu associé à l'enregistrement.", "qualitative"),
        ("Type d'autorisation / statut", "Qualitative nominale", "Catégorie et état réglementaire.", "qualitative"),
        ("Dates de délivrance / validité", "Temporelles", "Jalons de l'autorisation ou du certificat.", "temporal"),
    ],
    "EU Clinical Trials Information System (CTIS)": [
        ("Identifiant d'essai", "Qualitative nominale", "Identifiant du registre, même s'il est composé de chiffres.", "qualitative"),
        ("Promoteur / médicament", "Qualitatives nominales", "Entités et produit étudié.", "qualitative"),
        ("Statut d'essai", "Qualitative nominale", "État réglementaire ou opérationnel.", "qualitative"),
        ("Pays / sites participants", "Qualitatives nominales", "Localisation des participations.", "qualitative"),
        ("Dates de l'essai", "Temporelles", "Dates d'enregistrement et de suivi.", "temporal"),
    ],
    "Eurostat Comext international trade in goods": [
        ("Période", "Temporelle", "Mois ou année du flux.", "temporal"),
        ("Code produit / pays partenaire / flux", "Qualitatives nominales", "Classification du produit, du partenaire et import/export.", "qualitative"),
        ("Valeur commerciale", "Quantitative continue", "Valeur monétaire du flux.", "continuous"),
        ("Quantité échangée", "Quantitative dépendant de l'unité", "Nature discrète ou continue selon l'unité de mesure publiée.", "discrete"),
    ],
    "French public procurement data (DECP)": [
        ("Identifiant de contrat", "Qualitative nominale", "Identifiant du marché, non une mesure.", "qualitative"),
        ("Acheteur / fournisseur", "Qualitatives nominales", "Entités contractantes.", "qualitative"),
        ("Description", "Qualitative textuelle", "Objet déclaré du marché.", "text"),
        ("Date / période", "Temporelle", "Date de notification ou période du marché.", "temporal"),
        ("Montant attribué", "Quantitative continue", "Montant financier déclaré.", "continuous"),
    ],
    "ANSM medicine availability and shortages": [
        ("Médicament / présentation / laboratoire", "Qualitatives nominales", "Entités concernées par le signal.", "qualitative"),
        ("État de disponibilité", "Qualitative nominale", "Disponibilité ou signal de tension selon la publication.", "qualitative"),
        ("Dates de mise à jour", "Temporelles", "Repères temporels de l'information publiée.", "temporal"),
        ("Volumes de pénurie", "Non documentés", "Le descriptif ne garantit pas de mesure de volume.", "text"),
    ],
    "European Patent Office Espacenet": [
        ("Identifiant / famille de brevets", "Qualitative nominale", "Identifiant documentaire, pas une mesure.", "qualitative"),
        ("Déposant", "Qualitative nominale", "Organisation ayant déposé la demande.", "qualitative"),
        ("Domaine / classification technologique", "Qualitative nominale", "Classification du contenu breveté.", "qualitative"),
        ("Dates de dépôt / publication", "Temporelles", "Chronologie documentaire.", "temporal"),
        ("Nombre de brevets", "Quantitative discrète après agrégation", "Comptage construit en agrégeant les enregistrements.", "discrete"),
    ],
}

SOURCE_TRANSLATIONS = {
    "INSEE Sirene": {
        "description": "Registre national des entreprises et établissements : identifiants SIREN/SIRET, adresses, activités et statut administratif. Les codes NAF 21.10Z et 21.20Z sont un premier filtre, pas un registre certifié des sites pharmaceutiques.",
        "frequency": "API mise à jour quotidiennement ; stocks diffusés périodiquement.",
        "limitations": "Le filtrage par activité peut manquer des entreprises pertinentes. Sirene ne certifie ni les autorisations pharmaceutiques ni les sites de fabrication.",
    },
    "Base de données publique des médicaments (BDPM)": {
        "description": "Base publique officielle des médicaments : autorisations, statut de commercialisation et laboratoire ou titulaire associé.",
        "frequency": "Mise à jour mensuelle ; certains fichiers peuvent être produits plus souvent.",
        "limitations": "Décrit des produits et non un registre exhaustif d'entreprises ou de sites. À croiser avec Sirene.",
    },
    "Open Medic (Assurance Maladie)": {
        "description": "Données annuelles sur l'utilisation des médicaments en pharmacie de ville : dépenses, remboursements, boîtes et ventilations démographiques ou géographiques.",
        "frequency": "Annuelle.",
        "limitations": "Mesure des usages et remboursements, pas le chiffre d'affaires total des fabricants. Données agrégées, réparties en plusieurs tables et assorties de précautions propres à chaque millésime.",
    },
    "Medic'AM (Assurance Maladie)": {
        "description": "Remboursements de médicaments délivrés en pharmacie de ville, identifiés par CIP, avec base et montants remboursés, nombres de boîtes et types de prescripteur.",
        "frequency": "Mensuelle à partir de 2015 ; annuelle pour les années antérieures.",
        "limitations": "Ne couvre ni toutes les ventes ni les usages hospitaliers et ne mesure pas les revenus nets des fabricants.",
    },
    "Eurostat Structural Business Statistics (NACE C21)": {
        "description": "Indicateurs structurels annuels pour la fabrication pharmaceutique (NACE C21) : entreprises, emplois, ETP, salaires et chiffre d'affaires.",
        "frequency": "Annuelle ; dates de publication et révisions variables selon l'indicateur.",
        "limitations": "Agrégats sectoriels, sans noms d'entreprises ni détail par établissement. Certaines ventilations peuvent être indisponibles ou confidentielles.",
    },
    "EMA EudraGMDP": {
        "description": "Base européenne de données publiques sur les autorisations de fabrication et d'importation, certificats GMP et autres enregistrements réglementaires.",
        "frequency": "Mise à jour au fil des publications et modifications des autorités nationales.",
        "limitations": "Portail européen sans extraction nationale simple. Une autorisation ne décrit ni les volumes produits ni l'activité commerciale.",
    },
    "EU Clinical Trials Information System (CTIS)": {
        "description": "Portail public européen des essais cliniques : promoteurs, médicaments étudiés, statut et pays ou sites participants.",
        "frequency": "Mise à jour lors des soumissions et modifications des essais.",
        "limitations": "Les promoteurs peuvent être des universités, hôpitaux, prestataires ou filiales; leurs noms ne correspondent pas toujours à un SIREN. Un essai n'est pas une mesure de ventes ou de succès commercial.",
    },
    "Eurostat Comext international trade in goods": {
        "description": "Statistiques des importations et exportations par produit, pays partenaire et période, en valeur et en quantité.",
        "frequency": "Mensuelle et annuelle ; des révisions sont possibles.",
        "limitations": "Totaux nationaux sans données de vente par entreprise. Les codes produits évoluent et les flux ne correspondent ni à la consommation domestique ni au chiffre d'affaires des fabricants.",
    },
    "French public procurement data (DECP)": {
        "description": "Marchés publics attribués : acheteurs, fournisseurs, descriptions et montants, pour compléter l'analyse des ventes et clients.",
        "frequency": "Consolidation régulière annoncée ; délais et fréquence varient selon les déclarations.",
        "limitations": "La couverture et les descriptions sont variables. Les montants de marché ne sont pas le chiffre d'affaires de l'entreprise et peuvent couvrir plusieurs années ou des fournitures plus larges.",
    },
    "ANSM medicine availability and shortages": {
        "description": "Informations de l'ANSM sur la disponibilité des médicaments et les tensions d'approvisionnement, à relier aux produits de la BDPM.",
        "frequency": "Mise à jour selon l'évolution des informations de disponibilité.",
        "limitations": "Ne constitue ni un registre historique d'entreprises ni une mesure des ventes, des volumes en pénurie ou des parts de marché.",
    },
    "European Patent Office Espacenet": {
        "description": "Recherche de brevets pour repérer demandes, déposants, domaines technologiques et chronologie de l'innovation pharmaceutique.",
        "frequency": "Mise à jour au fil de la publication des brevets et événements juridiques.",
        "limitations": "N'est pas un jeu France-pharmacie prêt à l'emploi. Les noms de déposants demandent une normalisation; un brevet n'atteste ni d'un produit commercialisé ni de sa valeur.",
    },
}

CATALOG_TYPES = {
    "source": "Qualitative nominale",
    "data_url": "Qualitative nominale (URL)",
    "download_or_query_url": "Qualitative nominale (URL)",
    "description": "Qualitative textuelle",
    "estimated_quality_percent": (
        "Quantitative; score entier dans le catalogue (discret), "
        "mais estimation subjective"
    ),
    "quality_score_basis": "Qualitative textuelle",
    "update_frequency": "Qualitative catégorielle / temporelle",
    "limitations": "Qualitative textuelle",
}


def is_missing(value: Any) -> bool:
    if value is None:
        return True
    if isinstance(value, str):
        return not value.strip()
    if isinstance(value, (list, tuple, dict)):
        return len(value) == 0
    return bool(pd.isna(value))


def unique_count(series: pd.Series) -> int:
    values = [json.dumps(value, sort_keys=True, ensure_ascii=False) if isinstance(value, (list, dict)) else value
              for value in series if not is_missing(value)]
    return int(pd.Series(values, dtype="object").nunique()) if values else 0


def parse_coordinate_pair(value: Any) -> tuple[float | None, float | None]:
    if isinstance(value, str):
        parts = value.strip().strip("()[]").split(",")
    elif isinstance(value, (list, tuple)):
        parts = value
    else:
        return None, None

    if len(parts) < 2:
        return None, None
    try:
        first, second = float(parts[0]), float(parts[1])
    except (TypeError, ValueError):
        return None, None
    return first, second


def profile_frame(frame: pd.DataFrame, type_map: dict[str, str]) -> list[dict[str, Any]]:
    profiles = []
    for column in frame.columns:
        series = frame[column]
        missing = series.map(is_missing)
        profiles.append(
            {
                "column": column,
                "type": type_map.get(column, "Qualitative / structure imbriquée"),
                "n": len(series),
                "missing": int(missing.sum()),
                "missing_pct": float(missing.mean() * 100) if len(series) else 0.0,
                "unique": unique_count(series),
            }
        )
    return profiles


def format_number(value: float, digits: int = 3) -> str:
    if not np.isfinite(value):
        return "—"
    return f"{value:,.{digits}f}".replace(",", "\u202f").replace(".", ",")


def markdown_table(headers: list[str], rows: list[list[str]]) -> str:
    lines = [
        "| " + " | ".join(headers) + " |",
        "| " + " | ".join("---" for _ in headers) + " |",
    ]
    lines.extend("| " + " | ".join(row) + " |" for row in rows)
    return "\n".join(lines)


def load_snapshot() -> dict[str, Any]:
    with SNAPSHOT_PATH.open(encoding="utf-8-sig") as source_file:
        return json.load(source_file)


def normalize_records(
    records: list[dict[str, Any]],
    coordinates_field: str,
    first_coordinate: str,
    second_coordinate: str,
) -> pd.DataFrame:
    frame = pd.json_normalize(records, sep=".")
    if coordinates_field in frame.columns:
        pairs = frame[coordinates_field].map(parse_coordinate_pair)
        frame[f"{coordinates_field}.{first_coordinate}"] = pairs.map(lambda pair: pair[0])
        frame[f"{coordinates_field}.{second_coordinate}"] = pairs.map(lambda pair: pair[1])
        frame = frame.drop(columns=[coordinates_field])
    return frame


def numeric_summary(series: pd.Series) -> dict[str, float | int]:
    values = pd.to_numeric(series, errors="coerce").dropna().to_numpy(dtype=float)
    if values.size == 0:
        return {"n": 0}
    return {
        "n": int(values.size),
        "mean": float(np.mean(values)),
        "median": float(np.median(values)),
        "q1": float(np.quantile(values, 0.25)),
        "q3": float(np.quantile(values, 0.75)),
        "min": float(np.min(values)),
        "max": float(np.max(values)),
        "variance": float(np.var(values, ddof=0)),
        "std": float(np.std(values, ddof=0)),
    }


def json_safe(value: Any) -> Any:
    if isinstance(value, dict):
        return {str(key): json_safe(item) for key, item in value.items()}
    if isinstance(value, list):
        return [json_safe(item) for item in value]
    if isinstance(value, tuple):
        return [json_safe(item) for item in value]
    if isinstance(value, np.generic):
        return value.item()
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    if pd.isna(value):
        return None
    raise TypeError(f"Unsupported JSON analysis value: {type(value).__name__}")


def render() -> tuple[str, dict[str, Any]]:
    catalog = pd.read_csv(CATALOG_PATH, encoding="utf-8-sig")
    unknown_sources = (
        set(catalog["source"])
        - SOURCE_NOTES.keys()
        - SOURCE_VARIABLES.keys()
        - SOURCE_TRANSLATIONS.keys()
    )
    if unknown_sources:
        raise ValueError(f"Sources sans classification documentée : {sorted(unknown_sources)}")
    catalog["estimated_quality_percent"] = pd.to_numeric(
        catalog["estimated_quality_percent"], errors="raise"
    )
    snapshot = load_snapshot()
    if snapshot["companyCount"] != len(snapshot["companies"]):
        raise ValueError("companyCount ne correspond pas au nombre d'entreprises du JSON.")
    if snapshot["siteCount"] != len(snapshot["sites"]):
        raise ValueError("siteCount ne correspond pas au nombre d'établissements du JSON.")
    catalog_profiles = profile_frame(catalog, CATALOG_TYPES)
    score = numeric_summary(catalog["estimated_quality_percent"])

    company_frame = normalize_records(
        snapshot["companies"], "siege.coordonnees", "latitude", "longitude"
    )
    site_frame = normalize_records(snapshot["sites"], "coordinates", "latitude", "longitude")
    company_types = {
        "siren": "Identifiant qualitatif nominal",
        "nom_complet": "Qualitative textuelle / nominale",
        "activityCodes": "Qualitative nominale (liste de codes)",
        "siege.libelle_commune": "Qualitative nominale",
        "siege.code_postal": "Qualitative nominale (code)",
        "siege.coordonnees.latitude": "Quantitative continue (latitude)",
        "siege.coordonnees.longitude": "Quantitative continue (longitude)",
    }
    site_types = {
        "siret": "Identifiant qualitatif nominal",
        "companySiren": "Identifiant qualitatif nominal",
        "companyName": "Qualitative textuelle / nominale",
        "etablissement.adresse": "Qualitative textuelle",
        "etablissement.libelle_commune": "Qualitative nominale",
        "etablissement.activite_principale": "Qualitative nominale (code NAF)",
        "coordinates.latitude": "Quantitative continue (latitude)",
        "coordinates.longitude": "Quantitative continue (longitude)",
    }
    company_profiles = profile_frame(company_frame, company_types)
    site_profiles = profile_frame(site_frame, site_types)

    numeric_profiles = []
    for section_name, frame, coord_columns in (
        (
            "Sièges sociaux",
            company_frame,
            ("siege.coordonnees.latitude", "siege.coordonnees.longitude"),
        ),
        ("Établissements", site_frame, ("coordinates.latitude", "coordinates.longitude")),
    ):
        for column in coord_columns:
            if column not in frame:
                continue
            stats = numeric_summary(frame[column])
            numeric_profiles.append((section_name, column, stats))

    catalog_rows = [
        [
            item["column"],
            item["type"],
            f'{item["missing"]}/{item["n"]} ({format_number(item["missing_pct"], 1)} %)',
            str(item["unique"]),
        ]
        for item in catalog_profiles
    ]
    coordinate_rows = [
        [
            section,
            column,
            str(stats["n"]),
            format_number(stats["mean"]),
            format_number(stats["variance"]),
            format_number(stats["std"]),
            f'{format_number(stats["q1"])} – {format_number(stats["q3"])}',
            f'{format_number(stats["min"])} – {format_number(stats["max"])}',
        ]
        for section, column, stats in numeric_profiles
    ]

    def field_table(profiles: list[dict[str, Any]]) -> str:
        return markdown_table(
            ["Colonne", "Type de variable", "Manquants", "Valeurs distinctes"],
            [
                [
                    item["column"],
                    item["type"],
                    f'{item["missing"]}/{item["n"]} ({format_number(item["missing_pct"], 1)} %)',
                    str(item["unique"]),
                ]
                for item in profiles
            ],
        )

    source_rows = []
    source_details = []
    for row in catalog.to_dict(orient="records"):
        unit, variables = SOURCE_NOTES[row["source"]]
        fields = [
            {"name": name, "type": variable_type, "description": description, "category": category}
            for name, variable_type, description, category in SOURCE_VARIABLES[row["source"]]
        ]
        source_rows.append(
            [
                row["source"],
                "Secondaire",
                unit,
                variables,
                "Non calculables : données brutes absentes",
            ]
        )
        source_details.append(
            {
                **row,
                "description": SOURCE_TRANSLATIONS[row["source"]]["description"],
                "update_frequency": SOURCE_TRANSLATIONS[row["source"]]["frequency"],
                "limitations": SOURCE_TRANSLATIONS[row["source"]]["limitations"],
                "dataClass": "Secondaire",
                "unitOfObservation": unit,
                "variables": fields,
                "statisticsAvailable": False,
                "statisticsNote": (
                    "Le dépôt fournit le descriptif de la source, pas son extraction brute. "
                    "Les colonnes ci-dessous sont déduites du descriptif et doivent être "
                    "vérifiées sur le fichier téléchargé."
                ),
            }
        )

    root_types = {
        "generatedAt": "Date/heure (temporelle)",
        "source": "Qualitative nominale (URL)",
        "activityTotals": "Quantitative discrète par code NAF",
        "companyCount": "Quantitative discrète (effectif)",
        "companySiteSearchCount": "Quantitative discrète (effectif)",
        "siteCount": "Quantitative discrète (effectif)",
        "companies": "Table imbriquée (entreprise)",
        "sites": "Table imbriquée (établissement)",
    }
    root_profiles = [
        {
            "column": key,
            "type": root_types[key],
            "n": 1,
            "missing": int(is_missing(value)),
            "missing_pct": 100.0 * int(is_missing(value)),
            "unique": int(not is_missing(value)),
        }
        for key, value in snapshot.items()
    ]
    activity_totals = ", ".join(
        f"{code} : {count}" for code, count in snapshot["activityTotals"].items()
    )

    analysis = json_safe(
        {
            "generatedAt": datetime.now(timezone.utc).isoformat(),
            "scope": {
                "sourceCount": len(catalog),
                "catalogColumnCount": len(catalog.columns),
                "primarySourcesPresent": 0,
                "externalRawFilesPresent": 0,
            },
            "catalog": {
                "columns": catalog_profiles,
                "qualityScores": score,
                "sources": source_details,
            },
            "snapshot": {
                "generatedAt": snapshot["generatedAt"],
                "sourceUrl": snapshot["source"],
                "companyCount": snapshot["companyCount"],
                "companySiteSearchCount": snapshot["companySiteSearchCount"],
                "siteCount": snapshot["siteCount"],
                "activityTotals": snapshot["activityTotals"],
                "metadata": root_profiles,
                "companies": {
                    "count": len(company_frame),
                    "unitOfObservation": "Entreprise",
                    "columns": company_profiles,
                },
                "sites": {
                    "count": len(site_frame),
                    "unitOfObservation": "Établissement",
                    "columns": site_profiles,
                },
                "coordinates": [
                    {
                        "level": section,
                        "column": column,
                        **stats,
                    }
                    for section, column, stats in numeric_profiles
                ],
            },
        }
    )

    lines = [
        "# Analyse des sources de données pharmaceutiques",
        "",
        f"Analyse générée le {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}.",
        "",
        "## Périmètre et méthode",
        "",
        f"- Catalogue examiné : `{CATALOG_PATH.relative_to(ROOT).as_posix()}` "
        f"({len(catalog)} sources, {len(catalog.columns)} colonnes).",
        f"- Instantané local examiné : `{SNAPSHOT_PATH.relative_to(ROOT).as_posix()}` "
        f"(généré le {snapshot['generatedAt']}).",
        "- Les sources listées sont secondaires : elles préexistent à l'étude et ont été "
        "produites par des organismes tiers, pour leurs propres objectifs. Aucune collecte "
        "primaire (questionnaire, entretien ou observation terrain) n'est fournie.",
        f"- Le dépôt ne contient pas les fichiers bruts des {len(catalog)} jeux externes. Leurs schémas "
        "complets, taux de valeurs manquantes, variances et écarts-types ne peuvent donc pas "
        "être calculés sans télécharger et contrôler chaque extraction. Les types ci-dessous "
        "sont ceux qu'indiquent les descriptions du catalogue, pas un inventaire vérifié de "
        "toutes leurs colonnes.",
        "- Variance et écart-type sont calculés comme statistiques de population "
        "(`ddof=0`) sur les observations effectivement présentes. Les identifiants numériques "
        "et codes sont traités comme qualitatifs et ne reçoivent pas de variance.",
        "",
        "## Catalogue : profil de toutes les colonnes",
        "",
        field_table(catalog_profiles),
        "",
        f"Le catalogue comporte {len(catalog)} sources; aucune valeur n'est manquante dans ses "
        "8 colonnes. Les URLs et textes sont des variables qualitatives, même si certains "
        "champs contiennent des chiffres.",
        "",
        "### Score de qualité estimé",
        "",
        f"Sur les {score['n']} scores (en %), la moyenne est **{format_number(score['mean'], 2)}**, "
        f"la médiane **{format_number(score['median'], 2)}**, Q1–Q3 "
        f"**{format_number(score['q1'], 2)}–{format_number(score['q3'], 2)}**, "
        f"min–max **{format_number(score['min'], 2)}–{format_number(score['max'], 2)}**. "
        f"Variance de population : **{format_number(score['variance'], 2)} points²**; "
        f"écart-type : **{format_number(score['std'], 2)} points**.",
        "",
        "Ce score est une estimation éditoriale du catalogue, pas une mesure publiée par "
        "les producteurs ni une variable des jeux sources; sa dispersion ne doit pas être "
        "interprétée comme une qualité objective des données.",
        "",
        "## Instantané local : entreprises et établissements",
        "",
        f"L'instantané contient **{snapshot['companyCount']} entreprises** et "
        f"**{snapshot['siteCount']} établissements**; les {snapshot['companySiteSearchCount']} "
        "recherches d'établissements ont trouvé une entreprise correspondante. Les "
        "identifiants SIREN/SIRET, codes NAF et codes postaux sont catégoriels, pas des "
        "quantités mesurables.",
        "",
        "### Métadonnées de premier niveau du JSON",
        "",
        markdown_table(
            ["Champ", "Type", "Manquants"],
            [
                [
                    profile["column"],
                    profile["type"],
                    f'{profile["missing"]}/{profile["n"]} '
                    f'({format_number(profile["missing_pct"], 1)} %)',
                ]
                for profile in root_profiles
            ],
        ),
        "",
        f"Comptages par activité du JSON : {activity_totals}.",
        "",
        "Les compteurs JSON sont des totaux agrégés (un seul instantané), pas une série "
        "d'observations : leur variance et leur écart-type ne sont donc pas calculés.",
        "",
        "### Entreprises (unité : entreprise)",
        "",
        field_table(company_profiles),
        "",
        "### Établissements (unité : établissement)",
        "",
        field_table(site_profiles),
        "",
        "### Statistiques des coordonnées",
        "",
        markdown_table(
            ["Niveau", "Colonne", "n", "Moyenne", "Variance (degrés²)", "Écart-type (degrés)",
             "Q1–Q3", "Min–max"],
            coordinate_rows,
        ),
        "",
        "Latitude et longitude sont stockées dans cet ordre pour les sièges sociaux et "
        "les établissements. "
        "Variance et écart-type en degrés sont descriptifs, mais ne mesurent pas directement "
        "une distance géographique. Le nombre de valeurs utilisées et les manquants figurent "
        "dans les profils de colonnes.",
        "",
        "Cet instantané provient de l'API Recherche d'entreprises et n'est pas l'extrait "
        "complet de la base Sirene décrit par le catalogue. Il est filtré sur les codes NAF "
        "21.10Z et 21.20Z; les établissements visibles dépendent aussi des coordonnées "
        "disponibles.",
        "",
        "## Lecture source par source",
        "",
        markdown_table(
            ["Source", "Primaire / secondaire", "Unité d'observation (selon le descriptif)",
             "Variables et types indiqués", "Statistiques des colonnes"],
            source_rows,
        ),
        "",
        "Les sources secondaires sont pertinentes pour cartographier l'offre, les produits, "
        "la consommation, la R&D, les échanges ou les achats publics; elles ne remplacent pas "
        "une collecte primaire si la question porte sur les motivations, la notoriété ou les "
        "comportements non observés dans ces registres. Les unités d'observation et périodes "
        "doivent être alignées avant tout croisement; agréger au bon niveau avant de joindre "
        "(par exemple entreprise, établissement, produit, territoire ou année).",
        "",
        "## Conclusion",
        "",
        "Le taux de valeurs manquantes est calculable et nul pour le catalogue local; il est "
        f"profilé champ par champ pour l'instantané local. Pour les {len(catalog)} sources cataloguées, "
        "les descriptions permettent de proposer des types de variables, mais pas de calculer "
        "les statistiques descriptives de leurs colonnes réelles. Il faut télécharger les "
        "extractions précises, fixer leur date/période et unité d'observation, puis relancer "
        "un profil sur ces fichiers pour obtenir ces chiffres sans extrapolation.",
        "",
        "### Références pédagogiques",
        "",
        "- Cours Smart Data Marketing, CM 2, « De la source à la preuve : les statistiques » : "
        "[mae.iae-mod.fr/seances/seance-cm-2.html](https://mae.iae-mod.fr/seances/seance-cm-2.html). "
        "Définitions mobilisées : source primaire/secondaire, unité d'observation, types de "
        "variables, moyenne/médiane, variance/écart-type et dispersion.",
        "- Catalogue de sources du dépôt : "
        "[`pharmaceutical_data_sources_fr.csv`](../pharmaceutical_data_sources_fr.csv).",
        "",
    ]
    return "\n".join(lines), analysis


def main() -> None:
    report, analysis = render()
    REPORT_PATH.write_text(report, encoding="utf-8")
    ANALYSIS_PATH.write_text(
        json.dumps(analysis, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"Rapport écrit dans {REPORT_PATH.relative_to(ROOT)}")
    print(f"Données du rapport écrites dans {ANALYSIS_PATH.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
