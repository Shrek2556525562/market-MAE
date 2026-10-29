const SITE_CODES = new Set(["21.10Z", "21.20Z"]);
const snapshot = window.PHARMA_STATIC_DATA;
const companies = new Map();
const sites = new Map();
const companyMarkers = new Map();
const siteMarkers = new Map();

const activityTypes = [
  {
    code: "21.10Z",
    countElement: document.querySelector("#count-2110"),
  },
  {
    code: "21.20Z",
    countElement: document.querySelector("#count-2120"),
  },
];

const totalCount = document.querySelector("#total-count");
const loadedCount = document.querySelector("#loaded-count");
const companyList = document.querySelector("#company-list");
const companySearch = document.querySelector("#company-search");
const visibleCount = document.querySelector("#visible-count");
const mapResultCount = document.querySelector("#map-result-count");
const siteCount = document.querySelector("#site-count");
const showSitesInput = document.querySelector("#show-sites");
const filterInputs = [...document.querySelectorAll(".filter-option input")];
const map = window.PharmaMap.create(
  document.querySelector("#map"),
  document.querySelector("#map-popup"),
  document.querySelector(".map-panel"),
);

function getEnabledCodes() {
  return new Set(
    filterInputs.filter((input) => input.checked).map((input) => input.value),
  );
}

function createCompanyRow(company) {
  const button = document.createElement("button");
  button.className = "company-row";
  button.type = "button";
  button.disabled = !companyMarkers.has(company.siren);
  button.setAttribute(
    "aria-label",
    `${company.nom_complet}, siège à ${company.siege?.libelle_commune ?? "adresse inconnue"}${button.disabled ? ", coordonnées indisponibles sur la carte" : ""}`,
  );

  const avatar = document.createElement("span");
  avatar.className = "company-avatar";
  avatar.textContent = company.nom_complet.trim().charAt(0) || "P";
  button.append(avatar);

  const copy = document.createElement("span");
  copy.className = "company-row-copy";

  const name = document.createElement("strong");
  name.textContent = company.nom_complet;
  copy.append(name);

  const location = document.createElement("small");
  location.textContent = [
    company.siege?.libelle_commune,
    company.activityCodes.join(" · "),
    button.disabled ? "Coordonnées hors carte" : "",
  ]
    .filter(Boolean)
    .join(" · ");
  copy.append(location);
  button.append(copy);

  const arrow = document.createElement("span");
  arrow.className = "company-row-arrow";
  arrow.setAttribute("aria-hidden", "true");
  arrow.textContent = "›";
  button.append(arrow);

  if (!button.disabled) {
    button.addEventListener("click", () => {
      map.focus(companyMarkers.get(company.siren).coordinates, 3.5);
      map.open(companyMarkers.get(company.siren).element);
    });
  }

  return button;
}

function getVisibleCompanies() {
  const enabledCodes = getEnabledCodes();
  const query = companySearch.value.trim().toLocaleLowerCase("fr");

  return [...companies.values()]
    .filter((company) =>
      company.activityCodes.some((code) => enabledCodes.has(code)),
    )
    .filter((company) => {
      if (!query) return true;
      return [
        company.nom_complet,
        company.siren,
        company.siege?.libelle_commune,
        company.siege?.code_postal,
      ]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase("fr")
        .includes(query);
    })
    .sort((left, right) => left.nom_complet.localeCompare(right.nom_complet, "fr"));
}

function updateView() {
  const visibleCompanies = getVisibleCompanies();
  const visibleSirens = new Set(
    visibleCompanies.map((company) => company.siren),
  );
  const enabledCodes = getEnabledCodes();

  for (const [siren, marker] of companyMarkers) {
    const company = companies.get(siren);
    map.setVisible(
      marker.element,
      visibleSirens.has(siren) &&
        company.activityCodes.some((code) => enabledCodes.has(code)),
    );
  }

  for (const [siret, marker] of siteMarkers) {
    const site = sites.get(siret);
    map.setVisible(
      marker.element,
      showSitesInput.checked && visibleSirens.has(site.companySiren),
    );
  }

  companyList.replaceChildren();
  if (visibleCompanies.length === 0) {
    const emptyState = document.createElement("div");
    emptyState.className = "list-state";
    emptyState.textContent = "Aucune entreprise ne correspond à cette recherche.";
    companyList.append(emptyState);
  } else {
    const fragment = document.createDocumentFragment();
    for (const company of visibleCompanies) {
      fragment.append(createCompanyRow(company));
    }
    companyList.append(fragment);
  }

  visibleCount.textContent = visibleCompanies.length.toLocaleString("fr-FR");
  const estimate = activityTypes.reduce(
    (sum, activity) =>
      sum +
      (enabledCodes.has(activity.code)
        ? (snapshot.activityTotals[activity.code] ?? 0)
        : 0),
    0,
  );
  totalCount.textContent = estimate.toLocaleString("fr-FR");

  for (const activity of activityTypes) {
    activity.countElement.textContent = (
      snapshot.activityTotals[activity.code] ?? 0
    ).toLocaleString("fr-FR");
  }

  const visibleCompanyMarkers = [...visibleSirens].filter((siren) =>
    companyMarkers.has(siren),
  ).length;
  const visibleSites = showSitesInput.checked
    ? [...siteMarkers.values()].filter((marker) =>
        visibleSirens.has(marker.companySiren),
      ).length
    : 0;
  siteCount.textContent = sites.size.toLocaleString("fr-FR");
  const shownPoints = visibleCompanyMarkers + visibleSites;
  mapResultCount.textContent = `${shownPoints.toLocaleString("fr-FR")} ${
    shownPoints > 1 ? "points affichés" : "point affiché"
  }`;
}

function loadSnapshot() {
  if (
    !snapshot ||
    !Array.isArray(snapshot.companies) ||
    !Array.isArray(snapshot.sites)
  ) {
    throw new Error("Le jeu de données statique des entreprises est introuvable.");
  }

  for (const company of snapshot.companies) {
    if (
      !company.siren ||
      !company.nom_complet ||
      !company.activityCodes?.some((code) => SITE_CODES.has(code))
    ) {
      continue;
    }
    companies.set(company.siren, company);

    const color = company.activityCodes.includes("21.10Z")
      ? "#16745c"
      : "#df8a49";
    const marker = map.addMarker({
      coordinates: company.siege?.coordonnees,
      title: company.nom_complet,
      details: [
        [company.siege?.libelle_commune, company.siege?.code_postal]
          .filter(Boolean)
          .join(" · "),
        company.activityCodes.join(" · "),
      ],
      href: `https://annuaire-entreprises.data.gouv.fr/entreprise/${encodeURIComponent(company.siren)}`,
      linkLabel: "Voir la fiche entreprise ↗",
      layer: "company",
      color,
      radius: 7,
    });
    if (marker) {
      companyMarkers.set(company.siren, {
        element: marker,
        coordinates: company.siege.coordonnees
          .split(",")
          .map(Number),
      });
    }
  }

  for (const site of snapshot.sites) {
    if (!SITE_CODES.has(site.etablissement?.activite_principale)) continue;
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
      siteMarkers.set(site.siret, {
        element: marker,
        companySiren: site.companySiren,
      });
    }
  }

  const snapshotDate = snapshot.generatedAt
    ? new Date(snapshot.generatedAt).toLocaleDateString("fr-FR")
    : "date inconnue";
  loadedCount.textContent =
    `${companies.size.toLocaleString("fr-FR")} entreprises recensées · ${snapshot.sites.length.toLocaleString("fr-FR")} sites industriels recensés · instantané ${snapshotDate}`;
  updateView();
}

companySearch.addEventListener("input", updateView);
filterInputs.forEach((input) => input.addEventListener("change", updateView));
showSitesInput.addEventListener("change", updateView);
document.addEventListener("keydown", (event) => {
  if (
    event.key === "/" &&
    !["INPUT", "TEXTAREA"].includes(document.activeElement.tagName)
  ) {
    event.preventDefault();
    companySearch.focus();
  }
  if (event.key === "Escape" && document.activeElement === companySearch) {
    companySearch.value = "";
    companySearch.blur();
    updateView();
  }
});

try {
  loadSnapshot();
} catch (error) {
  console.error("Échec de l’affichage du jeu de données statique.", error);
  const mapError = document.querySelector("#map-error");
  mapError.textContent = error.message;
  mapError.hidden = false;
}
