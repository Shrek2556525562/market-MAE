const data = window.PHARMA_STATIC_DATA;
const FRANCE_BOUNDS = [
  [41.25, -5.2],
  [51.2, 9.7],
];
const INITIAL_LIST_SIZE = 70;
const PAGE_SIZE = 70;
const LIST_ICONS = {
  formation: "F",
  entreprise: "+",
  site: "↗",
};
const MARKER_CLASSES = {
  formation: "panorama-marker-training",
  entreprise: "panorama-marker-company",
  site: "panorama-marker-site",
};
const CLUSTER_COLORS = {
  formation: "#7554a8",
  entreprise: "#16745c",
  site: "#334d71",
};
const LAYER_NAMES = {
  formation: "toggle-courses",
  entreprise: "toggle-companies",
  site: "toggle-sites",
};

const mapElement = document.querySelector("#panorama-map");
const mapError = document.querySelector("#panorama-error");
const searchInput = document.querySelector("#panorama-search");
const resultsList = document.querySelector("#results-list");
const resultsCount = document.querySelector("#results-count");
const mapCount = document.querySelector("#map-count");
const showMoreButton = document.querySelector("#show-more");
const records = [];
const markerGroups = new Map();
let visibleRecords = [];
let listLimit = INITIAL_LIST_SIZE;
let queryTimer = 0;
let map;

function isMetropolitanPoint(coordinates) {
  if (!Array.isArray(coordinates) || coordinates.length !== 2) return false;
  const [latitude, longitude] = coordinates.map(Number);
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= 41.25 &&
    latitude <= 51.2 &&
    longitude >= -5.2 &&
    longitude <= 9.7
  );
}

function companyCoordinates(company) {
  if (typeof company.siege?.coordonnees !== "string") return null;
  const point = company.siege.coordonnees.split(",").map(Number);
  return isMetropolitanPoint(point) ? point : null;
}

function makeRecord({ id, type, title, subtitle, coordinates, href, linkText, searchable }) {
  const record = {
    id,
    type,
    title,
    subtitle,
    coordinates,
    href,
    linkText,
    searchable: searchable.toLocaleLowerCase("fr"),
    marker: null,
  };
  records.push(record);
  return record;
}

function popupContent(record) {
  const card = document.createElement("article");
  card.className = "panorama-popup";

  const title = document.createElement("h3");
  title.textContent = record.title;
  card.append(title);

  if (record.subtitle) {
    const subtitle = document.createElement("p");
    subtitle.textContent = record.subtitle;
    card.append(subtitle);
  }

  if (record.href) {
    const link = document.createElement("a");
    link.href = record.href;
    link.target = "_blank";
    link.rel = "noreferrer";
    link.textContent = record.linkText;
    card.append(link);
  }
  return card;
}

function clusterIcon(type) {
  return (cluster) => {
    const count = cluster.getChildCount();
    const size = count < 10 ? 34 : count < 100 ? 40 : 46;
    return L.divIcon({
      html: `<div>${count.toLocaleString("fr-FR")}</div>`,
      className: `panorama-cluster panorama-cluster-${type}`,
      iconSize: L.point(size, size),
    });
  };
}

function markerIcon(type) {
  const contents =
    type === "site"
      ? '<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M3 16V8.5l5 2.6V8.5l5 2.6V5h4v11H3Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>'
      : LIST_ICONS[type];
  return L.divIcon({
    html: `<span class="panorama-marker ${MARKER_CLASSES[type]}">${contents}</span>`,
    className: "",
    iconSize: L.point(type === "site" ? 20 : 24, type === "site" ? 20 : 24),
    iconAnchor: L.point(type === "site" ? 10 : 12, type === "site" ? 10 : 12),
  });
}

function addMapMarker(record) {
  if (!isMetropolitanPoint(record.coordinates)) return;
  const marker = L.marker(record.coordinates, {
    icon: markerIcon(record.type),
    title: record.title,
    keyboard: true,
    riseOnHover: true,
  });
  marker.bindPopup(popupContent(record), {
    maxWidth: 290,
    className: "panorama-leaflet-popup",
  });
  record.marker = marker;
}

function addTrainingRecords() {
  for (const course of data.courses) {
    makeRecord({
      id: `formation:${course.id}`,
      type: "formation",
      title: course.title,
      subtitle: [course.institution, course.city, course.region]
        .filter(Boolean)
        .join(" · "),
      coordinates: course.coordinates,
      href: course.url,
      linkText: "Voir sur Parcoursup ↗",
      searchable: [course.title, course.institution, course.city, course.region].join(" "),
    });
  }
}

function addCompanyRecords() {
  for (const company of data.companies) {
    makeRecord({
      id: `entreprise:${company.siren}`,
      type: "entreprise",
      title: company.nom_complet,
      subtitle: [
        company.siege?.libelle_commune,
        company.siege?.code_postal,
        company.activityCodes?.join(" · "),
      ]
        .filter(Boolean)
        .join(" · "),
      coordinates: companyCoordinates(company),
      href: `https://annuaire-entreprises.data.gouv.fr/entreprise/${encodeURIComponent(company.siren)}`,
      linkText: "Fiche entreprise ↗",
      searchable: [
        company.nom_complet,
        company.siren,
        company.siege?.libelle_commune,
        company.siege?.code_postal,
        company.activityCodes?.join(" "),
      ]
        .filter(Boolean)
        .join(" "),
    });
  }
}

function addSiteRecords() {
  for (const site of data.sites) {
    makeRecord({
      id: `site:${site.siret}`,
      type: "site",
      title: site.companyName,
      subtitle: [
        site.etablissement?.libelle_commune,
        site.etablissement?.adresse,
        site.etablissement?.activite_principale,
      ]
        .filter(Boolean)
        .join(" · "),
      coordinates: site.coordinates,
      href: `https://annuaire-entreprises.data.gouv.fr/etablissement/${encodeURIComponent(site.siret)}`,
      linkText: "Fiche établissement ↗",
      searchable: [
        site.companyName,
        site.siret,
        site.etablissement?.libelle_commune,
        site.etablissement?.adresse,
        site.etablissement?.activite_principale,
      ]
        .filter(Boolean)
        .join(" "),
    });
  }
}

function getActiveTypes() {
  return Object.entries(LAYER_NAMES)
    .filter(([, inputId]) => document.getElementById(inputId).checked)
    .map(([type]) => type);
}

function createResultRow(record) {
  const button = document.createElement("button");
  button.className = "panorama-result-row";
  button.type = "button";
  button.disabled = !record.marker;
  button.setAttribute(
    "aria-label",
    `${record.title}${record.subtitle ? `, ${record.subtitle}` : ""}${record.marker ? "" : ", non géolocalisé sur la carte"}`,
  );

  const icon = document.createElement("span");
  icon.className = `panorama-result-icon ${record.type}`;
  icon.textContent = LIST_ICONS[record.type];
  button.append(icon);

  const copy = document.createElement("span");
  copy.className = "panorama-result-copy";
  const title = document.createElement("strong");
  title.textContent = record.title;
  copy.append(title);
  const subtitle = document.createElement("small");
  subtitle.textContent = record.subtitle || "Lieu non renseigné";
  copy.append(subtitle);
  button.append(copy);

  const arrow = document.createElement("span");
  arrow.className = "panorama-result-arrow";
  arrow.setAttribute("aria-hidden", "true");
  arrow.textContent = record.marker ? "›" : "·";
  button.append(arrow);

  if (record.marker) {
    button.addEventListener("click", () => {
      map.flyTo(record.coordinates, Math.max(map.getZoom(), 10), {
        duration: 0.45,
      });
      record.marker.openPopup();
    });
  }
  return button;
}

function renderResults() {
  resultsList.replaceChildren();
  if (visibleRecords.length === 0) {
    const emptyState = document.createElement("div");
    emptyState.className = "list-state";
    emptyState.textContent = "Aucun résultat pour cette recherche.";
    resultsList.append(emptyState);
    showMoreButton.hidden = true;
    return;
  }

  const displayed = visibleRecords.slice(0, listLimit);
  const fragment = document.createDocumentFragment();
  for (const record of displayed) fragment.append(createResultRow(record));
  resultsList.append(fragment);

  showMoreButton.hidden = displayed.length >= visibleRecords.length;
  if (!showMoreButton.hidden) {
    showMoreButton.textContent =
      `Afficher 70 résultats supplémentaires (${(visibleRecords.length - displayed.length).toLocaleString("fr-FR")} restants)`;
  }
}

function updateMapAndResults() {
  const activeTypes = getActiveTypes();
  const query = searchInput.value.trim().toLocaleLowerCase("fr");
  visibleRecords = records.filter(
    (record) =>
      activeTypes.includes(record.type) &&
      (!query || record.searchable.includes(query)),
  );
  listLimit = INITIAL_LIST_SIZE;

  for (const [type, group] of markerGroups) {
    if (!activeTypes.includes(type)) {
      map.removeLayer(group);
      continue;
    }
    map.addLayer(group);
    const visibleMarkers = visibleRecords
      .filter((record) => record.type === type && record.marker)
      .map((record) => record.marker);
    group.clearLayers();
    group.addLayers(visibleMarkers);
  }

  renderResults();
  resultsCount.textContent = visibleRecords.length.toLocaleString("fr-FR");
  const locatedCount = visibleRecords.filter((record) => record.marker).length;
  mapCount.textContent = `${locatedCount.toLocaleString("fr-FR")} ${locatedCount > 1 ? "points visibles" : "point visible"}`;
}

function initialize() {
  if (
    !data ||
    !Array.isArray(data.courses) ||
    !Array.isArray(data.companies) ||
    !Array.isArray(data.sites)
  ) {
    throw new Error("Le jeu de données statique du panorama est introuvable.");
  }
  if (typeof L === "undefined" || !L.markerClusterGroup) {
    throw new Error("La bibliothèque cartographique locale n’a pas pu être initialisée.");
  }

  map = L.map(mapElement, {
    zoomControl: true,
    minZoom: 5,
    maxZoom: 19,
    preferCanvas: true,
  }).fitBounds(FRANCE_BOUNDS);

  map.createPane("offlineBasemap");
  map.getPane("offlineBasemap").style.zIndex = "150";
  L.imageOverlay("data/france-metropolitaine.svg", FRANCE_BOUNDS, {
    pane: "offlineBasemap",
    interactive: false,
  }).addTo(map);

  L.tileLayer(
    "https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&STYLE=normal&TILEMATRIXSET=PM_0_19&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&FORMAT=image/png",
    {
      attribution:
        '<a href="https://cartes.gouv.fr/" target="_blank" rel="noreferrer">IGN / Géoplateforme</a>',
      minZoom: 5,
      maxZoom: 19,
      tileSize: 256,
    },
  ).addTo(map);

  for (const type of Object.keys(LAYER_NAMES)) {
    markerGroups.set(
      type,
      L.markerClusterGroup({
        chunkedLoading: true,
        chunkInterval: 80,
        chunkDelay: 15,
        maxClusterRadius: 44,
        showCoverageOnHover: false,
        spiderfyOnMaxZoom: true,
        iconCreateFunction: clusterIcon(type),
      }),
    );
  }

  addTrainingRecords();
  addCompanyRecords();
  addSiteRecords();
  for (const record of records) addMapMarker(record);

  document.querySelector("#stat-courses").textContent =
    data.courses.length.toLocaleString("fr-FR");
  document.querySelector("#stat-companies").textContent =
    data.companies.length.toLocaleString("fr-FR");
  document.querySelector("#stat-sites").textContent =
    data.sites.length.toLocaleString("fr-FR");

  for (const [, inputId] of Object.entries(LAYER_NAMES)) {
    document.getElementById(inputId).addEventListener("change", updateMapAndResults);
  }
  searchInput.addEventListener("input", () => {
    window.clearTimeout(queryTimer);
    queryTimer = window.setTimeout(updateMapAndResults, 90);
  });
  showMoreButton.addEventListener("click", () => {
    listLimit += PAGE_SIZE;
    renderResults();
  });
  document.querySelector("#reset-map").addEventListener("click", () => {
    map.fitBounds(FRANCE_BOUNDS);
  });

  updateMapAndResults();
}

try {
  initialize();
} catch (error) {
  console.error("Échec de l’affichage du panorama pharmaceutique.", error);
  mapError.textContent = error.message;
  mapError.hidden = false;
}
