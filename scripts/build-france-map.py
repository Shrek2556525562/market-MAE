#!/usr/bin/env python3
"""Build an offline SVG basemap from the simplified metropolitan GeoJSON."""

import json
import math
from html import escape
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "data" / "france-departements-simplifie.geojson"
OUTPUT = ROOT / "data" / "france-metropolitaine.svg"
VIEWBOX_WIDTH = 900
VIEWBOX_HEIGHT = 930
PLOT_LEFT = 50
PLOT_TOP = 40
PLOT_WIDTH = 800
PLOT_HEIGHT = 850
WEST, EAST, SOUTH, NORTH = -5.2, 9.7, 41.25, 51.2
LONGITUDE_SCALE = math.cos(math.radians(46.5))


def project(coordinate):
    longitude, latitude = coordinate[:2]
    x = PLOT_LEFT + (
        (longitude - WEST) * LONGITUDE_SCALE
        / ((EAST - WEST) * LONGITUDE_SCALE)
        * PLOT_WIDTH
    )
    y = PLOT_TOP + (NORTH - latitude) / (NORTH - SOUTH) * PLOT_HEIGHT
    return x, y


def ring_path(ring):
    points = [project(point) for point in ring]
    if not points:
        return ""
    return "M" + "L".join(f"{x:.2f},{y:.2f}" for x, y in points) + "Z"


def polygon_path(polygon):
    return " ".join(ring_path(ring) for ring in polygon)


def geometry_path(geometry):
    if geometry["type"] == "Polygon":
        return polygon_path(geometry["coordinates"])
    if geometry["type"] == "MultiPolygon":
        return " ".join(polygon_path(polygon) for polygon in geometry["coordinates"])
    raise ValueError(f"Géométrie non gérée : {geometry['type']}")


def is_metropolitan_department(code):
    return code.isdigit() and 1 <= int(code) <= 95 or code in {"2A", "2B"}


def main():
    with SOURCE.open(encoding="utf-8") as source:
        collection = json.load(source)

    paths = []
    for feature in collection["features"]:
        code = str(feature["properties"].get("code", ""))
        if not is_metropolitan_department(code):
            continue
        name = escape(str(feature["properties"].get("nom", code)), quote=True)
        paths.append(
            f'<path d="{geometry_path(feature["geometry"])}" '
            f'data-departement="{escape(code, quote=True)}" '
            f'aria-label="{name}"/>'
        )

    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {VIEWBOX_WIDTH} {VIEWBOX_HEIGHT}" '
        'role="img" aria-label="Carte des départements de France métropolitaine">'
        '<rect width="900" height="930" fill="#e9f0eb"/>'
        '<g fill="#fbfcfa" stroke="#cbd8cf" stroke-width="1.15" '
        'stroke-linejoin="round" vector-effect="non-scaling-stroke">'
        + "".join(paths)
        + "</g></svg>\n"
    )
    OUTPUT.write_text(svg, encoding="utf-8")
    print(
        f"{len(paths)} départements écrits dans {OUTPUT.relative_to(ROOT)} "
        f"({OUTPUT.stat().st_size:,} octets)"
    )


if __name__ == "__main__":
    main()
