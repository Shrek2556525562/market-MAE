const DATA_URL = "data/formations-pharma-fr.csv";
const FRANCE_BOUNDS = [
  [41.25, -5.2],
  [51.2, 9.7],
];
const PAGE_SIZE = 30;
const PROFILE_TERMS = {
  production: /production|proc[eé]d[eé]|fabrication|conditionnement|op[eé]rateur|formulation/i,
  qualite: /qualit[eé]|qse|r[eé]glement|m[eé]trologie|contr[oô]le|validation|assurance qualit[eé]/i,
  laboratoire: /laboratoire|analyse|bioanal|chimie|microbiolog|biologie|contr[oô]le/i,
  biotech: /biotech|bioproc[eé]d[eé]|sciences du vivant|g[eé]nie biologique|recherche|mol[eé]culaire/i,
  pharmacie: /pharmacie|m[eé]dicament|pharmaceutique|sant[eé]|pharmacologie/i,
  maintenance: /maintenance|ing[eé]nierie|automatisme|instrumentation|syst[eè]me de production/i,
  data: /donn[eé]es|informatique|num[eé]rique|bioinformatique|statistique|data|clinique/i,
};
const REGION_ALIASES = new Map([
  ["centre", "Centre-Val de Loire"],
  ["grandest", "Grand Est"],
  ["iledefrance", "Île-de-France"],
  ["nouvelleaquitaine", "Nouvelle-Aquitaine"],
  ["paysdelaloire", "Pays de la Loire"],
  ["reunion", "La Réunion"],
]);

const elements = Object.fromEntries(
  [
    "job-filter",
    "level-filter",
    "type-filter",
    "alternance-filter",
    "area-mode",
    "region-filter",
    "department-filter",
    "department-area",
    "radius-area",
    "site-filter",
    "radius-filter",
    "category-filter",
    "source-filter",
    "results-search",
    "results-count",
    "map-count",
    "recruiter-map",
    "recruiter-list",
    "show-more",
    "export-results",
    "reset-filters",
    "catalogue-date",
    "site-note",
    "recruiter-error",
    "recruiter-status",
  ].map((id) => [id, document.getElementById(id)]),
);
const offers = [];
const markers = new Map();
let filteredOffers = [];
let listLimit = PAGE_SIZE;
let map;
let markerGroup;
let radiusCircle;
let sites = [];

function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("fr")
    .trim();
}

function normalizeRegion(value) {
  const key = normalizeText(value).replace(/[^a-z0-9]/g, "");
  return REGION_ALIASES.get(key) ?? String(value ?? "").trim();
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        value += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        value += character;
      }
    } else if (character === '"' && value.length === 0) {
      quoted = true;
    } else if (character === ";") {
      row.push(value);
      value = "";
    } else if (character === "\n" || character === "\r") {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(value);
      if (row.some((cell) => cell !== "")) rows.push(row);
      row = [];
      value = "";
    } else {
      value += character;
    }
  }
  if (value.length || row.length) {
    row.push(value);
    if (row.some((cell) => cell !== "")) rows.push(row);
  }
  const headers = rows.shift()?.map((header, index) =>
    index === 0 ? header.replace(/^\uFEFF/, "") : header,
  );
  if (!headers?.length) throw new Error("Le catalogue de formations est vide.");
  return rows.map((cells) =>
    Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ""])),
  );
}

function coordinatesFor(offer) {
  const latitude = Number(String(offer.latitude ?? "").replace(",", "."));
  const longitude = Number(String(offer.longitude ?? "").replace(",", "."));
  if (
    !offer.latitude ||
    !offer.longitude ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    Math.abs(latitude) > 90 ||
    Math.abs(longitude) > 180
  ) {
    return null;
  }
  return [latitude, longitude];
}

function getLevel(offer) {
  const text = `${offer.formation} ${offer.intitule_admission} ${offer.filiere} ${offer.categorie}`;
  if (/doctorat|doctoral|ph\.?d/i.test(text)) return "PhD";
  if (/master|ing[eé]nieur|bac\s*\+\s*5|dipl[oô]me d[eé] docteur en pharmacie/i.test(text)) {
    return "Bac+5";
  }
  if (/bts|deust|dut|bac\s*\+\s*2/i.test(text)) return "Bac+2";
  if (/licence|bachelor|BUT\b|bac\s*\+\s*3/i.test(text)) return "Bac+3";
  return "";
}

function getType(offer) {
  const text = `${offer.type_offre} ${offer.modalite_formation}`;
  if (/apprentissage|alternance/i.test(text)) return "apprentissage";
  if (/cpf|formation continue/i.test(text)) return "continue";
  if (/parcoursup|formation dipl[oô]mante|campus france/i.test(text)) return "initiale";
  return "";
}

function getDepartmentCode(offer) {
  const code = String(offer.code_departement ?? "").trim().toUpperCase();
  if (!code) return "";
  if (/^\d$/.test(code)) return `0${code}`;
  return code;
}

function offerSearchText(offer) {
  return normalizeText(
    [
      offer.formation,
      offer.intitule_admission,
      offer.filiere,
      offer.categorie,
      offer.etablissement,
      offer.ville,
      offer.departement,
      offer.region,
      offer.parcours,
      offer.modalite_formation,
      offer.type_offre,
    ].join(" "),
  );
}

function offerLinkUrl(offer) {
  const links = (offer.url_formation || "")
    .split(/\s+\|\|\s+/)
    .map((url) => url.trim())
    .filter(Boolean);
  return links[0] || offer.url_source || "";
}

function populateFilter(select, values, placeholder) {
  const options = [...new Set(values.filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, "fr"),
  );
  select.replaceChildren(new Option(placeholder, ""));
  for (const value of options) select.add(new Option(value, value));
}

function populateFilters() {
  populateFilter(
    elements["region-filter"],
    offers.map((offer) => offer.regionLabel),
    "Toute la France",
  );
  populateFilter(
    elements["category-filter"],
    offers.map((offer) => offer.categorie.trim()),
    "Tous les domaines",
  );
  populateFilter(
    elements["source-filter"],
    offers.map((offer) => offer.type_offre.trim()),
    "Toutes les sources",
  );
  updateDepartments();
}

function updateDepartments() {
  const region = elements["region-filter"].value;
  const previous = elements["department-filter"].value;
  const departments = offers
    .filter((offer) => !region || offer.regionLabel === region)
    .filter((offer) => offer.departmentCode && offer.departement.trim())
    .reduce((mapByCode, offer) => {
      if (!mapByCode.has(offer.departmentCode)) {
        mapByCode.set(
          offer.departmentCode,
          `${offer.departmentCode} · ${offer.departement.trim()}`,
        );
      }
      return mapByCode;
    }, new Map());
  elements["department-filter"].replaceChildren(
    new Option("Tous les départements", ""),
  );
  for (const [code, label] of [...departments].sort((a, b) =>
    a[1].localeCompare(b[1], "fr"),
  )) {
    elements["department-filter"].add(new Option(label, code));
  }
  elements["department-filter"].disabled = departments.size === 0;
  if (departments.has(previous)) elements["department-filter"].value = previous;
}

function parseSiteCoordinates(site) {
  if (!Array.isArray(site.coordinates) || site.coordinates.length !== 2) return null;
  const point = site.coordinates.map(Number);
  return point.every(Number.isFinite) ? point : null;
}

function populateSites() {
  const data = window.PHARMA_STATIC_DATA;
  if (!Array.isArray(data?.sites)) {
    throw new Error("Les sites industriels locaux ne sont pas disponibles.");
  }
  sites = data.sites
    .filter((site) => ["21.10Z", "21.20Z"].includes(site.etablissement?.activite_principale))
    .map((site) => ({
      id: site.siret,
      name: site.companyName,
      city: site.etablissement?.libelle_commune ?? "",
      coordinates: parseSiteCoordinates(site),
      address: site.etablissement?.adresse ?? "",
    }))
    .filter((site) => site.id && site.name && site.coordinates)
    .sort((a, b) =>
      `${a.city} ${a.name}`.localeCompare(`${b.city} ${b.name}`, "fr"),
    );
  elements["site-filter"].replaceChildren(
    new Option("Choisir un site industriel", ""),
  );
  for (const site of sites) {
    elements["site-filter"].add(
      new Option(`${site.name} · ${site.city || "Localisation non libellée"}`, site.id),
    );
  }
}

function distanceKm(pointA, pointB) {
  const radians = (degrees) => (degrees * Math.PI) / 180;
  const [latA, lonA] = pointA.map(radians);
  const [latB, lonB] = pointB.map(radians);
  const deltaLat = latB - latA;
  const deltaLon = lonB - lonA;
  const h =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(latA) * Math.cos(latB) * Math.sin(deltaLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function getSelectedSite() {
  return sites.find((site) => site.id === elements["site-filter"].value) ?? null;
}

function matchesOffer(offer, filters) {
  if (filters.job && !PROFILE_TERMS[filters.job].test(offer.searchable)) return false;
  if (filters.level && offer.level !== filters.level) return false;
  if (filters.type && offer.type !== filters.type) return false;
  if (
    filters.alternance &&
    !/apprentissage|alternance/i.test(`${offer.type_offre} ${offer.modalite_formation}`)
  ) {
    return false;
  }
  if (filters.category && offer.categorie.trim() !== filters.category) return false;
  if (filters.source && offer.type_offre.trim() !== filters.source) return false;

  if (filters.areaMode === "radius") {
    if (!filters.site || !offer.coordinates) return false;
    if (distanceKm(filters.site.coordinates, offer.coordinates) > filters.radius) return false;
  } else {
    if (filters.region && offer.regionLabel !== filters.region) return false;
    if (filters.department && offer.departmentCode !== filters.department) return false;
  }
  return !filters.query || offer.searchable.includes(filters.query);
}

function makePopup(offer) {
  const card = document.createElement("article");
  card.className = "recruiter-popup";
  const title = document.createElement("strong");
  title.textContent = offer.formation || offer.intitule_admission || "Formation sans intitulé";
  card.append(title);
  const institution = document.createElement("p");
  institution.textContent = [
    offer.etablissement,
    offer.adresse,
    offer.ville,
    offer.departmentName,
  ]
    .filter(Boolean)
    .join(" · ");
  card.append(institution);
  const metadata = document.createElement("p");
  metadata.textContent = [
    offer.level || "Niveau non identifié",
    offer.modalite_formation,
  ]
    .filter(Boolean)
    .join(" · ");
  card.append(metadata);
  const href = offerLinkUrl(offer);
  if (href) {
    const link = document.createElement("a");
    link.href = href;
    link.target = "_blank";
    link.rel = "noreferrer";
    link.textContent = offer.url_formation ? "Voir la formation ↗" : "Voir la source ↗";
    card.append(link);
  }
  return card;
}

function initializeMap() {
  if (typeof L === "undefined" || typeof L.markerClusterGroup !== "function") {
    throw new Error("La carte n’a pas pu être chargée. Vérifiez la bibliothèque cartographique locale.");
  }
  map = L.map(elements["recruiter-map"], {
    zoomControl: true,
    minZoom: 5,
    maxZoom: 18,
    scrollWheelZoom: true,
  }).fitBounds(FRANCE_BOUNDS);
  L.tileLayer(
    "https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&STYLE=normal&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&FORMAT=image/png",
    {
      attribution:
        '<a href="https://cartes.gouv.fr/" target="_blank" rel="noreferrer">IGN / Géoplateforme</a>',
      minZoom: 5,
      maxZoom: 18,
      tileSize: 256,
    },
  ).addTo(map);
  markerGroup = L.markerClusterGroup({
    chunkedLoading: true,
    maxClusterRadius: 42,
    showCoverageOnHover: false,
    spiderfyOnMaxZoom: true,
    iconCreateFunction(cluster) {
      const count = cluster.getChildCount();
      const size = count >= 100 ? 46 : count >= 10 ? 40 : 34;
      return L.divIcon({
        html: `<div>${count.toLocaleString("fr-FR")}</div>`,
        className: "recruiter-cluster",
        iconSize: L.point(size, size),
      });
    },
  }).addTo(map);

  for (const offer of offers) {
    if (!offer.coordinates) continue;
    const marker = L.circleMarker(offer.coordinates, {
      radius: 6,
      color: "#fff",
      weight: 2,
      fillColor: "#16745c",
      fillOpacity: 0.9,
    });
    marker.bindPopup(makePopup(offer));
    markers.set(offer.id, marker);
  }
}

function createField(label, value) {
  const wrapper = document.createElement("div");
  wrapper.className = "recruiter-field";
  const heading = document.createElement("strong");
  heading.textContent = label;
  const content = document.createElement("p");
  content.textContent = value || "Non renseigné dans la source";
  wrapper.append(heading, content);
  return wrapper;
}

function createOfferCard(offer) {
  const card = document.createElement("article");
  card.className = "prospect-card";
  const main = document.createElement("div");
  main.className = "prospect-main";
  const heading = document.createElement("div");
  heading.className = "prospect-title-row";
  const title = document.createElement("h3");
  title.textContent = offer.formation || offer.intitule_admission || "Formation sans intitulé";
  heading.append(title);
  if (offer.level) {
    const level = document.createElement("span");
    level.className = "level-tag";
    level.textContent = offer.level;
    heading.append(level);
  }
  main.append(heading);
  const institution = document.createElement("p");
  institution.className = "prospect-institution";
  institution.textContent = [
    offer.etablissement,
    offer.adresse,
    offer.ville,
    offer.departmentName,
    offer.regionLabel,
  ]
    .filter(Boolean)
    .join(" · ") || "Établissement ou campus non renseigné";
  main.append(institution);
  const details = document.createElement("div");
  details.className = "prospect-fields";
  details.append(
    createField(
      "Compétences / parcours",
      (offer.parcours || offer.intitule_admission || offer.categorie).slice(0, 360),
    ),
    createField(
      "Modalités",
      [offer.modalite_formation, offer.type_offre].filter(Boolean).join(" · "),
    ),
    createField(
      "Source · collecte",
      `${offer.source || offer.type_offre || "Source non renseignée"} · ${offer.date_collecte || "date non renseignée"}`,
    ),
  );
  main.append(details);
  card.append(main);

  const actions = document.createElement("div");
  actions.className = "prospect-actions";
  if (offer.coordinates) {
    const mapButton = document.createElement("button");
    mapButton.type = "button";
    mapButton.className = "map-link-button";
    mapButton.textContent = "Voir sur la carte";
    mapButton.addEventListener("click", () => {
      map.setView(offer.coordinates, 12);
      const marker = markers.get(offer.id);
      if (marker) marker.openPopup();
    });
    actions.append(mapButton);
  }
  const url = offerLinkUrl(offer);
  if (url) {
    const link = document.createElement("a");
    link.className = "contact-link";
    link.href = url;
    link.target = "_blank";
    link.rel = "noreferrer";
    link.textContent = offer.url_formation
      ? "Fiche formation ↗"
      : "Source de l’offre ↗";
    actions.append(link);
  } else {
    const unavailable = document.createElement("span");
    unavailable.className = "contact-unavailable";
    unavailable.textContent = "Aucun lien direct fourni";
    actions.append(unavailable);
  }
  card.append(actions);
  return card;
}

function updateRadiusOverlay() {
  if (radiusCircle) {
    radiusCircle.remove();
    radiusCircle = null;
  }
  const site = elements["area-mode"].value === "radius" ? getSelectedSite() : null;
  if (!site || !map) return;
  radiusCircle = L.circle(site.coordinates, {
    radius: Number(elements["radius-filter"].value) * 1000,
    color: "#16745c",
    weight: 2,
    fillColor: "#16745c",
    fillOpacity: 0.08,
  }).addTo(map);
}

function renderList() {
  const visible = filteredOffers.slice(0, listLimit);
  elements["recruiter-list"].replaceChildren();
  if (!filteredOffers.length) {
    const empty = document.createElement("p");
    empty.className = "list-message";
    empty.textContent = "Aucune piste ne correspond à ces critères. Élargissez la zone ou retirez un filtre.";
    elements["recruiter-list"].append(empty);
  } else {
    const fragment = document.createDocumentFragment();
    for (const offer of visible) fragment.append(createOfferCard(offer));
    elements["recruiter-list"].append(fragment);
  }
  elements["show-more"].hidden = filteredOffers.length <= listLimit;
  elements["show-more"].textContent = `Afficher les ${Math.min(
    PAGE_SIZE,
    filteredOffers.length - listLimit,
  )} résultats suivants`;
}

function updateView() {
  if (!map || !markerGroup) return;
  const filters = {
    job: elements["job-filter"].value,
    level: elements["level-filter"].value,
    type: elements["type-filter"].value,
    alternance: elements["alternance-filter"].checked,
    category: elements["category-filter"].value,
    source: elements["source-filter"].value,
    areaMode: elements["area-mode"].value,
    region: elements["region-filter"].value,
    department: elements["department-filter"].value,
    site: getSelectedSite(),
    radius: Number(elements["radius-filter"].value),
    query: normalizeText(elements["results-search"].value),
  };
  filteredOffers = offers.filter((offer) => matchesOffer(offer, filters));
  listLimit = PAGE_SIZE;
  markerGroup.clearLayers();
  markerGroup.addLayers(
    filteredOffers.map((offer) => markers.get(offer.id)).filter(Boolean),
  );
  updateRadiusOverlay();
  elements["results-count"].textContent = filteredOffers.length.toLocaleString("fr-FR");
  const mappedCount = filteredOffers.filter((offer) => offer.coordinates).length;
  elements["map-count"].textContent =
    `${mappedCount.toLocaleString("fr-FR")} formations géolocalisées sur ${filteredOffers.length.toLocaleString("fr-FR")} pistes ; les offres sans coordonnées restent consultables dans la liste et le CSV.`;
  elements["export-results"].disabled = filteredOffers.length === 0;
  elements["recruiter-status"].textContent = `${filteredOffers.length} pistes de recrutement trouvées.`;
  renderList();
}

function fitToCurrentArea() {
  if (elements["area-mode"].value === "radius") {
    const site = getSelectedSite();
    if (site) {
      const radius = Number(elements["radius-filter"].value);
      map.fitBounds(
        L.circle(site.coordinates, { radius: radius * 1000 }).getBounds(),
        { padding: [24, 24] },
      );
    }
    return;
  }
  if (elements["department-filter"].value) {
    const points = filteredOffers.filter((offer) => offer.coordinates);
    if (points.length) map.fitBounds(L.latLngBounds(points.map((offer) => offer.coordinates)), { padding: [24, 24] });
  } else if (elements["region-filter"].value) {
    const points = filteredOffers.filter((offer) => offer.coordinates);
    if (points.length) map.fitBounds(L.latLngBounds(points.map((offer) => offer.coordinates)), { padding: [24, 24] });
  } else {
    map.fitBounds(FRANCE_BOUNDS);
  }
}

function csvCell(value) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function currentZoneLabel() {
  if (elements["area-mode"].value === "radius") {
    const site = getSelectedSite();
    return site
      ? `${site.name}, ${site.city} · rayon ${elements["radius-filter"].value} km`
      : "Rayon autour d’un site non sélectionné";
  }
  const department = elements["department-filter"].selectedOptions[0]?.textContent;
  const region = elements["region-filter"].value;
  return department || region || "Toute la France";
}

function exportCsv() {
  const fields = [
    ["formation", "Formation"],
    ["intitule_admission", "Intitulé d’admission"],
    ["etablissement", "Établissement / campus"],
    ["code_uai", "Code UAI"],
    ["ville", "Ville"],
    ["code_departement", "Code département"],
    ["departement", "Département"],
    ["region", "Région"],
    ["niveau", "Niveau estimé"],
    ["type", "Type normalisé"],
    ["modalite_formation", "Modalités"],
    ["metier", "Famille métier filtrée"],
    ["parcours", "Compétences / parcours"],
    ["source", "Source"],
    ["date_collecte", "Date de collecte"],
    ["url_formation", "Lien formation"],
    ["url_source", "Lien source"],
    ["latitude", "Latitude"],
    ["longitude", "Longitude"],
    ["distance_km", "Distance au site (km)"],
    ["zone", "Zone de recherche"],
  ];
  const rows = [
    fields.map(([, label]) => csvCell(label)).join(";"),
    ...filteredOffers.map((offer) =>
      fields
        .map(([key]) => {
          if (key === "niveau") return csvCell(offer.level || "Non identifié");
          if (key === "type") return csvCell(offer.typeLabel || "Non renseigné");
          if (key === "metier") {
            const selectedJob = elements["job-filter"].selectedOptions[0]?.textContent;
            return csvCell(selectedJob || "Tous les métiers");
          }
          if (key === "zone") return csvCell(currentZoneLabel());
          if (key === "distance_km") {
            const site =
              elements["area-mode"].value === "radius" ? getSelectedSite() : null;
            return csvCell(
              site && offer.coordinates
                ? distanceKm(site.coordinates, offer.coordinates).toFixed(1)
                : "",
            );
          }
          return csvCell(offer[key] ?? "");
        })
        .join(";"),
    ),
  ];
  const blob = new Blob(["\uFEFF", rows.join("\r\n")], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "pistes-recrutement-pharma.csv";
  link.click();
  URL.revokeObjectURL(url);
}

function connectControls() {
  for (const id of [
    "job-filter",
    "level-filter",
    "type-filter",
    "alternance-filter",
    "category-filter",
    "source-filter",
    "results-search",
  ]) {
    elements[id].addEventListener("input", updateView);
    elements[id].addEventListener("change", updateView);
  }
  elements["area-mode"].addEventListener("change", () => {
    const radiusMode = elements["area-mode"].value === "radius";
    elements["department-area"].hidden = radiusMode;
    elements["radius-area"].hidden = !radiusMode;
    updateView();
    fitToCurrentArea();
  });
  elements["region-filter"].addEventListener("change", () => {
    updateDepartments();
    updateView();
    fitToCurrentArea();
  });
  elements["department-filter"].addEventListener("change", () => {
    updateView();
    fitToCurrentArea();
  });
  elements["site-filter"].addEventListener("change", () => {
    updateView();
    fitToCurrentArea();
  });
  elements["radius-filter"].addEventListener("change", () => {
    updateView();
    fitToCurrentArea();
  });
  elements["show-more"].addEventListener("click", () => {
    listLimit += PAGE_SIZE;
    renderList();
  });
  elements["export-results"].addEventListener("click", exportCsv);
  elements["reset-filters"].addEventListener("click", () => {
    for (const id of [
      "job-filter",
      "level-filter",
      "type-filter",
      "category-filter",
      "source-filter",
      "results-search",
    ]) {
      elements[id].value = "";
    }
    elements["alternance-filter"].checked = false;
    elements["area-mode"].value = "department";
    elements["department-area"].hidden = false;
    elements["radius-area"].hidden = true;
    elements["region-filter"].value = "";
    updateDepartments();
    elements["department-filter"].value = "";
    elements["site-filter"].value = "";
    elements["radius-filter"].value = "25";
    updateView();
    map.fitBounds(FRANCE_BOUNDS);
  });
}

async function initialize() {
  try {
    const response = await fetch(DATA_URL);
    if (!response.ok) {
      throw new Error(`Impossible de charger le catalogue (${response.status}).`);
    }
    const rows = parseCsv(await response.text());
    for (const [index, row] of rows.entries()) {
      const offer = {
        ...row,
        id: `${row.identifiant_source || row.code_offre_parcoursup || "offre"}-${index}`,
        coordinates: coordinatesFor(row),
        departmentCode: getDepartmentCode(row),
        departmentName: row.departement.trim(),
        regionLabel: normalizeRegion(row.region),
        level: getLevel(row),
        type: getType(row),
      };
      offer.typeLabel =
        offer.type === "apprentissage"
          ? "Apprentissage"
          : offer.type === "continue"
            ? "Formation continue / CPF"
            : offer.type === "initiale"
              ? "Formation diplômante"
              : "";
      offer.searchable = offerSearchText(offer);
      offers.push(offer);
    }
    populateFilters();
    populateSites();
    initializeMap();
    elements["catalogue-date"].textContent =
      `Catalogue local de ${offers.length.toLocaleString("fr-FR")} offres · date de collecte indiquée dans chaque fiche lorsqu’elle est fournie.`;
    connectControls();
    updateView();
  } catch (error) {
    console.error("Échec du parcours recruteur.", error);
    elements["recruiter-error"].textContent = error.message;
    elements["recruiter-error"].hidden = false;
    elements["recruiter-list"].replaceChildren();
    const message = document.createElement("p");
    message.className = "list-message";
    message.textContent = "Le catalogue n’a pas pu être chargé. Vérifiez les fichiers de données locaux et rechargez la page.";
    elements["recruiter-list"].append(message);
    elements["map-count"].textContent = "Carte indisponible.";
  }
}

initialize();
