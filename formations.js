const DATA_URL = "data/formations-pharma-fr.csv";
const FRANCE_BOUNDS = [
  [41.25, -5.2],
  [51.2, 9.7],
];
const SOURCE_COLORS = {
  Parcoursup: "#16745c",
  "La bonne alternance": "#c46e35",
};
const REGION_ALIASES = new Map([
  ["centre", "Centre-Val de Loire"],
  ["grandest", "Grand Est"],
  ["iledefrance", "Île-de-France"],
  ["nouvelleaquitaine", "Nouvelle-Aquitaine"],
  ["paysdelaloire", "Pays de la Loire"],
  ["reunion", "La Réunion"],
]);

const mapError = document.querySelector("#map-error");
const totalCount = document.querySelector("#total-count");
const mappedCount = document.querySelector("#mapped-count");
const resultCount = document.querySelector("#result-count");
const coordinateNote = document.querySelector("#coordinate-note");
const searchInput = document.querySelector("#training-search");
const categoryFilter = document.querySelector("#category-filter");
const sourceFilter = document.querySelector("#source-filter");
const regionFilter = document.querySelector("#region-filter");
const relevanceFilter = document.querySelector("#relevance-filter");
const markers = [];
let map;

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
  if (!headers?.length) throw new Error("Le fichier CSV est vide.");
  return rows.map((cells) =>
    Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ""])),
  );
}

function validCoordinates(offer) {
  const latitudeText = offer.latitude.trim();
  const longitudeText = offer.longitude.trim();
  if (!latitudeText || !longitudeText) return null;
  const latitude = Number(latitudeText.replace(",", "."));
  const longitude = Number(longitudeText.replace(",", "."));
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

function normalizeRegion(region) {
  if (!region) return "";
  const key = region
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("fr")
    .replace(/[^a-z0-9]/g, "");
  return REGION_ALIASES.get(key) ?? region.trim();
}

function addText(parent, tag, text, className) {
  const element = document.createElement(tag);
  element.textContent = text;
  if (className) element.className = className;
  parent.append(element);
  return element;
}

function createPopup(offer) {
  const card = document.createElement("div");
  card.className = "training-popup";
  addText(card, "h3", offer.formation || "Formation");
  if (offer.etablissement) addText(card, "p", offer.etablissement);

  const location = [offer.ville, offer.departement, offer.region]
    .filter(Boolean)
    .join(" · ");
  if (location) addText(card, "p", location);
  if (offer.adresse) addText(card, "p", offer.adresse);

  addText(
    card,
    "p",
    [offer.categorie, offer.pertinence_pharma].filter(Boolean).join(" · "),
    "popup-tag",
  );
  addText(
    card,
    "p",
    [offer.modalite_formation, offer.type_offre].filter(Boolean).join(" · "),
  );

  if (offer.url_formation) {
    const link = document.createElement("a");
    link.href = offer.url_formation;
    link.target = "_blank";
    link.rel = "noreferrer";
    link.textContent = "Voir la fiche de formation ↗";
    card.append(link);
  }
  return card;
}

function makeMarker(offer, coordinates) {
  const isAlternance = offer.type_offre === "La bonne alternance";
  const marker = isAlternance
    ? L.marker(coordinates, {
        icon: L.divIcon({
          className: "",
          html: '<span class="training-marker alternance" aria-hidden="true"></span>',
          iconSize: [15, 15],
          iconAnchor: [7.5, 7.5],
        }),
      })
    : L.circleMarker(coordinates, {
        radius: 5,
        color: "#fff",
        weight: 1.5,
        fillColor: SOURCE_COLORS.Parcoursup,
        fillOpacity: 0.88,
      });
  marker.bindPopup(createPopup(offer), { minWidth: 225 });
  marker.offer = offer;
  marker.addTo(map);
  markers.push(marker);
}

function filteredOffers() {
  const query = searchInput.value.trim().toLocaleLowerCase("fr");
  return markers.filter(({ offer }) => {
    if (categoryFilter.value && offer.categorie !== categoryFilter.value) return false;
    if (sourceFilter.value && offer.type_offre !== sourceFilter.value) return false;
    if (regionFilter.value && normalizeRegion(offer.region) !== regionFilter.value) return false;
    if (relevanceFilter.value && offer.pertinence_pharma !== relevanceFilter.value) return false;
    if (!query) return true;
    return [
      offer.formation,
      offer.etablissement,
      offer.ville,
      offer.departement,
      offer.region,
      offer.categorie,
    ]
      .join(" ")
      .toLocaleLowerCase("fr")
      .includes(query);
  });
}

function updateMap() {
  const visible = new Set(filteredOffers());
  for (const marker of markers) {
    if (visible.has(marker)) {
      if (!map.hasLayer(marker)) marker.addTo(map);
    } else if (map.hasLayer(marker)) {
      map.removeLayer(marker);
    }
  }
  const count = visible.size;
  resultCount.textContent = `${count.toLocaleString("fr-FR")} ${
    count > 1 ? "formations affichées" : "formation affichée"
  }`;
  mappedCount.textContent = count.toLocaleString("fr-FR");
}

async function loadTrainingData() {
  const response = await fetch(DATA_URL);
  if (!response.ok) {
    throw new Error(`Le fichier des formations a répondu avec le statut ${response.status}.`);
  }
  const offers = parseCsv(await response.text());
  totalCount.textContent = offers.length.toLocaleString("fr-FR");

  const categories = [...new Set(offers.map((offer) => offer.categorie).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right, "fr"));
  for (const category of categories) {
    const option = document.createElement("option");
    option.value = category;
    option.textContent = category;
    categoryFilter.append(option);
  }
  const regions = [...new Set(offers.map((offer) => normalizeRegion(offer.region)).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right, "fr"));
  for (const region of regions) {
    const option = document.createElement("option");
    option.value = region;
    option.textContent = region;
    regionFilter.append(option);
  }

  let missingCoordinates = 0;
  for (const offer of offers) {
    const coordinates = validCoordinates(offer);
    if (!coordinates) {
      missingCoordinates += 1;
      continue;
    }
    makeMarker(offer, coordinates);
  }
  coordinateNote.textContent = missingCoordinates
    ? `${missingCoordinates.toLocaleString("fr-FR")} formation(s) sans coordonnées fiables restent dans le CSV mais ne figurent pas sur la carte.`
    : "Toutes les formations du fichier disposent de coordonnées.";
  map.fitBounds(FRANCE_BOUNDS);
  updateMap();
  resultCount.title = `${missingCoordinates} formation(s) sans coordonnées fiables ne sont pas représentées.`;
}

if (typeof L === "undefined") {
  mapError.textContent =
    "La bibliothèque cartographique n’a pas pu être chargée. Vérifiez votre connexion Internet et rechargez la page.";
  mapError.hidden = false;
} else {
  map = L.map("training-map", {
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
      maxZoom: 18,
      minZoom: 5,
      tileSize: 256,
    },
  ).addTo(map);

  searchInput.addEventListener("input", updateMap);
  categoryFilter.addEventListener("change", updateMap);
  sourceFilter.addEventListener("change", updateMap);
  regionFilter.addEventListener("change", () => {
    updateMap();
    if (regionFilter.value) {
      const regionMarkers = filteredOffers();
      if (regionMarkers.length) {
        map.fitBounds(
          L.latLngBounds(regionMarkers.map((marker) => marker.getLatLng())),
          { padding: [24, 24], maxZoom: 8 },
        );
      }
    } else {
      map.fitBounds(FRANCE_BOUNDS);
    }
  });
  relevanceFilter.addEventListener("change", updateMap);
  document.querySelector("#zoom-france").addEventListener("click", () => {
    map.fitBounds(FRANCE_BOUNDS);
  });

  loadTrainingData().catch((error) => {
    console.error("Échec du chargement des données de formations.", error);
    mapError.textContent = `Impossible de charger les formations : ${error.message}`;
    mapError.hidden = false;
    resultCount.textContent = "Données indisponibles";
  });
}
