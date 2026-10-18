const API_ROOT = "https://recherche-entreprises.api.gouv.fr/search";
const PAGE_SIZE = 25;
const SITE_CODES = new Set(["21.10Z", "21.20Z"]);
const SITE_REQUEST_GAP_MS = 180;
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
const pageByActivity = new Map(activityTypes.map(({ code }) => [code, 0]));
const totalsByActivity = new Map();
const markersBySiren = new Map();
const sitesBySiret = new Map();
const siteMarkersBySiret = new Map();
const siteRequests = new Set();

const totalCount = document.querySelector("#total-count");
const loadedCount = document.querySelector("#loaded-count");
const companyList = document.querySelector("#company-list");
const companySearch = document.querySelector("#company-search");
const visibleCount = document.querySelector("#visible-count");
const mapResultCount = document.querySelector("#map-result-count");
const loadMoreButton = document.querySelector("#load-more");
const mapError = document.querySelector("#map-error");
const siteCount = document.querySelector("#site-count");
const showSitesInput = document.querySelector("#show-sites");
const filterInputs = [...document.querySelectorAll(".filter-option input")];
let nextSiteRequestAt = 0;
let siteFetchInProgress = 0;
let siteFetchQueued = 0;
let siteFetchErrors = 0;

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

  if (!coordinates) return;

  const existing = companies.get(record.siren);
  if (existing) {
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
  createMarker(company);
}

function buildCompanyUrl(code, page) {
  const params = new URLSearchParams({
    activite_principale: code,
    etat_administratif: "A",
    include: "siege",
    minimal: "true",
    page: String(page),
    per_page: String(PAGE_SIZE),
  });
  return `${API_ROOT}?${params.toString()}`;
}

function buildSitesUrl(company) {
  const params = new URLSearchParams({
    etat_administratif: "A",
    include: "matching_etablissements",
    limite_matching_etablissements: "100",
    minimal: "true",
    page: "1",
    per_page: "10",
    q: company.nom_complet,
  });
  return `${API_ROOT}?${params.toString()}`;
}

async function fetchCompanySites(company) {
  const delay = Math.max(0, nextSiteRequestAt - Date.now());
  nextSiteRequestAt = Date.now() + delay + SITE_REQUEST_GAP_MS;
  if (delay) await new Promise((resolve) => setTimeout(resolve, delay));

  const response = await fetch(buildSitesUrl(company), {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`L’API a répondu avec le statut ${response.status}.`);
  }

  const payload = await response.json();
  const record = payload.results?.find((result) => result.siren === company.siren);
  if (!record) return;

  for (const establishment of record.matching_etablissements ?? []) {
    if (
      establishment.etat_administratif !== "A" ||
      !SITE_CODES.has(establishment.activite_principale) ||
      !establishment.siret
    ) {
      continue;
    }

    const [latitude, longitude] = [
      Number(establishment.latitude),
      Number(establishment.longitude),
    ];
    if (
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      Math.abs(latitude) > 90 ||
      Math.abs(longitude) > 180
    ) {
      continue;
    }

    if (sitesBySiret.has(establishment.siret)) continue;
    const site = {
      companyName: company.nom_complet,
      companySiren: company.siren,
      coordinates: [latitude, longitude],
      etablissement: establishment,
      siret: establishment.siret,
    };
    sitesBySiret.set(site.siret, site);
    createSiteMarker(site);
  }
}

async function loadSitesForCompanies(records) {
  const pending = records.filter(
    (company) => !siteRequests.has(company.siren),
  );
  pending.forEach((company) => siteRequests.add(company.siren));
  siteFetchQueued += pending.length;
  updateSiteStatus();

  const workerCount = Math.min(3, pending.length);
  let cursor = 0;
  const workers = Array.from({ length: workerCount }, async () => {
    while (cursor < pending.length) {
      const company = pending[cursor];
      cursor += 1;
      siteFetchQueued -= 1;
      siteFetchInProgress += 1;
      updateSiteStatus();

      try {
        await fetchCompanySites(company);
      } catch (error) {
        siteRequests.delete(company.siren);
        siteFetchErrors += 1;
        console.error(`Échec du chargement des établissements de ${company.nom_complet}.`, error);
        mapError.textContent = `${siteFetchErrors} recherche(s) de sites industriels ont échoué. Désactivez puis réactivez le filtre pour réessayer.`;
        mapError.hidden = false;
      } finally {
        siteFetchInProgress -= 1;
        updateSiteStatus();
        updateView();
      }
    }
  });

  await Promise.all(workers);
}

function updateSiteStatus() {
  siteCount.textContent = sitesBySiret.size.toLocaleString("fr-FR");
  const remaining = siteFetchQueued + siteFetchInProgress;
  if (remaining) {
    loadedCount.textContent = `${sitesBySiret.size.toLocaleString("fr-FR")} sites industriels · ${remaining} entreprises à vérifier`;
  } else if (companies.size) {
    loadedCount.textContent = `${companies.size.toLocaleString("fr-FR")} entreprises chargées · ${sitesBySiret.size.toLocaleString("fr-FR")} sites industriels`;
  }
}

async function fetchActivityPage(activity, page) {
  const response = await fetch(buildCompanyUrl(activity.code, page), {
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`L’API a répondu avec le statut ${response.status}.`);
  }

  const payload = await response.json();
  if (!Array.isArray(payload.results)) {
    throw new Error("La réponse de l’API ne contient pas de liste d’entreprises.");
  }

  return payload;
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
  button.setAttribute(
    "aria-label",
    `${company.nom_complet}, siège à ${company.siege.libelle_commune ?? "adresse inconnue"}`,
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

  button.addEventListener("click", () => {
    map.flyTo(company.coordinates, Math.max(map.getZoom(), 10), {
      duration: 0.55,
    });
    markersBySiren.get(company.siren)?.openPopup();
  });

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
  const shownPoints = visibleCompanies.length + shownSites;
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

  const loaded = [...companies.values()].filter((company) =>
    company.activityCodes.some((code) => enabledCodes.has(code)),
  ).length;
  if (!siteFetchQueued && !siteFetchInProgress) {
    loadedCount.textContent = `${loaded.toLocaleString("fr-FR")} entreprises chargées · ${sitesBySiret.size.toLocaleString("fr-FR")} sites industriels`;
  }
  loadMoreButton.hidden = !hasMorePages();
}

function hasMorePages() {
  return activityTypes.some(({ code }) => {
    if (!getEnabledCodes().has(code)) return false;
    const totalPages = totalsByActivity.get(`${code}:pages`) ?? 1;
    return (pageByActivity.get(code) ?? 0) < totalPages;
  });
}

async function loadNextPage() {
  const pendingActivities = activityTypes.filter(
    ({ code }) =>
      getEnabledCodes().has(code) &&
      (pageByActivity.get(code) ?? 0) <
        (totalsByActivity.get(`${code}:pages`) ?? 1),
  );

  if (pendingActivities.length === 0) {
    updateView();
    return;
  }

  loadMoreButton.disabled = true;
  loadMoreButton.textContent = "Chargement…";
  mapError.hidden = true;

  const results = await Promise.allSettled(
    pendingActivities.map((activity) =>
      fetchActivityPage(activity, (pageByActivity.get(activity.code) ?? 0) + 1),
    ),
  );

  const errors = [];
  const newCompanies = [];
  results.forEach((result, index) => {
    const activity = pendingActivities[index];
    if (result.status === "rejected") {
      errors.push(`${activity.code} : ${result.reason.message}`);
      return;
    }

    const page = result.value;
    pageByActivity.set(activity.code, page.page);
    totalsByActivity.set(activity.code, page.total_results);
    totalsByActivity.set(`${activity.code}:pages`, page.total_pages);
    page.results.forEach((record) => {
      mergeCompany(record, activity.code);
      const company = companies.get(record.siren);
      if (company) newCompanies.push(company);
    });
  });

  if (errors.length) {
    mapError.textContent = `${errors.join(" ")} Réessayez dans un instant.`;
    mapError.hidden = false;
  } else {
    mapError.hidden = true;
  }

  updateView();
  if (showSitesInput.checked) {
    await loadSitesForCompanies([...new Map(newCompanies.map((company) => [
      company.siren,
      company,
    ])).values()]);
  }
  loadMoreButton.disabled = false;
  loadMoreButton.innerHTML = "Afficher plus d’entreprises <span aria-hidden=\"true\">↓</span>";
}

companySearch.addEventListener("input", updateView);
filterInputs.forEach((input) => input.addEventListener("change", updateView));
loadMoreButton.addEventListener("click", loadNextPage);
showSitesInput.addEventListener("change", () => {
  updateView();
  if (showSitesInput.checked) {
    siteFetchErrors = 0;
    mapError.hidden = true;
    loadSitesForCompanies([...companies.values()]).catch((error) => {
      mapError.textContent = `Impossible de charger les sites industriels : ${error.message}`;
      mapError.hidden = false;
    });
  }
});
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

loadNextPage().catch((error) => {
  mapError.textContent =
    `Impossible de charger les données des entreprises : ${error.message}`;
  mapError.hidden = false;
  loadMoreButton.disabled = false;
  loadMoreButton.textContent = "Réessayer";
});
}

if (typeof L === "undefined") {
  mapError.textContent =
    "La bibliothèque cartographique n’a pas pu être chargée. Vérifiez votre connexion Internet et rechargez la page.";
  mapError.hidden = false;
  loadMoreButton.hidden = true;
} else {
  initializeMap();
}
