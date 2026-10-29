#!/usr/bin/env python3
"""Build a small, local map dataset from the downloaded Parcoursup export."""

import csv
from datetime import datetime, timezone
import json
import re
import unicodedata
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE = (
    ROOT
    / "data"
    / "downloads"
    / "parcoursup-2025-applications-and-admission-responses.csv"
)
OUTPUT = ROOT / "data" / "pharma-training-fr.json"
COURSE_FIELDS = (
    "lib_for_voe_ins",
    "form_lib_voe_acc",
    "detail_forma",
    "detail_forma2",
)
RELEVANT = re.compile(
    r"pharmaceut|pharmacie|medicament|biopharm|biotechnolog|"
    r"biologie medicale|sciences biomedicales|biosante|bio-industrie|"
    r"biologie-sante|\bpass\b|\blas\b|acces sante",
)
EXCLUDED = re.compile(
    r"aliment|agricol|agroaliment|agroressource|cosmetique|parfumerie|"
    r"audioprothesiste"
)


def normalized(value):
    decomposed = unicodedata.normalize("NFD", value.casefold())
    return "".join(
        character
        for character in decomposed
        if unicodedata.category(character) != "Mn"
    )


def coordinates(value):
    try:
        latitude, longitude = (float(part.strip()) for part in value.split(",", 1))
    except (AttributeError, ValueError):
        return None
    if not (41.25 <= latitude <= 51.2 and -5.2 <= longitude <= 9.7):
        return None
    return [latitude, longitude]


def main():
    courses = {}
    with SOURCE.open(encoding="utf-8-sig", newline="") as source:
        for row in csv.DictReader(source, delimiter=";"):
            title = " · ".join(
                value.strip()
                for field in COURSE_FIELDS
                if (value := row.get(field, "").strip())
            )
            searchable = normalized(title)
            if not RELEVANT.search(searchable) or EXCLUDED.search(searchable):
                continue

            point = coordinates(row.get("g_olocalisation_des_formations", ""))
            if not point:
                continue

            institution = row.get("g_ea_lib_vx", "").strip()
            city = row.get("ville_etab", "").strip()
            uai = row.get("cod_uai", "").strip()
            key = (uai, title, point[0], point[1])
            courses[key] = {
                "id": "|".join(map(str, key)),
                "title": title,
                "institution": institution or "Établissement non précisé",
                "city": city or "Ville non précisée",
                "region": row.get("region_etab_aff", "").strip(),
                "coordinates": point,
                "url": row.get("lien_form_psup", "").strip(),
            }

    result = {
        "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "source": "data/downloads/parcoursup-2025-applications-and-admission-responses.csv",
        "courses": sorted(
            courses.values(),
            key=lambda course: (
                course["city"].casefold(),
                course["institution"].casefold(),
                course["title"].casefold(),
            ),
        ),
    }
    OUTPUT.write_text(
        json.dumps(result, ensure_ascii=False, separators=(",", ":")) + "\n",
        encoding="utf-8",
    )
    print(f"{len(courses)} formations géolocalisées écrites dans {OUTPUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
