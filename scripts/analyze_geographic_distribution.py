#!/usr/bin/env python3
"""Compare the metropolitan locations of pharma company HQs and courses."""

from collections import Counter
import json
import math
from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np
from matplotlib.collections import PolyCollection
from sklearn.linear_model import LinearRegression


ROOT = Path(__file__).resolve().parents[1]
COMPANY_SOURCE = ROOT / "data" / "pharma-static-data.js"
COURSE_SOURCE = ROOT / "data" / "pharma-training-fr.json"
DEPARTMENT_SOURCE = ROOT / "data" / "france-departements-simplifie.geojson"
OUTPUT = ROOT / "data" / "geographic-regression.svg"

WEST, EAST, SOUTH, NORTH = -5.2, 9.7, 41.25, 51.2
MEAN_LATITUDE = 46.5
KILOMETRES_PER_DEGREE = 111.32
GRID_SIZE_KM = 50

COMPANY_COLOR = "#16745c"
COURSE_COLOR = "#7554a8"


def read_company_snapshot():
    source = COMPANY_SOURCE.read_text(encoding="utf-8")
    prefix, separator, payload = source.partition("=")
    if not separator or prefix.strip() != "window.PHARMA_STATIC_DATA":
        raise ValueError(f"Format inattendu dans {COMPANY_SOURCE.relative_to(ROOT)}")
    data = json.loads(payload.strip().removesuffix(";"))
    if not isinstance(data.get("companies"), list):
        raise ValueError("L’instantané doit contenir une liste « companies ».")
    return data["companies"]


def read_courses():
    data = json.loads(COURSE_SOURCE.read_text(encoding="utf-8"))
    if not isinstance(data.get("courses"), list):
        raise ValueError("L’instantané Parcoursup doit contenir une liste « courses ».")
    return data["courses"]


def parse_coordinates(value):
    if isinstance(value, str):
        try:
            latitude, longitude = (float(part.strip()) for part in value.split(",", 1))
        except ValueError:
            return None
    elif isinstance(value, list) and len(value) == 2:
        try:
            latitude, longitude = (float(part) for part in value)
        except (TypeError, ValueError):
            return None
    else:
        return None

    if (
        not math.isfinite(latitude)
        or not math.isfinite(longitude)
        or not SOUTH <= latitude <= NORTH
        or not WEST <= longitude <= EAST
    ):
        return None
    return latitude, longitude


def project(latitude, longitude):
    x = (
        (longitude - WEST)
        * math.cos(math.radians(MEAN_LATITUDE))
        * KILOMETRES_PER_DEGREE
    )
    y = (latitude - SOUTH) * KILOMETRES_PER_DEGREE
    return x, y


def points_for(records, coordinates):
    points = [
        project(*point)
        for record in records
        if (point := parse_coordinates(coordinates(record))) is not None
    ]
    if len(points) < 2:
        raise ValueError("Il faut au moins deux observations géolocalisées par groupe.")
    return np.asarray(points)


def metropolitan_department(code):
    return (code.isdigit() and 1 <= int(code) <= 95) or code in {"2A", "2B"}


def department_polygons():
    collection = json.loads(DEPARTMENT_SOURCE.read_text(encoding="utf-8"))
    polygons = []
    for feature in collection["features"]:
        code = str(feature["properties"].get("code", ""))
        if not metropolitan_department(code):
            continue
        geometry = feature["geometry"]
        if geometry["type"] == "Polygon":
            department_shapes = [geometry["coordinates"]]
        elif geometry["type"] == "MultiPolygon":
            department_shapes = geometry["coordinates"]
        else:
            raise ValueError(f"Géométrie non gérée : {geometry['type']}")

        for polygon in department_shapes:
            exterior = polygon[0]
            polygons.append(
                [project(latitude, longitude) for longitude, latitude in exterior]
            )
    return polygons


def fit_regression(points):
    model = LinearRegression().fit(points[:, :1], points[:, 1])
    x_line = np.linspace(points[:, 0].min(), points[:, 0].max(), 100)
    return model, x_line, model.predict(x_line.reshape(-1, 1))


def grid_counts(points):
    return Counter(
        (int(x // GRID_SIZE_KM), int(y // GRID_SIZE_KM))
        for x, y in points
    )


def spatial_comparison(company_points, course_points):
    company_cells = grid_counts(company_points)
    course_cells = grid_counts(course_points)
    cells = company_cells.keys() | course_cells.keys()
    company_distribution = np.array(
        [company_cells[cell] for cell in cells], dtype=float
    )
    course_distribution = np.array(
        [course_cells[cell] for cell in cells], dtype=float
    )
    company_distribution /= company_distribution.sum()
    course_distribution /= course_distribution.sum()
    similarity = float(
        np.dot(company_distribution, course_distribution)
        / (
            np.linalg.norm(company_distribution)
            * np.linalg.norm(course_distribution)
        )
    )

    course_coverage = sum(
        course_count
        for cell, course_count in course_cells.items()
        if cell in company_cells
    ) / len(course_points)
    company_coverage = sum(
        company_count
        for cell, company_count in company_cells.items()
        if cell in course_cells
    ) / len(company_points)
    centroid_distance = float(
        np.linalg.norm(company_points.mean(axis=0) - course_points.mean(axis=0))
    )
    return similarity, course_coverage, company_coverage, centroid_distance


def format_equation(model):
    return f"y = {model.coef_[0]:.3f}x {model.intercept_:+.1f}"


def main():
    companies = read_company_snapshot()
    courses = read_courses()
    company_points = points_for(
        companies,
        lambda company: (company.get("siege") or {}).get("coordonnees"),
    )
    course_points = points_for(courses, lambda course: course.get("coordinates"))
    company_model, company_x, company_y = fit_regression(company_points)
    course_model, course_x, course_y = fit_regression(course_points)
    similarity, course_coverage, company_coverage, centroid_distance = (
        spatial_comparison(company_points, course_points)
    )

    figure, axis = plt.subplots(figsize=(11, 10), layout="constrained")
    axis.add_collection(
        PolyCollection(
            department_polygons(),
            facecolors="#f8faf8",
            edgecolors="#d1ddd5",
            linewidths=0.45,
            zorder=0,
        )
    )
    axis.scatter(
        company_points[:, 0],
        company_points[:, 1],
        s=15,
        alpha=0.48,
        color=COMPANY_COLOR,
        label=(
            f"Sièges sociaux (n={len(company_points)}) · "
            f"{format_equation(company_model)} · "
            f"R²={company_model.score(company_points[:, :1], company_points[:, 1]):.3f}"
        ),
        zorder=2,
    )
    axis.scatter(
        course_points[:, 0],
        course_points[:, 1],
        s=17,
        alpha=0.58,
        color=COURSE_COLOR,
        label=(
            f"Formations (n={len(course_points)}) · "
            f"{format_equation(course_model)} · "
            f"R²={course_model.score(course_points[:, :1], course_points[:, 1]):.3f}"
        ),
        zorder=3,
    )
    axis.plot(company_x, company_y, color=COMPANY_COLOR, linewidth=2.2, zorder=4)
    axis.plot(course_x, course_y, color=COURSE_COLOR, linewidth=2.2, zorder=5)
    axis.set_xlim(0, project(SOUTH, EAST)[0])
    axis.set_ylim(0, project(NORTH, WEST)[1])
    axis.set_aspect("equal", adjustable="box")
    axis.set_xlabel("Est (km, projection équirectangulaire)")
    axis.set_ylabel("Nord (km, projection équirectangulaire)")
    axis.set_title(
        "Implantations pharmaceutiques et offre de formation\n"
        "France métropolitaine · droites des moindres carrés ordinaires"
    )
    axis.grid(color="#dbe4de", linewidth=0.5, alpha=0.7, zorder=1)
    axis.legend(loc="upper left", frameon=True, framealpha=0.96, fontsize=9)
    figure.text(
        0.5,
        0.012,
        (
            f"Grille commune de {GRID_SIZE_KM} × {GRID_SIZE_KM} km · "
            f"similarité cosinus des répartitions : {similarity:.3f} · "
            f"formations en cellule avec siège : {course_coverage:.1%} · "
            f"sièges en cellule avec formation : {company_coverage:.1%} · "
            f"écart des centroïdes : {centroid_distance:.0f} km"
        ),
        ha="center",
        color="#53645b",
        fontsize=9,
    )
    figure.savefig(OUTPUT, format="svg")
    plt.close(figure)
    svg_lines = OUTPUT.read_text(encoding="utf-8").splitlines()
    OUTPUT.write_text(
        "\n".join(line.rstrip() for line in svg_lines) + "\n",
        encoding="utf-8",
    )

    print(f"Graphique : {OUTPUT.relative_to(ROOT)}")
    print(
        f"Sièges sociaux géolocalisés en métropole : {len(company_points)} / "
        f"{len(companies)}"
    )
    print(
        f"Formations géolocalisées en métropole : {len(course_points)} / "
        f"{len(courses)}"
    )
    print(
        f"Régression des sièges sociaux : {format_equation(company_model)} ; "
        f"R²={company_model.score(company_points[:, :1], company_points[:, 1]):.3f}"
    )
    print(
        f"Régression des formations : {format_equation(course_model)} ; "
        f"R²={course_model.score(course_points[:, :1], course_points[:, 1]):.3f}"
    )
    print(
        f"Similarité cosinus des répartitions par cellule de {GRID_SIZE_KM} km : "
        f"{similarity:.3f}"
    )
    print(f"Formations dans une cellule avec siège social : {course_coverage:.1%}")
    print(f"Sièges dans une cellule avec formation : {company_coverage:.1%}")
    print(f"Distance entre centroïdes : {centroid_distance:.1f} km")
    print(
        "Limite : les droites décrivent une tendance nord-sud selon l’axe est-ouest ; "
        "elles ne suffisent pas à conclure sur l’homogénéité."
    )


if __name__ == "__main__":
    main()
