const DATA_ELEMENT_ID = "companies-data";
const SITE_CODES = new Set(["21.10Z", "21.20Z"]);
const FRANCE_BOUNDS = [
  [41.25, -5.2],
  [51.2, 9.7],
];

const activityTypes = [
  {
    code: "21.10Z",
    label: "Produits pharmaceutiques de base",
    color: "api",
    countElement: document.querySelector("#count-2110"),
  },
  {
    code: "21.20Z",
    label: "Préparations pharmaceutiques",
    color: "medicines",
    countElement: document.querySelector("#count-2120"),
  },
];

const companies = new Map();
const totalsByActivity = new Map();
const markersBySiren = new Map();
const sitesBySiret = new Map();
const siteMarkersBySiret = new Map();

const totalCount = document.querySelector("#total-count");
const loadedCount = document.querySelector("#loaded-count");
const companyList = document.querySelector("#company-list");
const companySearch = document.querySelector("#company-search");
const visibleCount = document.querySelector("#visible-count");
const mapResultCount = document.querySelector("#map-result-count");
const mapError = document.querySelector("#map-error");
const siteCount = document.querySelector("#site-count");
const showSitesInput = document.querySelector("#show-sites");
const filterInputs = [...document.querySelectorAll(".filter-option input")];
let snapshotDate = "";

function initializeMap() {
const map = L.map("map", {
  zoomControl: false,
  minZoom: 5,
  maxZoom: 18,
  scrollWheelZoom: true,
}).fitBounds(FRANCE_BOUNDS);

L.tileLayer(
  "https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&STYLE=normal&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&FORMAT=image/png",
  {
    attribution:
      '<a href="https://cartes.gouv.fr/" target="_blank" rel="noreferrer">IGN / Géoplateforme</a>',
    maxZoom: 18,
    minZoom: 5,
    tileSize: 256,
  },
).addTo(map);

const markerLayer = L.featureGroup().addTo(map);
const siteLayer = L.featureGroup().addTo(map);

L.control.zoom({ position: "bottomright" }).addTo(map);

function getActivity(code) {
  return activityTypes.find((activity) => activity.code === code);
}

function getEnabledCodes() {
  return new Set(
    filterInputs.filter((input) => input.checked).map((input) => input.value),
  );
}

function getCoordinates(company) {
  const [latitude, longitude] = (company.siege?.coordonnees ?? "")
    .split(",")
    .map(Number);

  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    Math.abs(latitude) > 90 ||
    Math.abs(longitude) > 180
  ) {
    return null;
  }

  return [latitude, longitude];
}

function createMarker(company) {
  const activity = getActivity(company.activityCodes[0]);
  const icon = L.divIcon({
    className: "",
    html: `<span class="pharma-marker ${activity.color}" aria-hidden="true"><svg viewBox="0 0 16 16" fill="none"><path d="M8 3v10M3 8h10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></span>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });

  const marker = L.marker(company.coordinates, { icon });
  marker.bindPopup(createPopup(company), { minWidth: 215 });
  markerLayer.addLayer(marker);
  markersBySiren.set(company.siren, marker);
}

function createSiteMarker(site) {
  const icon = L.divIcon({
    className: "",
    html: `<span class="site-marker" aria-hidden="true"><svg viewBox="0 0 20 20" fill="none"><path d="M3 16V8.5l5 2.6V8.5l5 2.6V5h4v11H3Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M5.5 13.5v.1m4-.1v.1m4-.1v.1m2.5-5.1v.1m0 2.4v.1" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg></span>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
  const marker = L.marker(site.coordinates, { icon });
  marker.bindPopup(createSitePopup(site), { minWidth: 235 });
  siteLayer.addLayer(marker);
  siteMarkersBySiret.set(site.siret, marker);
}

function createPopup(company) {
  const card = document.createElement("div");
  card.className = "popup-card";

  const title = document.createElement("h3");
  title.textContent = company.nom_complet;
  card.append(title);

  const location = document.createElement("p");
  location.textContent = [
    company.siege.libelle_commune,
    company.siege.code_postal,
  ]
    .filter(Boolean)
    .join(" · ");
  card.append(location);

  const codes = document.createElement("p");
  codes.className = "popup-code";
  codes.textContent = company.activityCodes.join(" · ");
  card.append(codes);

  const link = document.createElement("a");
  link.href = `https://annuaire-entreprises.data.gouv.fr/entreprise/${encodeURIComponent(company.siren)}`;
  link.target = "_blank";
  link.rel = "noreferrer";
  link.textContent = "Voir la fiche entreprise ↗";
  card.append(link);

  return card;
}

function createSitePopup(site) {
  const card = document.createElement("div");
  card.className = "popup-card";

  const title = document.createElement("h3");
  title.textContent = site.companyName;
  card.append(title);

  const industrialSite = document.createElement("p");
  industrialSite.className = "popup-code";
  industrialSite.textContent = "Établissement industriel";
  card.append(industrialSite);

  const location = document.createElement("p");
  location.textContent = [
    site.etablissement.adresse,
    site.etablissement.libelle_commune,
  ]
    .filter(Boolean)
    .join(" · ");
  card.append(location);

  const code = document.createElement("p");
  code.className = "popup-code";
  code.textContent = `${site.etablissement.activite_principale} · SIRET ${site.siret}`;
  card.append(code);

  const link = document.createElement("a");
  link.href = `https://annuaire-entreprises.data.gouv.fr/etablissement/${encodeURIComponent(site.siret)}`;
  link.target = "_blank";
  link.rel = "noreferrer";
  link.textContent = "Voir la fiche établissement ↗";
  card.append(link);

  return card;
}

function mergeCompany(record, code) {
  if (!record.siren || !record.nom_complet) return;
  const coordinates = getCoordinates(record);

  const existing = companies.get(record.siren);
  if (existing) {
    if (!existing.coordinates && coordinates) {
      existing.coordinates = coordinates;
      createMarker(existing);
    }
    if (!existing.activityCodes.includes(code)) {
      existing.activityCodes.push(code);
      existing.activityCodes.sort();
      const marker = markersBySiren.get(existing.siren);
      if (marker) marker.setPopupContent(createPopup(existing));
    }
    return;
  }

  const company = {
    ...record,
    activityCodes: [code],
    coordinates,
  };
  companies.set(company.siren, company);
  if (company.coordinates) createMarker(company);
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
        company.siege.libelle_commune,
        company.siege.code_postal,
      ]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase("fr")
        .includes(query);
    })
    .sort((left, right) => left.nom_complet.localeCompare(right.nom_complet, "fr"));
}

function createCompanyRow(company) {
  const button = document.createElement("button");
  button.className = "company-row";
  button.type = "button";
  button.disabled = !company.coordinates;
  button.setAttribute(
    "aria-label",
    `${company.nom_complet}, siège à ${company.siege.libelle_commune ?? "adresse inconnue"}${company.coordinates ? "" : ", coordonnées indisponibles"}`,
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
    company.siege.libelle_commune,
    company.activityCodes.join(" · "),
    company.coordinates ? "" : "Coordonnées indisponibles",
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

  if (company.coordinates) {
    button.addEventListener("click", () => {
      map.flyTo(company.coordinates, Math.max(map.getZoom(), 10), {
        duration: 0.55,
      });
      markersBySiren.get(company.siren)?.openPopup();
    });
  }

  return button;
}

function updateView() {
  const visibleCompanies = getVisibleCompanies();
  const visibleSirens = new Set(
    visibleCompanies.map((company) => company.siren),
  );

  for (const [siren, marker] of markersBySiren) {
    if (visibleSirens.has(siren)) {
      if (!markerLayer.hasLayer(marker)) markerLayer.addLayer(marker);
    } else if (markerLayer.hasLayer(marker)) {
      markerLayer.removeLayer(marker);
    }
  }

  const showSites = showSitesInput.checked;
  for (const [siret, marker] of siteMarkersBySiret) {
    const site = sitesBySiret.get(siret);
    if (showSites && site && visibleSirens.has(site.companySiren)) {
      if (!siteLayer.hasLayer(marker)) siteLayer.addLayer(marker);
    } else if (siteLayer.hasLayer(marker)) {
      siteLayer.removeLayer(marker);
    }
  }

  companyList.replaceChildren();
  if (visibleCompanies.length === 0) {
    const emptyState = document.createElement("div");
    emptyState.className = "list-state";
    emptyState.textContent = companies.size
      ? "Aucune entreprise ne correspond à cette recherche."
      : "Aucune entreprise géolocalisée dans les résultats reçus.";
    companyList.append(emptyState);
  } else {
    const fragment = document.createDocumentFragment();
    for (const company of visibleCompanies) {
      fragment.append(createCompanyRow(company));
    }
    companyList.append(fragment);
  }

  visibleCount.textContent = String(visibleCompanies.length);
  const shownSites = showSites
    ? [...sitesBySiret.values()].filter((site) =>
        visibleSirens.has(site.companySiren),
      ).length
    : 0;
  const shownPoints =
    visibleCompanies.filter((company) => company.coordinates).length +
    shownSites;
  mapResultCount.textContent = `${shownPoints.toLocaleString("fr-FR")} ${
    shownPoints > 1 ? "points affichés" : "point affiché"
  }`;

  const enabledCodes = getEnabledCodes();
  const estimate = activityTypes.reduce(
    (sum, activity) =>
      sum +
      (enabledCodes.has(activity.code)
        ? (totalsByActivity.get(activity.code) ?? 0)
        : 0),
    0,
  );
  totalCount.textContent = estimate ? estimate.toLocaleString("fr-FR") : "—";

  for (const activity of activityTypes) {
    activity.countElement.textContent = totalsByActivity.has(activity.code)
      ? totalsByActivity.get(activity.code).toLocaleString("fr-FR")
      : "—";
  }

  loadedCount.textContent = `${companies.size.toLocaleString("fr-FR")} entreprises · ${sitesBySiret.size.toLocaleString("fr-FR")} sites industriels · instantané ${snapshotDate}`;
}

companySearch.addEventListener("input", updateView);
filterInputs.forEach((input) => input.addEventListener("change", updateView));
showSitesInput.addEventListener("change", updateView);
document.querySelector("#zoom-france").addEventListener("click", () => {
  map.fitBounds(FRANCE_BOUNDS);
});
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

function loadStaticData() {
  // Données brutes intégrées dans index.html par scripts/embed_data.py.
  const element = document.getElementById(DATA_ELEMENT_ID);
  if (!element) {
    throw new Error("les données ne sont pas intégrées dans la page (lancez scripts/embed_data.py).");
  }
  const snapshot = JSON.parse(element.textContent);
  if (!Array.isArray(snapshot.companies) || !Array.isArray(snapshot.sites)) {
    throw new Error("Le fichier de données ne contient pas les entreprises et établissements attendus.");
  }

  snapshotDate = snapshot.generatedAt
    ? new Date(snapshot.generatedAt).toLocaleDateString("fr-FR")
    : "date inconnue";

  for (const activity of activityTypes) {
    const codeCompanies = snapshot.companies.filter((company) =>
      company.activityCodes.includes(activity.code),
    );
    totalsByActivity.set(
      activity.code,
      snapshot.activityTotals?.[activity.code] ?? codeCompanies.length,
    );
  }

  for (const company of snapshot.companies) {
    for (const code of company.activityCodes) {
      if (SITE_CODES.has(code)) mergeCompany(company, code);
    }
  }

  for (const site of snapshot.sites) {
    if (!SITE_CODES.has(site.etablissement?.activite_principale)) continue;
    sitesBySiret.set(site.siret, site);
    createSiteMarker(site);
  }

  updateView();
}

try {
  loadStaticData();
} catch (error) {
  console.error("Échec de la lecture des données intégrées.", error);
  mapError.textContent = `Impossible de lire les données de la page : ${error.message}`;
  mapError.hidden = false;
}
}

if (typeof L === "undefined") {
  mapError.textContent =
    "La bibliothèque cartographique n’a pas pu être chargée. Vérifiez votre connexion Internet et rechargez la page.";
  mapError.hidden = false;
} else {
  initializeMap();
}
