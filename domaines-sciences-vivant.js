const trainingMap = window.PHARMA_TRAINING_MAP;
const FRANCE_BOUNDS = [
  [41.2, -5.3],
  [51.3, 9.8],
];
const IGN_BASEMAP_URL =
  "https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&STYLE=normal&TILEMATRIXSET=PM_0_19&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&FORMAT=image/png";
const DOMAIN_COLORS = {
  "Microbiologie et infectiologie": "#a24368",
  "Biologie moléculaire et cellulaire": "#7a55a1",
  "Biologie médicale et analyses biologiques": "#3973a8",
  "Chimie, analyses et formulation": "#bd7137",
  "Biotechnologies et bioprocédés": "#25816d",
  "Pharmacie et médicament": "#16745c",
  "Qualité, contrôle et réglementation": "#707d35",
  "Production et procédés industriels": "#596a87",
  "Sciences du vivant, environnement et alimentation": "#55914c",
  "Accès aux études de santé": "#b34e76",
  "Autres parcours des sciences du vivant": "#65747b",
};

const mapError = document.querySelector("#map-error");
const catalogCount = document.querySelector("#catalog-count");
const locatedCount = document.querySelector("#located-count");
const visibleCount = document.querySelector("#visible-count");
const domainList = document.querySelector("#domain-list");
const searchInput = document.querySelector("#domain-search");
const selectAllButton = document.querySelector("#select-all-domains");
const dataNote = document.querySelector("#domain-data-note");
const markers = [];
const domainInputs = new Map();
let map;
let markerGroup;

function addText(parent, tag, text, className) {
  const element = document.createElement(tag);
  element.textContent = text;
  if (className) element.className = className;
  parent.append(element);
  return element;
}

function createPopup(offer) {
  const card = document.createElement("article");
  card.className = "domain-popup";
  addText(card, "h3", offer.formation || offer.title || "Formation");

  if (offer.title && offer.title !== offer.formation) {
    addText(card, "p", `Diplôme / admission : ${offer.title}`);
  }
  if (offer.pathway) addText(card, "p", `Parcours : ${offer.pathway}`);

  const location = [offer.institution, offer.city, offer.region]
    .filter(Boolean)
    .join(" · ");
  if (location) addText(card, "p", location);
  addText(card, "p", offer.domain, "domain-popup-tag");
  if (offer.category) addText(card, "p", `Domaine du catalogue : ${offer.category}`);
  if (offer.modality) addText(card, "p", offer.modality);
  if (offer.source) addText(card, "p", `Source : ${offer.source}`);

  if (offer.url) {
    try {
      const url = new URL(offer.url);
      if (url.protocol === "https:" || url.protocol === "http:") {
        const link = document.createElement("a");
        link.href = url.href;
        link.target = "_blank";
        link.rel = "noreferrer";
        link.textContent = "Consulter la fiche de formation ↗";
        card.append(link);
      }
    } catch (error) {
      console.warn("URL de formation ignorée car invalide.", error);
    }
  }
  return card;
}

function makeMarker(offer) {
  const color = DOMAIN_COLORS[offer.domain] ?? DOMAIN_COLORS["Autres parcours des sciences du vivant"];
  const marker = L.marker(offer.coordinates, {
    icon: L.divIcon({
      className: "",
      html: `<span class="domain-marker" style="background:${color}" aria-hidden="true"></span>`,
      iconSize: [22, 22],
      iconAnchor: [11, 11],
    }),
    title: [offer.formation, offer.institution, offer.city].filter(Boolean).join(" — "),
    keyboard: true,
  });
  marker.bindPopup(createPopup(offer), { minWidth: 230, maxWidth: 330 });
  marker.offer = offer;
  markers.push(marker);
}

function searchText(offer) {
  return [
    offer.formation,
    offer.title,
    offer.pathway,
    offer.institution,
    offer.city,
    offer.region,
    offer.domain,
    offer.category,
    offer.modality,
    offer.source,
  ]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase("fr");
}

function selectedDomains() {
  return new Set(
    [...domainInputs]
      .filter(([, input]) => input.checked)
      .map(([domain]) => domain),
  );
}

function updateMap() {
  const domains = selectedDomains();
  const query = searchInput.value.trim().toLocaleLowerCase("fr");
  const visible = markers.filter(
    ({ offer }) =>
      domains.has(offer.domain) && (!query || searchText(offer).includes(query)),
  );

  markerGroup.clearLayers();
  markerGroup.addLayers(visible);
  visibleCount.textContent =
    `${visible.length.toLocaleString("fr-FR")} ` +
    `${visible.length === 1 ? "formation affichée" : "formations affichées"}`;
  locatedCount.textContent = visible.length.toLocaleString("fr-FR");
  selectAllButton.textContent =
    domains.size === domainInputs.size ? "Tout désélectionner" : "Tout sélectionner";
}

function createDomainFilters(offers) {
  const counts = new Map();
  for (const offer of offers) {
    counts.set(offer.domain, (counts.get(offer.domain) ?? 0) + 1);
  }

  const domains = [...counts.keys()].sort((left, right) =>
    left.localeCompare(right, "fr"),
  );
  const fragment = document.createDocumentFragment();
  for (const domain of domains) {
    const label = document.createElement("label");
    label.className = "domain-option";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.value = domain;
    input.checked = true;
    input.addEventListener("change", updateMap);

    const swatch = document.createElement("span");
    swatch.className = "domain-option-swatch";
    swatch.style.backgroundColor =
      DOMAIN_COLORS[domain] ?? DOMAIN_COLORS["Autres parcours des sciences du vivant"];
    const name = document.createElement("span");
    name.textContent = domain;
    const count = document.createElement("span");
    count.className = "domain-option-count";
    count.textContent = counts.get(domain).toLocaleString("fr-FR");
    label.append(input, swatch, name, count);
    fragment.append(label);
    domainInputs.set(domain, input);
  }
  domainList.replaceChildren(fragment);
}

function initialize() {
  if (
    !trainingMap ||
    !Array.isArray(trainingMap.records) ||
    typeof L === "undefined" ||
    typeof L.markerClusterGroup !== "function"
  ) {
    throw new Error("Les données statiques ou la bibliothèque de carte sont introuvables.");
  }

  catalogCount.textContent = trainingMap.totalRecords.toLocaleString("fr-FR");
  locatedCount.textContent = trainingMap.records.length.toLocaleString("fr-FR");
  const missing = trainingMap.totalRecords - trainingMap.records.length;
  dataNote.textContent = missing > 0
    ? `${missing.toLocaleString("fr-FR")} offres du catalogue n’ont pas de coordonnées fiables ; elles restent dans le CSV téléchargeable.`
    : "Toutes les offres du catalogue sont géolocalisées.";

  map = L.map("domain-map", {
    zoomControl: true,
    minZoom: 5,
    maxZoom: 19,
    scrollWheelZoom: true,
  });
  L.tileLayer(IGN_BASEMAP_URL, {
    attribution:
      '<a href="https://cartes.gouv.fr/" target="_blank" rel="noreferrer">IGN / Géoplateforme</a>',
    minZoom: 5,
    maxZoom: 19,
    tileSize: 256,
  }).addTo(map);

  markerGroup = L.markerClusterGroup({
    chunkedLoading: true,
    maxClusterRadius: 42,
    showCoverageOnHover: false,
    spiderfyOnMaxZoom: true,
    iconCreateFunction(cluster) {
      const count = cluster.getChildCount();
      const size = count >= 100 ? 46 : count >= 10 ? 40 : 34;
      const level = count >= 100 ? "cluster-large" : count >= 10 ? "cluster-medium" : "";
      return L.divIcon({
        html: String(count),
        className: `domain-map-marker-cluster ${level}`,
        iconSize: L.point(size, size),
      });
    },
  });
  for (const offer of trainingMap.records) makeMarker(offer);
  createDomainFilters(trainingMap.records);
  map.addLayer(markerGroup);
  map.fitBounds(FRANCE_BOUNDS);
  updateMap();

  searchInput.addEventListener("input", updateMap);
  selectAllButton.addEventListener("click", () => {
    const select = [...domainInputs.values()].some((input) => !input.checked);
    for (const input of domainInputs.values()) input.checked = select;
    updateMap();
  });
  document.querySelector("#zoom-france").addEventListener("click", () => {
    map.fitBounds(FRANCE_BOUNDS);
  });
}

try {
  initialize();
} catch (error) {
  console.error("Échec de l’affichage des formations par domaine.", error);
  mapError.textContent = error.message;
  mapError.hidden = false;
  visibleCount.textContent = "Données indisponibles";
}
