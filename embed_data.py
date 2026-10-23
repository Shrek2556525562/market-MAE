#!/usr/bin/env python3
"""
Écrit les données des cartes directement dans les pages HTML.

Les pages n'appellent ni API ni fichier au chargement : les données brutes
sont dans une balise <script type="application/json"> de chaque page, entre
deux marqueurs. Les cartes s'affichent donc aussi en ouvrant le fichier
HTML depuis le disque, sans serveur.

  index.html    ← data/pharmaceutical-companies-fr.json
  viviers.html  ← data/viviers-formations.json

À relancer après chaque mise à jour des données :
  python scripts/embed_data.py
(build_viviers.py l'appelle automatiquement.)
"""

from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

PAGES = [
    (ROOT / "index.html", "companies-data", ROOT / "data" / "pharmaceutical-companies-fr.json"),
    (ROOT / "viviers.html", "viviers-data", ROOT / "data" / "viviers-formations.json"),
]


def bloc(script_id: str, data) -> str:
    texte = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    # « </ » fermerait la balise <script> : on l'échappe, le JSON reste valide.
    texte = texte.replace("</", "<\\/")
    return (
        f"<!-- DONNEES:{script_id}:debut (généré par scripts/embed_data.py, ne pas modifier à la main) -->\n"
        f'    <script id="{script_id}" type="application/json">{texte}</script>\n'
        f"    <!-- DONNEES:{script_id}:fin -->"
    )


def integrer(page: Path, script_id: str, source: Path) -> None:
    data = json.loads(source.read_text(encoding="utf-8-sig"))
    html = page.read_text(encoding="utf-8")
    motif = re.compile(
        rf"<!-- DONNEES:{re.escape(script_id)}:debut.*?<!-- DONNEES:{re.escape(script_id)}:fin -->",
        re.S,
    )
    nouveau = bloc(script_id, data)
    if motif.search(html):
        html = motif.sub(lambda _: nouveau, html)
    else:
        # Première intégration : juste avant le premier <script src=…> de fin de page.
        repere = html.rindex("<script\n      src=\"https://cdnjs")
        html = html[:repere] + nouveau + "\n    " + html[repere:]
    page.write_text(html, encoding="utf-8")
    print(f"{page.name} : {source.name} intégré ({len(nouveau) / 1024:.0f} Ko)")


def main() -> None:
    for page, script_id, source in PAGES:
        integrer(page, script_id, source)


if __name__ == "__main__":
    main()
