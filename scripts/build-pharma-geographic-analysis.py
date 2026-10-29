#!/usr/bin/env python3
"""Build static pharmaceutical and training counts by department and region."""

import csv
import json
import math
import re
import unicodedata
from collections import Counter
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
INPUT_BUNDLE = DATA / "pharma-static-data.js"
TRAINING_CSV = DATA / "formations-pharma-fr.csv"
DEPARTMENTS = DATA / "france-departements-simplifie.geojson"
OUTPUT = DATA / "pharma-geographic-analysis.js"
TRAINING_MAP_OUTPUT = DATA / "pharma-training-map.js"

REGIONS = {
    "Auvergne-Rhône-Alpes": ("01", "03", "07", "15", "26", "38", "42", "43", "63", "69", "73", "74"),
    "Bourgogne-Franche-Comté": ("21", "25", "39", "58", "70", "71", "89", "90"),
    "Bretagne": ("22", "29", "35", "56"),
    "Centre-Val de Loire": ("18", "28", "36", "37", "41", "45"),
    "Corse": ("2A", "2B"),
    "Grand Est": ("08", "10", "51", "52", "54", "55", "57", "67", "68", "88"),
    "Hauts-de-France": ("02", "59", "60", "62", "80"),
    "Île-de-France": ("75", "77", "78", "91", "92", "93", "94", "95"),
    "Normandie": ("14", "27", "50", "61", "76"),
    "Nouvelle-Aquitaine": ("16", "17", "19", "23", "24", "33", "40", "47", "64", "79", "86", "87"),
    "Occitanie": ("09", "11", "12", "30", "31", "32", "34", "46", "48", "65", "66", "81", "82"),
    "Pays de la Loire": ("44", "49", "53", "72", "85"),
    "Provence-Alpes-Côte d'Azur": ("04", "05", "06", "13", "83", "84"),
}
DEPARTMENT_REGIONS = {
    department: region
    for region, departments in REGIONS.items()
    for department in departments
}
COUNT_FIELDS = ("formations", "entreprises", "sites")
TRAINING_DOMAINS = (
    ("Microbiologie et infectiologie", r"microbiolog|virolog|bacteriolog|mycolog|parasitolog"),
    ("Biologie moléculaire et cellulaire", r"biochim|biologie moleculaire|biologie cellulaire|genet|immunolog|physiologie cellulaire"),
    ("Biologie médicale et analyses biologiques", r"biologie medicale|bioanalys|analyse[s]? biologique|diagnostic biologique|hematolog|cytolog"),
    ("Chimie, analyses et formulation", r"chim|analytique|chromatograph|spectrom|formulation|materiaux"),
    ("Biotechnologies et bioprocédés", r"biotechn|genie biologique|bioproced|culture cellulaire"),
    ("Pharmacie et médicament", r"pharm|medicament|pharmacolog|galenique|sciences pharmaceutiques"),
    ("Qualité, contrôle et réglementation", r"qualite|reglement|metrologie|bpf|gmp|validation|controle"),
    ("Production et procédés industriels", r"production|procede|automatis|maintenance|conditionnement|industrialisation"),
    ("Sciences du vivant, environnement et alimentation", r"sciences de la vie|sciences du vivant|environnement|ecolog|nutrition|agronom|aliment|biologie"),
)
FALLBACK_DOMAINS = {
    "Chimie et sciences analytiques": "Chimie, analyses et formulation",
    "Biotechnologies et analyses biologiques": "Biotechnologies et bioprocédés",
    "Pharmacie et produits de santé": "Pharmacie et médicament",
    "Sciences de la vie et du vivant": "Sciences du vivant, environnement et alimentation",
    "Accès aux études de pharmacie et de santé": "Accès aux études de santé",
    "Procédés, production et automatisme industriels": "Production et procédés industriels",
    "Qualité, métrologie, maintenance et conditionnement": "Qualité, contrôle et réglementation",
}


def normalize_text(value):
    normalized = unicodedata.normalize("NFD", value.casefold())
    return "".join(character for character in normalized if unicodedata.category(character) != "Mn")


def classify_training_domain(offer):
    fields = ("formation", "intitule_admission", "parcours", "filiere")
    searchable = normalize_text(" ".join(offer.get(field, "") or "" for field in fields))
    for domain, pattern in TRAINING_DOMAINS:
        if re.search(pattern, searchable):
            return domain
    category = offer.get("categorie", "")
    return FALLBACK_DOMAINS.get(category, "Autres parcours des sciences du vivant")


def load_bundle():
    content = INPUT_BUNDLE.read_text(encoding="utf-8")
    prefix = "window.PHARMA_STATIC_DATA = "
    if not content.startswith(prefix):
        raise ValueError(f"Le bundle {INPUT_BUNDLE} n'a pas le format attendu.")
    return json.loads(content[len(prefix):].strip().removesuffix(";"))


def geometry_parts(feature):
    geometry = feature["geometry"]
    if geometry["type"] == "Polygon":
        return [geometry["coordinates"]]
    if geometry["type"] == "MultiPolygon":
        return geometry["coordinates"]
    raise ValueError(f"Géométrie non gérée : {geometry['type']}")


def build_department_index(collection):
    departments = []
    for feature in collection["features"]:
        properties = feature["properties"]
        code = str(properties.get("code", ""))
        if code not in DEPARTMENT_REGIONS:
            continue
        polygons = []
        for polygon in geometry_parts(feature):
            exterior = polygon[0]
            longitudes = [point[0] for point in exterior]
            latitudes = [point[1] for point in exterior]
            polygons.append({
                "bounds": (
                    min(longitudes),
                    min(latitudes),
                    max(longitudes),
                    max(latitudes),
                ),
                "rings": polygon,
            })
        departments.append({
            "code": code,
            "name": str(properties["nom"]),
            "region": DEPARTMENT_REGIONS[code],
            "polygons": polygons,
        })
    return departments


def ring_contains(ring, longitude, latitude):
    inside = False
    previous = ring[-1]
    for current in ring:
        x1, y1 = previous[:2]
        x2, y2 = current[:2]
        cross = (longitude - x1) * (y2 - y1) - (latitude - y1) * (x2 - x1)
        if (
            abs(cross) < 1e-10
            and min(x1, x2) - 1e-10 <= longitude <= max(x1, x2) + 1e-10
            and min(y1, y2) - 1e-10 <= latitude <= max(y1, y2) + 1e-10
        ):
            return True
        if (y1 > latitude) != (y2 > latitude):
            crossing = (x2 - x1) * (latitude - y1) / (y2 - y1) + x1
            if longitude < crossing:
                inside = not inside
        previous = current
    return inside


def find_department(coordinate, departments):
    if not isinstance(coordinate, list) or len(coordinate) != 2:
        return None
    try:
        latitude, longitude = map(float, coordinate)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(latitude) or not math.isfinite(longitude):
        return None

    for department in departments:
        for polygon in department["polygons"]:
            west, south, east, north = polygon["bounds"]
            if not (west <= longitude <= east and south <= latitude <= north):
                continue
            rings = polygon["rings"]
            if ring_contains(rings[0], longitude, latitude) and not any(
                ring_contains(hole, longitude, latitude) for hole in rings[1:]
            ):
                return department
    return None


def company_coordinate(company):
    coordinate = (company.get("siege") or {}).get("coordonnees")
    if not isinstance(coordinate, str):
        return None
    try:
        return [float(value) for value in coordinate.split(",")]
    except ValueError:
        return None


def training_coordinate(offer):
    try:
        latitude = float(offer.get("latitude", "").replace(",", "."))
        longitude = float(offer.get("longitude", "").replace(",", "."))
    except (AttributeError, TypeError, ValueError):
        return None
    return [latitude, longitude]


def load_training_offers():
    with TRAINING_CSV.open(encoding="utf-8-sig", newline="") as file:
        return list(csv.DictReader(file, delimiter=";"))


def count_records(records, coordinate_for, departments, counters):
    located = 0
    for record in records:
        department = find_department(coordinate_for(record), departments)
        if department is None:
            continue
        counters[department["code"]] += 1
        located += 1
    return located


def main():
    snapshot = load_bundle()
    training_offers = load_training_offers()
    collection = json.loads(DEPARTMENTS.read_text(encoding="utf-8"))
    departments = build_department_index(collection)
    if set(department["code"] for department in departments) != set(DEPARTMENT_REGIONS):
        raise ValueError("La carte des départements ne correspond pas au découpage régional.")

    department_counters = {
        field: Counter() for field in COUNT_FIELDS
    }
    training_map_records = []
    located_training_offers = 0
    for offer in training_offers:
        coordinates = training_coordinate(offer)
        department = find_department(coordinates, departments)
        if department is None:
            continue
        department_counters["formations"][department["code"]] += 1
        located_training_offers += 1
        training_map_records.append({
            "title": offer.get("intitule_admission") or offer.get("formation") or "",
            "formation": offer.get("formation") or "",
            "pathway": offer.get("parcours") or "",
            "institution": offer.get("etablissement") or "",
            "city": offer.get("ville") or "",
            "region": offer.get("region") or department["region"],
            "coordinates": coordinates,
            "domain": classify_training_domain(offer),
            "category": offer.get("categorie") or "",
            "modality": offer.get("modalite_formation") or "",
            "source": offer.get("source") or offer.get("type_offre") or "",
            "url": offer.get("url_formation") or "",
        })

    totals = {
        "formations": {
            "records": len(training_offers),
            "located": located_training_offers,
        },
        "entreprises": {
            "records": len(snapshot["companies"]),
            "located": count_records(
                snapshot["companies"],
                company_coordinate,
                departments,
                department_counters["entreprises"],
            ),
        },
        "sites": {
            "records": len(snapshot["sites"]),
            "located": count_records(
                snapshot["sites"],
                lambda site: site.get("coordinates"),
                departments,
                department_counters["sites"],
            ),
        },
    }

    department_rows = []
    for department in sorted(departments, key=lambda item: item["code"]):
        department_rows.append({
            "code": department["code"],
            "name": department["name"],
            "region": department["region"],
            **{
                field: department_counters[field][department["code"]]
                for field in COUNT_FIELDS
            },
        })

    region_rows = []
    for region in REGIONS:
        department_codes = REGIONS[region]
        region_rows.append({
            "name": region,
            **{
                field: sum(department_counters[field][code] for code in department_codes)
                for field in COUNT_FIELDS
            },
        })

    map_features = []
    for feature in collection["features"]:
        code = str(feature["properties"].get("code", ""))
        if code not in DEPARTMENT_REGIONS:
            continue
        map_features.append({
            "type": "Feature",
            "geometry": feature["geometry"],
            "properties": {
                "code": code,
                "name": str(feature["properties"]["nom"]),
                "region": DEPARTMENT_REGIONS[code],
                **{
                    field: department_counters[field][code]
                    for field in COUNT_FIELDS
                },
            },
        })

    analysis = {
        "generatedAt": snapshot.get("generatedAt"),
        "trainingGeneratedAt": max(
            (offer.get("date_collecte", "") for offer in training_offers),
            default=snapshot.get("trainingGeneratedAt"),
        ),
        "totals": totals,
        "regions": region_rows,
        "departments": department_rows,
        "mapDepartments": {
            "type": "FeatureCollection",
            "features": map_features,
        },
    }
    OUTPUT.write_text(
        f"window.PHARMA_GEO_ANALYSIS = {json.dumps(analysis, ensure_ascii=False, separators=(',', ':'))};\n",
        encoding="utf-8",
    )
    training_map = {
        "generatedAt": analysis["trainingGeneratedAt"],
        "totalRecords": len(training_offers),
        "records": training_map_records,
    }
    TRAINING_MAP_OUTPUT.write_text(
        f"window.PHARMA_TRAINING_MAP = {json.dumps(training_map, ensure_ascii=False, separators=(',', ':'))};\n",
        encoding="utf-8",
    )
    print(
        "Répartition écrite : "
        f"{totals['formations']['located']} formations sur "
        f"{totals['formations']['records']}, "
        f"{totals['entreprises']['located']} sièges et "
        f"{totals['sites']['located']} sites géolocalisés."
    )


if __name__ == "__main__":
    main()
