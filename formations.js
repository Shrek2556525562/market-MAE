const snapshot = window.PHARMA_STATIC_DATA;
const courses = new Map();
const companies = new Map();
const sites = new Map();
const courseMarkers = new Map();
const companyMarkers = new Map();
const siteMarkers = new Map();

const mapError = document.querySelector("#map-error");
const courseList = document.querySelector("#course-list");
const courseSearch = document.querySelector("#course-search");
const courseCount = document.querySelector("#course-count");
const courseCaption = document.querySelector("#course-caption");
const visibleCount = document.querySelector("#visible-count");
const visibleCourseCount = document.querySelector("#visible-course-count");
const companyCount = document.querySelector("#company-count");
const siteCount = document.querySelector("#site-count");
const mapResultCount = document.querySelector("#map-result-count");
const showTrainingInput = document.querySelector("#show-training");
const showCompaniesInput = document.querySelector("#show-companies");
const showSitesInput = document.querySelector("#show-sites");
const map = window.PharmaMap.create(
  document.querySelector("#map"),
  document.querySelector("#map-popup"),
  document.querySelector(".map-panel"),
);

function getVisibleCourses() {
  const query = courseSearch.value.trim().toLocaleLowerCase("fr");
  return [...courses.values()].filter((course) =>
    [
      course.title,
      course.institution,
      course.city,
      course.region,
    ]
      .join(" ")
      .toLocaleLowerCase("fr")
      .includes(query),
  );
}

function createCourseRow(course) {
  const button = document.createElement("button");
  button.className = "company-row ecosystem-course-row";
  button.type = "button";
  button.setAttribute(
    "aria-label",
    `${course.title}, ${course.institution}, ${course.city}`,
  );

  const avatar = document.createElement("span");
  avatar.className = "company-avatar";
  avatar.textContent = "F";
  button.append(avatar);

  const copy = document.createElement("span");
  copy.className = "ecosystem-course-row-copy";

  const title = document.createElement("strong");
  title.textContent = course.title;
  copy.append(title);

  const location = document.createElement("small");
  location.textContent = `${course.institution} · ${course.city}`;
  copy.append(location);
  button.append(copy);

  const arrow = document.createElement("span");
  arrow.className = "company-row-arrow";
  arrow.setAttribute("aria-hidden", "true");
  arrow.textContent = "›";
  button.append(arrow);

  button.addEventListener("click", () => {
    map.focus(course.coordinates, 3.5);
    map.open(courseMarkers.get(course.id));
  });
  return button;
}

function updateView() {
  const visibleCourses = getVisibleCourses();
  const visibleCourseIds = new Set(visibleCourses.map((course) => course.id));

  for (const [id, marker] of courseMarkers) {
    map.setVisible(marker, showTrainingInput.checked && visibleCourseIds.has(id));
  }
  for (const marker of companyMarkers.values()) {
    map.setVisible(marker, showCompaniesInput.checked);
  }
  for (const marker of siteMarkers.values()) {
    map.setVisible(marker, showSitesInput.checked);
  }

  courseList.replaceChildren();
  if (visibleCourses.length === 0) {
    const emptyState = document.createElement("div");
    emptyState.className = "list-state";
    emptyState.textContent = "Aucune formation ne correspond à cette recherche.";
    courseList.append(emptyState);
  } else {
    const fragment = document.createDocumentFragment();
    for (const course of visibleCourses) {
      fragment.append(createCourseRow(course));
    }
    courseList.append(fragment);
  }

  visibleCount.textContent = visibleCourses.length.toLocaleString("fr-FR");
  visibleCourseCount.textContent = visibleCourses.length.toLocaleString("fr-FR");
  const visibleCoursesCount = showTrainingInput.checked
    ? visibleCourses.length
    : 0;
  const visibleCompaniesCount = showCompaniesInput.checked
    ? companyMarkers.size
    : 0;
  const visibleSitesCount = showSitesInput.checked ? siteMarkers.size : 0;
  const points =
    visibleCoursesCount + visibleCompaniesCount + visibleSitesCount;
  mapResultCount.textContent = `${points.toLocaleString("fr-FR")} ${
    points > 1 ? "points affichés" : "point affiché"
  }`;
}

function loadSnapshot() {
  if (
    !snapshot ||
    !Array.isArray(snapshot.courses) ||
    !Array.isArray(snapshot.companies) ||
    !Array.isArray(snapshot.sites)
  ) {
    throw new Error("Le jeu de données statique de la carte est introuvable.");
  }

  for (const course of snapshot.courses) {
    courses.set(course.id, course);
    const marker = map.addMarker({
      coordinates: course.coordinates,
      title: course.title,
      details: [
        course.institution,
        [course.city, course.region].filter(Boolean).join(" · "),
      ],
      href: course.url,
      linkLabel: "Voir la formation sur Parcoursup ↗",
      layer: "training",
      color: "#7554a8",
      radius: 6,
    });
    if (marker) courseMarkers.set(course.id, marker);
  }

  for (const company of snapshot.companies) {
    if (!company.siren || !company.nom_complet) continue;
    const marker = map.addMarker({
      coordinates: company.siege?.coordonnees,
      title: company.nom_complet,
      details: [
        [company.siege?.libelle_commune, company.siege?.code_postal]
          .filter(Boolean)
          .join(" · "),
        company.activityCodes?.join(" · "),
      ],
      href: `https://annuaire-entreprises.data.gouv.fr/entreprise/${encodeURIComponent(company.siren)}`,
      linkLabel: "Voir la fiche entreprise ↗",
      layer: "company",
      color: "#16745c",
      radius: 6.5,
    });
    if (marker) {
      companies.set(company.siren, company);
      companyMarkers.set(company.siren, marker);
    }
  }

  for (const site of snapshot.sites) {
    if (!["21.10Z", "21.20Z"].includes(site.etablissement?.activite_principale)) {
      continue;
    }
    const marker = map.addMarker({
      coordinates: site.coordinates,
      title: site.companyName,
      details: [
        "Établissement industriel",
        [site.etablissement.adresse, site.etablissement.libelle_commune]
          .filter(Boolean)
          .join(" · "),
        `${site.etablissement.activite_principale} · SIRET ${site.siret}`,
      ],
      href: `https://annuaire-entreprises.data.gouv.fr/etablissement/${encodeURIComponent(site.siret)}`,
      linkLabel: "Voir la fiche établissement ↗",
      layer: "site",
      color: "#334d71",
      radius: 5,
    });
    if (marker) {
      sites.set(site.siret, site);
      siteMarkers.set(site.siret, marker);
    }
  }

  courseCount.textContent = courses.size.toLocaleString("fr-FR");
  courseCaption.textContent = "Parcoursup 2025 · sélection par intitulés";
  companyCount.textContent = companyMarkers.size.toLocaleString("fr-FR");
  siteCount.textContent = siteMarkers.size.toLocaleString("fr-FR");
  updateView();
}

courseSearch.addEventListener("input", updateView);
showTrainingInput.addEventListener("change", updateView);
showCompaniesInput.addEventListener("change", updateView);
showSitesInput.addEventListener("change", updateView);

try {
  loadSnapshot();
} catch (error) {
  console.error("Échec de l’affichage du jeu de données statique.", error);
  mapError.textContent = error.message;
  mapError.hidden = false;
}
