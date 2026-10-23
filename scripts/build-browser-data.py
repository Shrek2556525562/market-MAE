#!/usr/bin/env python3
"""Bundle the checked-in company and training snapshots for offline pages."""

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
COMPANY_DATA = ROOT / "data" / "pharmaceutical-companies-fr.json"
TRAINING_DATA = ROOT / "data" / "pharma-training-fr.json"
OUTPUT = ROOT / "data" / "pharma-static-data.js"


def main():
    with COMPANY_DATA.open(encoding="utf-8-sig") as source:
        companies = json.load(source)
    with TRAINING_DATA.open(encoding="utf-8-sig") as source:
        training = json.load(source)

    if not isinstance(companies.get("companies"), list):
        raise ValueError("L'instantané doit contenir une liste d'entreprises.")
    if not isinstance(companies.get("sites"), list):
        raise ValueError("L'instantané doit contenir une liste de sites.")
    if not isinstance(training.get("courses"), list):
        raise ValueError("L'instantané doit contenir une liste de formations.")

    snapshot = {
        "generatedAt": companies.get("generatedAt"),
        "activityTotals": companies.get("activityTotals", {}),
        "companies": companies["companies"],
        "sites": companies["sites"],
        "courses": training["courses"],
    }
    serialized = json.dumps(snapshot, ensure_ascii=False, separators=(",", ":"))
    OUTPUT.write_text(
        f"window.PHARMA_STATIC_DATA = {serialized};\n",
        encoding="utf-8",
    )
    print(
        f"{len(companies['companies'])} entreprises, {len(companies['sites'])} sites "
        f"et {len(training['courses'])} formations écrits dans "
        f"{OUTPUT.relative_to(ROOT)}"
    )


if __name__ == "__main__":
    main()
