const DATA = window.PHARMA_STATIC_DATA;
const STORAGE_KEY = "pharma-france-student-saved-companies";
const PAGE_SIZE = 50;
const ACTIVITY_LABELS = {
  "21.10Z": "Fabrication de produits pharmaceutiques de base",
  "21.20Z": "Fabrication de préparations pharmaceutiques",
};
const JOB_PROFILES = [
  { value: "production", label: "Production & procédés", terms: /production|proc[eé]d[eé]|fabrication|conditionnement|op[eé]rateur|formulation/i },
  { value: "qualite", label: "Qualité & réglementation", terms: /qualit[eé]|qse|r[eé]glement|m[eé]trologie|contr[oô]le|validation|assurance qualit[eé]/i },
  { value: "laboratoire", label: "Laboratoire & analyses", terms: /laboratoire|analyse|bioanal|chimie|microbiolog|biologie|contr[oô]le/i },
  { value: "biotech", label: "Biotechnologies & R&D", terms: /biotech|bioproc[eé]d[eé]|sciences du vivant|g[eé]nie biologique|recherche|mol[eé]culaire/i },
  { value: "pharmacie", label: "Pharmacie & médicament", terms: /pharmacie|m[eé]dicament|pharmaceutique|sant[eé]|pharmacologie/i },
  { value: "maintenance", label: "Maintenance & ingénierie", terms: /maintenance|ing[eé]nierie|automatisme|instrumentation|syst[eè]me de production/i },
  { value: "data", label: "Données & informatique santé", terms: /donn[eé]es|informatique|num[eé]rique|bioinformatique|statistique|data|clinique/i },
];
const REGIONS = [
  { name: "Auvergne-Rhône-Alpes", departments: "01,03,07,15,26,38,42,43,69,73,74" },
  { name: "Bourgogne-Franche-Comté", departments: "21,25,39,58,70,71,89,90" },
  { name: "Bretagne", departments: "22,29,35,56" },
  { name: "Centre-Val de Loire", departments: "18,28,36,37,41,45" },
  { name: "Corse", departments: "2A,2B" },
  { name: "Grand Est", departments: "08,10,51,52,54,55,57,67,68,88" },
  { name: "Hauts-de-France", departments: "02,59,60,62,80" },
  { name: "Normandie", departments: "14,27,50,61,76" },
  { name: "Nouvelle-Aquitaine", departments: "16,17,19,23,24,33,40,47,64,79,86,87" },
  { name: "Occitanie", departments: "09,11,12,30,31,32,34,46,48,65,66,81,82" },
  { name: "Pays de la Loire", departments: "44,49,53,72,85" },
  { name: "Provence-Alpes-Côte d’Azur", departments: "04,05,06,13,83,84" },
  { name: "Île-de-France", departments: "75,77,78,91,92,93,94,95" },
  { name: "Guadeloupe", departments: "971" },
  { name: "Martinique", departments: "972" },
  { name: "Guyane", departments: "973" },
  { name: "La Réunion", departments: "974" },
  { name: "Mayotte", departments: "976" },
  { name: "Saint-Pierre-et-Miquelon", departments: "975" },
  { name: "Saint-Barthélemy", departments: "977" },
  { name: "Saint-Martin", departments: "978" },
  { name: "Wallis-et-Futuna", departments: "986" },
  { name: "Polynésie française", departments: "987" },
  { name: "Nouvelle-Calédonie", departments: "988" },
];
const DEPARTMENT_REGION = new Map(
  REGIONS.flatMap(({ name, departments }) =>
    departments.split(",").map((code) => [code, name]),
  ),
);
const REGION_ALIASES = new Map([
  ["centre", "Centre-Val de Loire"],
  ["grandest", "Grand Est"],
  ["iledefrance", "Île-de-France"],
  ["nouvelleaquitaine", "Nouvelle-Aquitaine"],
  ["paysdelaloire", "Pays de la Loire"],
  ["reunion", "La Réunion"],
]);
const FRANCE_BOUNDS = [[41.1, -5.3], [51.3, 9.8]];
const companyModeButton = document.querySelector('[data-mode="companies"]');
const trainingModeButton = document.querySelector('[data-mode="training"]');
const modeLinks = [...document.querySelectorAll("[data-student-mode-link]")];
const jobInput = document.querySelector("#student-job");
const jobOptions = document.querySelector("#student-job-options");
const sectorInput = document.querySelector("#student-sector");
const sectorOptions = document.querySelector("#student-sector-options");
const regionSelect = document.querySelector("#student-region");
const departmentSelect = document.querySelector("#student-department");
const zoneModeSelect = document.querySelector("#student-zone-mode");
const originInput = document.querySelector("#student-origin");
const radiusSelect = document.querySelector("#student-radius");
const resultsList = document.querySelector("#student-list");
const countElement = document.querySelector("#student-result-count");
const savedCountElement = document.querySelector("#saved-count");
const statusElement = document.querySelector("#student-status");
const mapError = document.querySelector("#student-map-error");
let mode = "companies";
let trainingRecords = [];
let companyRecords = [];
let locations = [];
let savedCompanies = readSavedCompanies();
let filteredResults = [];
let visibleLimit = PAGE_SIZE;
let markerCluster;
let map;
let lastGeographicState = null;
let jobSelection = "";
let sectorSelection = "";
let visibleJobOptions = [];
let visibleSectorOptions = [];

function readSavedCompanies() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return new Set(Array.isArray(stored) ? stored.filter((id) => typeof id === "string") : []);
  } catch (error) {
    console.error("Impossible de lire la liste d’entreprises enregistrées.", error);
    return new Set();
  }
}

function persistSavedCompanies() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...savedCompanies]));
  } catch (error) {
    console.error("Impossible d’enregistrer la liste d’entreprises.", error);
    statusElement.textContent = "La liste n’a pas pu être enregistrée dans ce navigateur.";
  }
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"' && field.length === 0) {
      quoted = true;
    } else if (char === ";") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field.replace(/\r$/, ""));
      if (row.some((cell) => cell.trim())) rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  row.push(field.replace(/\r$/, ""));
  if (row.some((cell) => cell.trim())) rows.push(row);
  const headers = rows.shift() || [];
  return rows.map((cells) =>
    Object.fromEntries(headers.map((header, index) => [header, cells[index] || ""])),
  );
}

function parseCoordinates(value) {
  if (Array.isArray(value) && value.length === 2) {
    if (value.some((part) => typeof part === "string" && !part.trim())) return null;
    const coordinates = value.map(Number);
    return coordinates.every(Number.isFinite) &&
      Math.abs(coordinates[0]) <= 90 &&
      Math.abs(coordinates[1]) <= 180
      ? coordinates
      : null;
  }
  if (typeof value === "string") {
    const parts = value.split(",");
    if (parts.length !== 2 || parts.some((part) => !part.trim())) return null;
    const coordinates = parts.map((part) => Number(part.trim()));
    return coordinates.every(Number.isFinite) &&
      Math.abs(coordinates[0]) <= 90 &&
      Math.abs(coordinates[1]) <= 180
      ? coordinates
      : null;
  }
  return null;
}

function departmentCode(value) {
  if (!value) return "";
  const normalized = String(value).trim().toUpperCase();
  if (/^(2A|2B)$/.test(normalized)) return normalized;
  if (/^\d{1,3}$/.test(normalized)) return normalized.padStart(2, "0");
  return "";
}

function departmentFromAddress(address) {
  const postalCode = String(address || "").match(/\b(\d{5})\b/);
  if (!postalCode) return "";
  const prefix = postalCode[1].slice(0, 2);
  if (prefix === "20") {
    const department = Number(postalCode[1].slice(2, 3));
    return department < 2 ? "2A" : "2B";
  }
  if (prefix === "97" || prefix === "98") return postalCode[1].slice(0, 3);
  return prefix;
}

function isFrenchPostalCode(value) {
  const postalCode = String(value || "").match(/\b(\d{5})\b/)?.[1];
  if (!postalCode) return false;
  return /^(?:0[1-9]|[1-8]\d|9[0-5])\d{3}$/.test(postalCode) ||
    /^97[1-8]\d{2}$/.test(postalCode) ||
    /^98[4678]\d{2}$/.test(postalCode);
}

function isFrenchCoordinates(coordinates) {
  if (!coordinates) return false;
  const [latitude, longitude] = coordinates;
  const boundingBoxes = [
    [41, 51.5, -5.6, 10],
    [14.2, 16.8, -62.2, -60.6],
    [1.5, 6, -55, -51],
    [-22.5, -20.5, 54.5, 56.5],
    [-13.5, -12, 44.5, 45.7],
    [46.3, 47.2, -56.8, -55.8],
    [17.7, 18.2, -63.3, -62.4],
    [17.9, 18.4, -63.3, -62.8],
    [-14.8, -12.8, -178.5, -175.5],
    [-28.5, -7, -156, -133],
    [-24, -18, 162, 169],
  ];
  return boundingBoxes.some(
    ([minLatitude, maxLatitude, minLongitude, maxLongitude]) =>
      latitude >= minLatitude &&
      latitude <= maxLatitude &&
      longitude >= minLongitude &&
      longitude <= maxLongitude,
  );
}

function isFrenchLocation(location) {
  const postalCode = String(location.address || "").match(/\b\d{5}\b/)?.[0];
  return postalCode ? isFrenchPostalCode(postalCode) : isFrenchCoordinates(location.coordinates);
}

function departmentFor(record) {
  return departmentCode(record.code_departement || record.departement);
}

function regionFor(record) {
  return canonicalRegion(record.region) || DEPARTMENT_REGION.get(departmentFor(record)) || "";
}

function distanceKm(pointA, pointB) {
  const radians = (degrees) => (degrees * Math.PI) / 180;
  const [latA, lonA] = pointA;
  const [latB, lonB] = pointB;
  const deltaLat = radians(latB - latA);
  const deltaLon = radians(lonB - lonA);
  const value =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(radians(latA)) * Math.cos(radians(latB)) * Math.sin(deltaLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

function text(value) {
  return String(value || "").trim();
}

function normalize(value) {
  return text(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function canonicalRegion(value) {
  const key = normalize(value).replace(/[^a-z0-9]/g, "");
  if (!key) return "";
  return REGION_ALIASES.get(key) ||
    REGIONS.find((region) => normalize(region.name).replace(/[^a-z0-9]/g, "") === key)?.name ||
    "";
}

function companySearchText(company, companyLocations) {
  return normalize(
    [
      company.nom_complet,
      ...(company.activityCodes || []).map((code) => ACTIVITY_LABELS[code] || code),
      ...companyLocations.map((location) => `${location.address} ${location.city}`),
    ].join(" "),
  );
}

function trainingSearchText(record) {
  return normalize(
    [record.formation, record.intitule_admission, record.parcours, record.etablissement, record.categorie]
      .filter(Boolean)
      .join(" "),
  );
}

function companyLocationsFor(company, sites) {
  const locationsForCompany = [];
  const headquarters = company.siege || {};
  const headquartersCoordinates = parseCoordinates(headquarters.coordonnees);
  const headquartersDepartment = departmentFromAddress(headquarters.code_postal);
  locationsForCompany.push({
    id: `${company.siren}:siege`,
    companyId: company.siren,
    type: "headquarters",
    title: company.nom_complet,
    city: text(headquarters.libelle_commune),
    address: [headquarters.code_postal, headquarters.libelle_commune].filter(Boolean).join(" "),
    department: headquartersDepartment,
    region: DEPARTMENT_REGION.get(headquartersDepartment) || "",
    coordinates: headquartersCoordinates,
    activityCodes: company.activityCodes || [],
  });
  for (const site of sites) {
    const coordinates = parseCoordinates(site.coordinates);
    const department = departmentFromAddress(site.etablissement?.adresse);
    locationsForCompany.push({
      id: `site:${site.siret}`,
      companyId: company.siren,
      type: "site",
      title: site.companyName || company.nom_complet,
      city: text(site.etablissement?.libelle_commune),
      address: text(site.etablissement?.adresse),
      department,
      region: DEPARTMENT_REGION.get(department) || "",
      coordinates,
      activityCodes: [site.etablissement?.activite_principale].filter(Boolean),
      siret: site.siret,
    });
  }
  return locationsForCompany.filter(isFrenchLocation);
}

function trainingLocation(record) {
  const coordinates = parseCoordinates([record.latitude, record.longitude]);
  if (!coordinates) return null;
  return {
    id: `formation:${record.identifiant_source || record.etablissement + record.formation}`,
    type: "training",
    title: text(record.formation || record.intitule_admission),
    institution: text(record.etablissement),
    city: text(record.ville),
    address: text(record.adresse),
    department: departmentFor(record),
    region: regionFor(record),
    coordinates,
    record,
  };
}

function initializeCompanyRecords() {
  if (!Array.isArray(DATA?.companies) || !Array.isArray(DATA?.sites)) {
    throw new Error("L’instantané local des entreprises est introuvable.");
  }
  const sitesByCompany = new Map();
  for (const site of DATA.sites) {
    if (!ACTIVITY_LABELS[site.etablissement?.activite_principale]) continue;
    const collection = sitesByCompany.get(site.companySiren) || [];
    collection.push(site);
    sitesByCompany.set(site.companySiren, collection);
  }
  companyRecords = DATA.companies
    .filter((company) => company.siren && company.activityCodes?.some((code) => ACTIVITY_LABELS[code]))
    .map((company) => {
      const companyLocations = companyLocationsFor(company, sitesByCompany.get(company.siren) || []);
      return {
        id: company.siren,
        company,
        locations: companyLocations,
        searchText: companySearchText(company, companyLocations),
      };
    });
}

function initializeMap() {
  map = L.map("student-map", {
    preferCanvas: true,
    scrollWheelZoom: true,
    maxZoom: 18,
  }).fitBounds(FRANCE_BOUNDS);
  L.tileLayer(
    "https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&STYLE=normal&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&FORMAT=image/png",
    {
      attribution: "© IGN – Géoplateforme",
      maxZoom: 18,
      minZoom: 5,
    },
  ).addTo(map);
  markerCluster = L.markerClusterGroup({
    chunkedLoading: true,
    maxClusterRadius: 38,
    iconCreateFunction(cluster) {
      const count = cluster.getChildCount();
      const size = count < 10 ? 34 : count < 100 ? 40 : 48;
      return L.divIcon({
        html: `<div>${count.toLocaleString("fr-FR")}</div>`,
        className: "student-cluster",
        iconSize: [size, size],
      });
    },
  }).addTo(map);
}

function setMode(nextMode) {
  if (!["companies", "training"].includes(nextMode)) return;
  mode = nextMode;
  history.replaceState(null, "", `#${mode === "companies" ? "entreprises" : "formations"}`);
  companyModeButton.classList.toggle("is-active", mode === "companies");
  companyModeButton.setAttribute("aria-selected", String(mode === "companies"));
  trainingModeButton.classList.toggle("is-active", mode === "training");
  trainingModeButton.setAttribute("aria-selected", String(mode === "training"));
  document.querySelector("#student-result-step").textContent =
    mode === "companies" ? "4 · Entreprises et sites" : "4 · Formations";
  document.querySelector("#student-result-title").textContent =
    mode === "companies" ? "Pistes à explorer" : "Formations à découvrir";
  document.querySelector("#student-map-title").textContent =
    mode === "companies" ? "Entreprises et sites industriels" : "Campus et lieux de formation";
  document.querySelector("#job-hint").textContent =
    mode === "companies"
      ? "Choisissez une famille pour votre projet. Les métiers associés aux entreprises ne sont pas renseignés dans la source."
      : "Les familles filtrent les formations selon leur intitulé, leur parcours et leur domaine.";
  document.querySelector("#sector-hint").textContent =
    mode === "companies"
      ? "Secteurs issus des codes NAF déclarés dans l’instantané local."
      : "Domaines de formation classés dans le catalogue local.";
  populateSectorOptions();
  visibleLimit = PAGE_SIZE;
  render();
}

function populateSectorOptions() {
  const previous = sectorSelection;
  const options = [];
  if (mode === "companies") {
    for (const [code, label] of Object.entries(ACTIVITY_LABELS)) {
      options.push({ value: code, label });
    }
  } else {
    const categories = [...new Set(trainingRecords.map((record) => text(record.categorie)).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, "fr"));
    for (const category of categories) options.push({ value: category, label: category });
  }
  if (!options.some((option) => option.value === previous)) {
    sectorSelection = "";
    sectorInput.value = "";
  }
  renderSearchableOptions("job", "");
  renderSearchableOptions("sector", "");
}

function optionsFor(kind) {
  const allOption = kind === "job"
    ? { value: "", label: "Tous les métiers" }
    : { value: "", label: "Tous les secteurs" };
  const choices = kind === "job"
    ? JOB_PROFILES.map(({ value, label }) => ({ value, label }))
    : Object.entries(ACTIVITY_LABELS).map(([value, label]) => ({ value, label }));
  if (kind === "sector" && mode === "training") {
    choices.splice(0, choices.length, ...[...new Set(trainingRecords.map((record) => text(record.categorie)).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, "fr"))
      .map((category) => ({ value: category, label: category })));
  }
  return [allOption, ...choices];
}

function renderSearchableOptions(kind, query) {
  const isJob = kind === "job";
  const input = isJob ? jobInput : sectorInput;
  const listbox = isJob ? jobOptions : sectorOptions;
  const selected = isJob ? jobSelection : sectorSelection;
  const options = optionsFor(kind);
  const normalizedQuery = normalize(query);
  const visible = options.filter((option) =>
    !normalizedQuery || normalize(option.label).includes(normalizedQuery),
  );
  if (isJob) visibleJobOptions = visible;
  else visibleSectorOptions = visible;

  listbox.replaceChildren();
  if (!visible.length) {
    listbox.append(element("p", "student-combobox-empty", "Aucun choix ne correspond à cette recherche."));
    return;
  }
  visible.forEach((option, index) => {
    const button = element("button", "student-combobox-option", option.label);
    button.type = "button";
    button.id = `${kind}-option-${index}`;
    button.setAttribute("role", "option");
    button.setAttribute("aria-selected", String(option.value === selected));
    button.dataset.value = option.value;
    button.dataset.index = String(index);
    button.addEventListener("mousedown", (event) => event.preventDefault());
    button.addEventListener("click", () => {
      if (isJob) {
        jobSelection = option.value;
        input.value = option.label === "Tous les métiers" ? "" : option.label;
      } else {
        sectorSelection = option.value;
        input.value = option.label === "Tous les secteurs" ? "" : option.label;
      }
      closeSearchableOptions(kind);
      render();
    });
    listbox.append(button);
  });
}

function openSearchableOptions(kind) {
  const isJob = kind === "job";
  const input = isJob ? jobInput : sectorInput;
  const listbox = isJob ? jobOptions : sectorOptions;
  renderSearchableOptions(kind, input.value);
  listbox.hidden = false;
  input.setAttribute("aria-expanded", "true");
}

function closeSearchableOptions(kind) {
  const input = kind === "job" ? jobInput : sectorInput;
  const listbox = kind === "job" ? jobOptions : sectorOptions;
  listbox.hidden = true;
  input.setAttribute("aria-expanded", "false");
  input.removeAttribute("aria-activedescendant");
}

function connectSearchableCombobox(kind) {
  const isJob = kind === "job";
  const input = isJob ? jobInput : sectorInput;
  const listbox = isJob ? jobOptions : sectorOptions;
  input.addEventListener("focus", () => openSearchableOptions(kind));
  input.addEventListener("input", () => {
    if (isJob) jobSelection = "";
    else sectorSelection = "";
    openSearchableOptions(kind);
    render();
  });
  input.addEventListener("keydown", (event) => {
    const visible = isJob ? visibleJobOptions : visibleSectorOptions;
    const activeIndex = visible.findIndex((option, index) =>
      listbox.querySelector(`[data-index="${index}"]`)?.classList.contains("is-active"),
    );
    if (event.key === "Escape") {
      closeSearchableOptions(kind);
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      openSearchableOptions(kind);
      const step = event.key === "ArrowDown" ? 1 : -1;
      const nextIndex = Math.max(0, Math.min(visible.length - 1, activeIndex + step));
      const next = listbox.querySelector(`[data-index="${nextIndex}"]`);
      listbox.querySelector(".is-active")?.classList.remove("is-active");
      next?.classList.add("is-active");
      input.setAttribute("aria-activedescendant", next?.id || "");
      next?.scrollIntoView({ block: "nearest" });
      return;
    }
    if (event.key === "Enter" && !listbox.hidden) {
      event.preventDefault();
      const active = listbox.querySelector(".is-active") || listbox.querySelector('[role="option"]');
      active?.click();
    }
  });
  input.addEventListener("blur", () => {
    window.setTimeout(() => closeSearchableOptions(kind), 100);
  });
}

function populateGeography() {
  const seenDepartments = new Map();
  for (const record of trainingRecords) {
    const code = departmentFor(record);
    const label = text(record.departement);
    if (code && DEPARTMENT_REGION.has(code) && !seenDepartments.has(code)) {
      seenDepartments.set(code, label || code);
    }
  }
  for (const record of companyRecords) {
    for (const location of record.locations) {
      if (location.department && DEPARTMENT_REGION.has(location.department) && !seenDepartments.has(location.department)) {
        seenDepartments.set(location.department, location.department);
      }
    }
  }
  regionSelect.replaceChildren(new Option("Toute la France", ""));
  for (const region of REGIONS) {
    const hasData = [...seenDepartments.keys()].some((code) => region.departments.split(",").includes(code));
    if (hasData) regionSelect.add(new Option(region.name, region.name));
  }
  departmentSelect.replaceChildren(new Option("Tous les départements", ""));
  [...seenDepartments.entries()]
    .sort(([codeA], [codeB]) => codeA.localeCompare(codeB, "fr", { numeric: true }))
    .forEach(([code, label]) => departmentSelect.add(new Option(`${code} · ${label}`, code)));
  departmentSelect.disabled = !regionSelect.value;
  refreshDepartmentOptions();

  const origins = new Map();
  for (const record of companyRecords) {
    for (const location of record.locations) {
      if (!location.coordinates) continue;
      const label = `${location.city || "Commune inconnue"} · ${location.title} (${location.type === "site" ? "site industriel" : "siège"})`;
      if (!origins.has(label)) origins.set(label, location.coordinates);
    }
  }
  for (const record of trainingRecords) {
    const location = trainingLocation(record);
    if (!location) continue;
    const label = `${location.city || "Commune inconnue"} · ${location.institution} (campus)`;
    if (!origins.has(label)) origins.set(label, location.coordinates);
  }
  const originList = document.querySelector("#student-origin-list");
  originList.replaceChildren(...[...origins.keys()].sort((a, b) => a.localeCompare(b, "fr")).map((label) => {
    const option = document.createElement("option");
    option.value = label;
    return option;
  }));
  locations = [...origins.entries()];
  originInput.dataset.locations = "ready";
}

function refreshDepartmentOptions() {
  const selected = departmentSelect.value;
  const region = REGIONS.find((item) => item.name === regionSelect.value);
  const allowedCodes = region ? new Set(region.departments.split(",")) : null;
  for (const option of [...departmentSelect.options].slice(1)) {
    option.hidden = Boolean(allowedCodes && !allowedCodes.has(option.value));
  }
  if (selected && allowedCodes && !allowedCodes.has(selected)) departmentSelect.value = "";
  departmentSelect.disabled = !regionSelect.value;
}

function locationMatchesFilters(location, center) {
  if (zoneModeSelect.value === "radius") {
    return center && location.coordinates && distanceKm(center, location.coordinates) <= Number(radiusSelect.value);
  }
  const selectedDepartment = departmentSelect.value;
  if (selectedDepartment && location.department !== selectedDepartment) return false;
  const selectedRegion = regionSelect.value;
  if (selectedRegion && (location.region || DEPARTMENT_REGION.get(location.department)) !== selectedRegion) return false;
  return true;
}

function activeOrigin() {
  if (!originInput.value) return null;
  return locations.find(([label]) => label === originInput.value)?.[1] || null;
}

function filteredCompanies() {
  const query = jobSelection ? "" : normalize(jobInput.value);
  const sector = sectorSelection;
  const center = zoneModeSelect.value === "radius" ? activeOrigin() : null;
  return companyRecords
    .map((record) => ({
      ...record,
      visibleLocations: record.locations.filter((location) =>
        (!sector || location.activityCodes.includes(sector)) &&
        locationMatchesFilters(location, center),
      ),
    }))
    .filter((record) =>
      (!query || record.searchText.includes(query)) &&
      (!sector || record.company.activityCodes?.includes(sector)) &&
      record.visibleLocations.length > 0,
    )
    .sort((a, b) => a.company.nom_complet.localeCompare(b.company.nom_complet, "fr"));
}

function filteredTraining() {
  const query = jobSelection ? "" : normalize(jobInput.value);
  const selectedProfile = JOB_PROFILES.find((profile) => profile.value === jobSelection);
  const sector = sectorSelection;
  const center = zoneModeSelect.value === "radius" ? activeOrigin() : null;
  return trainingRecords.filter((record) => {
    const location = trainingLocation(record);
    if (sector && record.categorie !== sector) return false;
    const searchable = trainingSearchText(record);
    if (selectedProfile && !selectedProfile.terms.test(searchable)) return false;
    if (query && !searchable.includes(query)) return false;
    if (zoneModeSelect.value === "radius") {
      return Boolean(location && locationMatchesFilters(location, center));
    }
    const department = departmentFor(record);
    const recordRegion = regionFor(record);
    if (departmentSelect.value && department !== departmentSelect.value) return false;
    if (regionSelect.value && recordRegion !== regionSelect.value) return false;
    return true;
  }).sort((a, b) => text(a.formation || a.intitule_admission).localeCompare(text(b.formation || b.intitule_admission), "fr"));
}

function element(tagName, className, value) {
  const node = document.createElement(tagName);
  if (className) node.className = className;
  if (value !== undefined) node.textContent = value;
  return node;
}

function addLink(parent, href, label) {
  const link = document.createElement("a");
  link.href = href;
  link.target = "_blank";
  link.rel = "noreferrer";
  link.textContent = label;
  parent.append(link);
}

function companyCard(record) {
  const company = record.company;
  const card = element("article", "student-card");
  const header = element("div", "student-card-header");
  header.append(element("h3", "", company.nom_complet || "Entreprise sans nom"));
  header.append(element("span", "student-type-tag", `${record.visibleLocations.length} lieu(x) repéré(s)`));
  card.append(header);

  const codes = [...new Set(record.visibleLocations.flatMap((location) => location.activityCodes))];
  const codeLabels = codes.map((code) => `${code} · ${ACTIVITY_LABELS[code] || "activité non renseignée"}`);
  card.append(element("p", "student-card-activity", codeLabels.join(" ; ") || "Activité non renseignée"));
  card.append(element("p", "", `Métiers associés : non renseignés dans cette source. Aucun recrutement actif n’est déduit.`));
  card.append(element("p", "", `Source : INSEE Sirene · Annuaire des Entreprises · instantané ${formatDate(DATA.generatedAt)}.`));
  for (const location of record.visibleLocations.slice(0, 4)) {
    const label = location.type === "site" ? "Site industriel" : "Siège social";
    const line = [label, location.address || location.city || "Adresse non renseignée", location.department ? `Département ${location.department}` : ""]
      .filter(Boolean).join(" · ");
    card.append(element("p", "", `${line}${location.coordinates ? "" : " · Coordonnées non disponibles sur la carte"}`));
  }
  if (record.visibleLocations.length > 4) {
    card.append(element("p", "", `Et ${record.visibleLocations.length - 4} autre(s) lieu(x) dans la zone.`));
  }
  const actions = element("div", "student-card-actions");
  const saveButton = element("button", `save-company-button${savedCompanies.has(company.siren) ? " is-saved" : ""}`, savedCompanies.has(company.siren) ? "Retirer de ma liste" : "Enregistrer");
  saveButton.type = "button";
  saveButton.addEventListener("click", () => toggleSaved(company.siren));
  actions.append(saveButton);
  addLink(actions, `https://annuaire-entreprises.data.gouv.fr/entreprise/${encodeURIComponent(company.siren)}`, "Fiche officielle ↗");
  card.append(actions);
  return card;
}

function trainingCard(record) {
  const card = element("article", "student-card");
  const header = element("div", "student-card-header");
  header.append(element("h3", "", record.formation || record.intitule_admission || "Formation sans intitulé"));
  if (record.categorie) header.append(element("span", "student-type-tag training-tag", record.categorie));
  card.append(header);
  card.append(element("p", "student-card-activity", record.etablissement || "Établissement non renseigné"));
  card.append(element("p", "", [record.ville, record.departement, record.region].filter(Boolean).join(" · ") || "Lieu non renseigné"));
  card.append(element("p", "", [record.modalite_formation, record.type_offre].filter(Boolean).join(" · ") || "Modalités non renseignées"));
  card.append(element("p", "", `Source : ${record.source || "non renseignée"} · mise à jour : ${formatDate(record.date_collecte)}.`));
  const actions = element("div", "student-card-actions");
  const url = text(record.url_formation);
  if (url && /^https?:\/\//i.test(url)) addLink(actions, url, "Voir la formation ↗");
  const sourceUrl = text(record.url_source);
  if (sourceUrl && /^https?:\/\//i.test(sourceUrl)) addLink(actions, sourceUrl, "Voir la source ↗");
  card.append(actions);
  return card;
}

function formatDate(value) {
  if (!value) return "non renseignée";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString("fr-FR");
}

function renderList() {
  resultsList.replaceChildren();
  const count = filteredResults.length;
  countElement.textContent = count.toLocaleString("fr-FR");
  document.querySelector("#student-map-count").textContent =
    `${count.toLocaleString("fr-FR")} résultat(s) · ${mapLocations().length.toLocaleString("fr-FR")} point(s) cartographié(s)`;
  const shown = filteredResults.slice(0, visibleLimit);
  if (!shown.length) {
    const message = zoneModeSelect.value === "radius" && !activeOrigin()
      ? "Choisissez un site ou campus de départ dans le champ « Point de départ » pour lancer la recherche par rayon."
      : mode === "companies"
        ? "Aucune entreprise ne correspond à ces critères. Essayez un métier plus général ou élargissez la zone."
        : "Aucune formation ne correspond à ces critères. Essayez un mot-clé plus général ou élargissez la zone.";
    resultsList.append(element("p", "student-list-message", message));
  } else {
    const fragment = document.createDocumentFragment();
    for (const record of shown) fragment.append(mode === "companies" ? companyCard(record) : trainingCard(record));
    resultsList.append(fragment);
  }
  const moreButton = document.querySelector("#student-show-more");
  moreButton.hidden = count <= visibleLimit;
  moreButton.textContent = `Afficher les ${Math.min(PAGE_SIZE, count - visibleLimit)} suivants`;
  if (mode === "companies") {
    const locationTypes = new Set(filteredResults.flatMap((record) => record.visibleLocations.map((location) => location.type)));
    document.querySelector("#student-legend").replaceChildren(
      ...(locationTypes.has("headquarters") ? [legendItem("legend-headquarters", "Siège social")] : []),
      ...(locationTypes.has("site") ? [legendItem("legend-site", "Site industriel")] : []),
    );
  } else {
    document.querySelector("#student-legend").replaceChildren(legendItem("legend-training", "Lieu de formation"));
  }
}

function legendItem(className, label) {
  const item = element("span");
  const marker = element("i", className);
  item.append(marker, document.createTextNode(label));
  return item;
}

function mapLocations() {
  if (mode === "companies") {
    return filteredResults.flatMap((record) => record.visibleLocations).filter((location) => location.coordinates);
  }
  return filteredResults.map(trainingLocation).filter(Boolean);
}

function popupContent(location) {
  const wrapper = element("div", "student-map-popup");
  wrapper.append(element("strong", "", location.title));
  wrapper.append(element("span", "", location.type === "site" ? "Site industriel" : location.type === "headquarters" ? "Siège social" : "Lieu de formation"));
  const description = location.type === "training"
    ? [location.institution, location.address || location.city, location.record.categorie].filter(Boolean).join(" · ")
    : [location.address || location.city, ...(location.activityCodes || []).map((code) => `${code} · ${ACTIVITY_LABELS[code] || code}`)].filter(Boolean).join(" · ");
  wrapper.append(element("p", "", description || "Détails non renseignés"));
  const href = location.type === "training"
    ? text(location.record.url_formation)
    : location.type === "site"
      ? `https://annuaire-entreprises.data.gouv.fr/etablissement/${encodeURIComponent(location.siret)}`
      : `https://annuaire-entreprises.data.gouv.fr/entreprise/${encodeURIComponent(location.companyId)}`;
  if (href && /^https?:\/\//i.test(href)) addLink(wrapper, href, location.type === "training" ? "Voir la formation ↗" : "Fiche officielle ↗");
  return wrapper;
}

function renderMap() {
  markerCluster.clearLayers();
  const points = mapLocations();
  for (const location of points) {
    const color = location.type === "headquarters" ? "#4467a9" : location.type === "site" ? "#16745c" : "#8052a0";
    const marker = L.circleMarker(location.coordinates, {
      radius: location.type === "training" ? 6 : location.type === "site" ? 5 : 7,
      color: "#fff",
      weight: 1.5,
      fillColor: color,
      fillOpacity: 0.94,
    }).bindPopup(popupContent(location));
    markerCluster.addLayer(marker);
  }
  const geographicState = [
    mode,
    zoneModeSelect.value,
    regionSelect.value,
    departmentSelect.value,
    originInput.value,
    radiusSelect.value,
    sectorSelection,
  ].join("|");
  if (lastGeographicState !== geographicState) {
    lastGeographicState = geographicState;
    fitCurrentResults();
  }
}

function fitCurrentResults() {
  const hasLocationFilter = zoneModeSelect.value === "radius"
    ? Boolean(activeOrigin())
    : Boolean(regionSelect.value || departmentSelect.value);
  if (!hasLocationFilter) {
    map.fitBounds(FRANCE_BOUNDS);
    return;
  }
  const bounds = markerCluster.getBounds();
  if (bounds.isValid()) {
    map.fitBounds(bounds, {
      padding: [24, 24],
      maxZoom: zoneModeSelect.value === "radius" ? 13 : 10,
    });
  }
}

function render() {
  filteredResults = mode === "companies" ? filteredCompanies() : filteredTraining();
  renderList();
  renderMap();
  updateSavedCount();
}

function toggleSaved(siren) {
  if (savedCompanies.has(siren)) savedCompanies.delete(siren);
  else savedCompanies.add(siren);
  persistSavedCompanies();
  renderList();
  updateSavedCount();
  statusElement.textContent = savedCompanies.has(siren)
    ? "Entreprise ajoutée à votre liste."
    : "Entreprise retirée de votre liste.";
}

function updateSavedCount() {
  savedCountElement.textContent = savedCompanies.size.toLocaleString("fr-FR");
  document.querySelector("#export-saved").disabled = savedCompanies.size === 0;
  document.querySelector("#share-saved").disabled = savedCompanies.size === 0;
}

function exportSaved() {
  const headers = ["Entreprise", "SIREN", "Activités", "Adresse siège", "Sites industriels", "Fiche officielle", "Source", "Date de l’instantané"];
  const rows = [...savedCompanies].map((siren) => {
    const record = companyRecords.find((item) => item.id === siren);
    if (!record) return null;
    const company = record.company;
    const plants = record.locations.filter((location) => location.type === "site");
    return [
      company.nom_complet,
      siren,
      (company.activityCodes || []).map((code) => `${code} ${ACTIVITY_LABELS[code] || ""}`).join(" | "),
      [company.siege?.code_postal, company.siege?.libelle_commune].filter(Boolean).join(" "),
      plants.map((location) => [location.address, location.city].filter(Boolean).join(" ")).join(" | "),
      `https://annuaire-entreprises.data.gouv.fr/entreprise/${siren}`,
      "INSEE Sirene · Annuaire des Entreprises",
      formatDate(DATA.generatedAt),
    ];
  }).filter(Boolean);
  const csv = [headers, ...rows]
    .map((row) => row.map((value) => `"${String(value ?? "").replaceAll('"', '""')}"`).join(";"))
    .join("\r\n");
  downloadFile("ma-liste-entreprises-pharma.csv", `\uFEFF${csv}`, "text/csv;charset=utf-8");
}

function downloadFile(filename, contents, type) {
  const blob = new Blob([contents], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function shareSaved() {
  const selected = [...savedCompanies]
    .map((siren) => {
      const company = companyRecords.find((record) => record.id === siren)?.company;
      return company
        ? `${company.nom_complet} — https://annuaire-entreprises.data.gouv.fr/entreprise/${siren}`
        : "";
    })
    .filter(Boolean);
  const shareText = `Ma sélection d’entreprises pharmaceutiques (${selected.length}) :\n${selected.join("\n")}`;
  if (navigator.share) {
    try {
      await navigator.share({ title: "Ma sélection Pharma France", text: shareText });
      return;
    } catch (error) {
      if (error.name === "AbortError") return;
      console.error("Le partage natif a échoué.", error);
    }
  }
  try {
    await navigator.clipboard.writeText(shareText);
    statusElement.textContent = "La sélection a été copiée dans le presse-papiers.";
  } catch (error) {
    console.error("Impossible de copier la sélection.", error);
    statusElement.textContent = "Le partage n’est pas disponible dans ce navigateur. Exportez la liste au format CSV.";
  }
}

function updateZoneMode() {
  const radiusMode = zoneModeSelect.value === "radius";
  document.querySelector("#student-region-fields").hidden = radiusMode;
  document.querySelector("#student-radius-fields").hidden = !radiusMode;
  originInput.setAttribute("aria-label", "Rechercher un site industriel, un siège ou un campus de départ");
  render();
}

function updateDataDate() {
  const companyDate = formatDate(DATA.generatedAt);
  const trainingDate = formatDate(DATA.trainingGeneratedAt);
  const latestTrainingDate = trainingRecords.reduce((latest, record) => {
    const current = text(record.date_collecte);
    return current > latest ? current : latest;
  }, "");
  document.querySelector("#student-data-date").textContent =
    `Entreprises et sites : instantané du ${companyDate}. Formations : ${trainingRecords.length.toLocaleString("fr-FR")} enregistrements ; date la plus récente indiquée dans le catalogue : ${formatDate(latestTrainingDate || trainingDate)}. Consultez Sources & données pour le détail des producteurs et limites.`;
}

async function initialize() {
  try {
    if (!DATA) throw new Error("Le jeu de données statique des entreprises est introuvable.");
    initializeMap();
    initializeCompanyRecords();
    const response = await fetch("data/formations-pharma-fr.csv");
    if (!response.ok) throw new Error(`Impossible de charger le catalogue de formations (HTTP ${response.status}).`);
    trainingRecords = parseCsv(await response.text());
    populateGeography();
    setMode(window.location.hash === "#formations" ? "training" : "companies");
    updateDataDate();
  } catch (error) {
    console.error("Échec du chargement des données de l’espace étudiant.", error);
    resultsList.replaceChildren(element("p", "student-list-message", `Les données n’ont pas pu être chargées : ${error.message}`));
    mapError.textContent = error.message;
    mapError.hidden = false;
  }
}

companyModeButton.addEventListener("click", () => setMode("companies"));
trainingModeButton.addEventListener("click", () => setMode("training"));
for (const link of modeLinks) {
  link.addEventListener("click", () => {
    setMode(link.dataset.studentModeLink);
    document.querySelector(".nav-menu-current")?.removeAttribute("open");
  });
}
connectSearchableCombobox("job");
connectSearchableCombobox("sector");
regionSelect.addEventListener("change", () => {
  refreshDepartmentOptions();
  visibleLimit = PAGE_SIZE;
  render();
});
departmentSelect.addEventListener("change", () => { visibleLimit = PAGE_SIZE; render(); });
zoneModeSelect.addEventListener("change", updateZoneMode);
originInput.addEventListener("input", () => { visibleLimit = PAGE_SIZE; render(); });
radiusSelect.addEventListener("change", render);
document.querySelector("#student-show-more").addEventListener("click", () => {
  visibleLimit += PAGE_SIZE;
  renderList();
});
document.querySelector("#student-map-reset").addEventListener("click", () => {
  fitCurrentResults();
});
document.querySelector("#export-saved").addEventListener("click", exportSaved);
document.querySelector("#share-saved").addEventListener("click", shareSaved);

initialize();
