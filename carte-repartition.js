const analysis = window.PHARMA_GEO_ANALYSIS;
const FRANCE_BOUNDS = [
  [41.2, -5.3],
  [51.3, 9.8],
];
const PALETTES = {
  formations: ["#f0ebf7", "#d9cbea", "#b99dd4", "#9571bb", "#7554a8"],
  pharma: ["#e7f3ec", "#c5e0d1", "#94c6ac", "#56a17d", "#16745c"],
};
const PHARMA_LABELS = {
  entreprises: {
    singular: "siège d’entreprise",
    plural: "sièges d’entreprise",
  },
};
const PHARMA_METRIC = "entreprises";

const levelSelect = document.querySelector("#map-zone-level");
const trainingSummary = document.querySelector("#training-map-summary");
const pharmaSummary = document.querySelector("#pharma-map-summary");
const trainingTotal = document.querySelector("#training-map-total");
const pharmaTotal = document.querySelector("#pharma-map-total");
const trainingLegend = document.querySelector("#training-map-legend");
const pharmaLegend = document.querySelector("#pharma-map-legend");
const insight = document.querySelector("#map-comparison-insight");
const errorMessage = document.querySelector("#map-comparison-error");
const layerReferences = {
  formations: new Map(),
  pharma: new Map(),
};
const geoJsonLayers = new Map();
const mapReferences = {};
let currentHighlight = null;

function countFor(properties, category, metric) {
  return category === "formations"
    ? properties.formations
    : properties[metric];
}

function formatCount(value) {
  return value.toLocaleString("fr-FR");
}

function zoneName(properties) {
  return levelSelect.value === "regions"
    ? properties.region
    : properties.name;
}

function zoneCode(properties) {
  return levelSelect.value === "regions"
    ? properties.region
    : properties.code;
}

function aggregateCounts(features, metric, level) {
  if (level === "departments") {
    return features.map((feature) => ({
      properties: feature.properties,
      key: feature.properties.code,
      name: feature.properties.name,
      formations: feature.properties.formations,
      pharma: feature.properties[metric],
    }));
  }

  const zones = new Map();
  for (const feature of features) {
    const properties = feature.properties;
    const zone = zones.get(properties.region) || {
      properties: { region: properties.region },
      key: properties.region,
      name: properties.region,
      formations: 0,
      pharma: 0,
    };
    zone.formations += properties.formations;
    zone.pharma += properties[metric];
    zones.set(properties.region, zone);
  }
  return [...zones.values()];
}

function getTopZones(features, metric, level) {
  const zones = aggregateCounts(features, metric, level);
  return {
    formations: [...zones]
      .sort((a, b) => b.formations - a.formations || a.name.localeCompare(b.name, "fr"))
      .slice(0, 3),
    pharma: [...zones]
      .sort((a, b) => b.pharma - a.pharma || a.name.localeCompare(b.name, "fr"))
      .slice(0, 3),
  };
}

function updateInsight(features, metric) {
  const level = levelSelect.value;
  const labels = PHARMA_LABELS[metric];
  const leaders = getTopZones(features, metric, level);
  const pharmaTop = leaders.pharma[0];
  const trainingTop = leaders.formations[0];
  const pharmaNames = new Set(leaders.pharma.map((zone) => zone.name));
  const shared = leaders.formations
    .filter((zone) => pharmaNames.has(zone.name))
    .map((zone) => zone.name);
  const scaleName = level === "regions" ? "régions" : "départements";
  const overlap =
    shared.length > 0
      ? `${shared.length} zone${shared.length > 1 ? "s" : ""} commune${shared.length > 1 ? "s" : ""} dans les deux top 3 : ${shared.join(", ")}.`
      : "Les deux top 3 ne partagent aucune zone.";
  insight.textContent =
    `En ${scaleName}, le premier pôle de formation est ${trainingTop?.name} ` +
    `(${formatCount(trainingTop?.formations || 0)} fiches) ; ` +
    `celui des ${labels.plural} est ${pharmaTop?.name} ` +
    `(${formatCount(pharmaTop?.pharma || 0)}). ${overlap} ` +
    "Survolez une zone pour la comparer sur les deux cartes.";
}

function createScale(values) {
  const positiveValues = values.filter((value) => value > 0).sort((a, b) => a - b);
  const thresholds = [];
  for (let index = 1; index < PALETTES.formations.length; index += 1) {
    if (positiveValues.length === 0) break;
    const position = Math.ceil((index * positiveValues.length) / PALETTES.formations.length) - 1;
    const threshold = positiveValues[position];
    if (threshold > thresholds.at(-1)) thresholds.push(threshold);
  }
  return thresholds;
}

function colorFor(value, thresholds, palette) {
  if (value === 0) return "#f0f3f1";
  let index = thresholds.findIndex((threshold) => value <= threshold);
  if (index < 0) index = palette.length - 1;
  return palette[Math.min(index, palette.length - 1)];
}

function formatRange(index, thresholds) {
  if (thresholds.length === 0) return "0";
  if (index === 0) return `1–${formatCount(thresholds[0])}`;
  if (index < thresholds.length) {
    return `${formatCount(thresholds[index - 1] + 1)}–${formatCount(thresholds[index])}`;
  }
  return `${formatCount(thresholds.at(-1) + 1)}+`;
}

function renderLegend(container, values, palette) {
  const thresholds = createScale(values);
  const classCount = Math.min(palette.length, thresholds.length + 1);
  const fragment = document.createDocumentFragment();
  const empty = document.createElement("span");
  empty.className = "map-legend-item";
  const emptySwatch = document.createElement("i");
  emptySwatch.className = "map-legend-swatch";
  emptySwatch.style.backgroundColor = "#f0f3f1";
  const emptyLabel = document.createElement("span");
  emptyLabel.textContent = "0";
  empty.append(emptySwatch, emptyLabel);
  fragment.append(empty);

  palette.slice(0, classCount).forEach((color, index) => {
    const item = document.createElement("span");
    item.className = "map-legend-item";
    const swatch = document.createElement("i");
    swatch.className = "map-legend-swatch";
    swatch.style.backgroundColor = color;
    const label = document.createElement("span");
    label.textContent = formatRange(index, thresholds);
    item.append(swatch, label);
    fragment.append(item);
  });
  container.replaceChildren(fragment);
  return thresholds;
}

function tooltipContent(properties, count, category, metric) {
  const content = document.createElement("span");
  const title = document.createElement("strong");
  title.className = "map-tooltip-title";
  title.textContent =
    levelSelect.value === "regions"
      ? properties.region
      : `${properties.name} (${properties.code})`;
  const value = document.createElement("span");
  value.className = "map-tooltip-value";
  const unit =
    category === "formations"
      ? count > 1 ? "formations" : "formation"
      : count > 1
        ? PHARMA_LABELS[metric].plural
        : PHARMA_LABELS[metric].singular;
  value.textContent = `${formatCount(count)} ${unit}`;
  content.append(title, value);
  return content;
}

function setHighlight(key) {
  currentHighlight = key;
  for (const group of Object.values(layerReferences)) {
    for (const [featureKey, layers] of group) {
      for (const layer of layers) {
        layer.setStyle(
          featureKey === key
            ? { weight: 2.7, color: "#263b32", fillOpacity: 0.98 }
            : { weight: levelSelect.value === "regions" ? 0.7 : 0.9, color: "#fff", fillOpacity: 0.86 },
        );
      }
    }
  }
}

function styleFeature(value, category, scales) {
  const palette = PALETTES[category === "formations" ? "formations" : "pharma"];
  return {
    color: "#fff",
    weight: levelSelect.value === "regions" ? 0.55 : 0.9,
    opacity: 1,
    fillColor: colorFor(value, scales[category], palette),
    fillOpacity: 0.86,
  };
}

function makeMap(container, category) {
  const map = L.map(container, {
    zoomControl: true,
    scrollWheelZoom: true,
    minZoom: 4,
    maxZoom: 11,
  });
  map.fitBounds(FRANCE_BOUNDS, { animate: false });
  mapReferences[category] = map;
  return map;
}

function linkMapZoom() {
  let synchronizing = false;
  const synchronize = (source, target) => {
    if (synchronizing) return;
    const center = source.getCenter();
    if (
      Math.abs(target.getZoom() - source.getZoom()) < 0.001 &&
      target.getCenter().distanceTo(center) < 1
    ) return;

    synchronizing = true;
    target.setView(center, source.getZoom(), { animate: false });
    synchronizing = false;
  };
  mapReferences.formations.on("moveend", () =>
    synchronize(mapReferences.formations, mapReferences.pharma),
  );
  mapReferences.pharma.on("moveend", () =>
    synchronize(mapReferences.pharma, mapReferences.formations),
  );
}

function renderMaps() {
  const features = analysis.mapDepartments.features;
  const metric = PHARMA_METRIC;
  const labels = PHARMA_LABELS[metric];
  const level = levelSelect.value;
  const totals = {
    formations: analysis.totals.formations.located,
    pharma: analysis.totals[metric].located,
  };
  const categories = ["formations", "pharma"];
  const zones = aggregateCounts(features, metric, level);
  const zonesByKey = new Map(zones.map((zone) => [zone.key, zone]));
  const scales = {
    formations: createScale(zones.map((zone) => zone.formations)),
    pharma: createScale(zones.map((zone) => zone.pharma)),
  };

  trainingSummary.textContent =
    `${level === "regions" ? "Répartition régionale" : "Par département"} · Parcoursup`;
  pharmaSummary.textContent =
    `${level === "regions" ? "Répartition régionale" : "Par département"} · sièges sociaux géolocalisés`;
  trainingTotal.textContent = formatCount(totals.formations);
  pharmaTotal.textContent = formatCount(totals.pharma);
  renderLegend(
    trainingLegend,
    zones.map((zone) => zone.formations),
    PALETTES.formations,
  );
  renderLegend(
    pharmaLegend,
    zones.map((zone) => zone.pharma),
    PALETTES.pharma,
  );

  for (const category of categories) {
    const map = mapReferences[category];
    const isTraining = category === "formations";
    const previousLayer = geoJsonLayers.get(category);
    if (previousLayer) map.removeLayer(previousLayer);
    layerReferences[category].clear();

    const geoJson = L.geoJSON(analysis.mapDepartments, {
      style: (feature) => {
        const key = zoneCode(feature.properties);
        const zone = zonesByKey.get(key);
        return styleFeature(
          isTraining ? zone.formations : zone.pharma,
          category,
          scales,
        );
      },
      onEachFeature: (feature, layer) => {
        const properties = feature.properties;
        const key = zoneCode(properties);
        const zone = zonesByKey.get(key);
        const count = isTraining ? zone.formations : zone.pharma;
        const zoneLayers = layerReferences[category].get(key) || [];
        zoneLayers.push(layer);
        layerReferences[category].set(key, zoneLayers);
        layer.bindTooltip(tooltipContent(properties, count, category, metric), {
          sticky: true,
          direction: "top",
        });
        layer.on({
          mouseover: () => setHighlight(key),
          mouseout: () => {
            if (currentHighlight === key) setHighlight(null);
          },
          click: () => {
            const zoneLayers = layerReferences.formations.get(key);
            const bounds = L.latLngBounds();
            for (const zoneLayer of zoneLayers) {
              bounds.extend(zoneLayer.getBounds());
            }
            for (const linkedMap of Object.values(mapReferences)) {
              linkedMap.fitBounds(bounds, {
                maxZoom: 8,
                padding: [16, 16],
              });
            }
            insight.textContent =
              `${zoneName(properties)} : ${formatCount(zone.formations)} formations, ` +
              `${formatCount(zone.pharma)} ${labels.plural}.`;
          },
        });
      },
    });
    geoJson.addTo(map);
    geoJsonLayers.set(category, geoJson);
  }

  if (currentHighlight !== null) setHighlight(currentHighlight);
  updateInsight(features, metric);
}

function initialize() {
  if (
    !analysis ||
    !analysis.mapDepartments ||
    !Array.isArray(analysis.mapDepartments.features) ||
    typeof L === "undefined"
  ) {
    throw new Error("Les données cartographiques locales sont introuvables.");
  }

  makeMap(document.querySelector("#training-map"), "formations");
  makeMap(document.querySelector("#pharma-map"), "pharma");
  linkMapZoom();
  renderMaps();

  levelSelect.addEventListener("change", () => {
    currentHighlight = null;
    for (const layers of Object.values(layerReferences)) layers.clear();
    renderMaps();
  });
}

try {
  initialize();
} catch (error) {
  console.error("Échec de l’affichage des cartes comparatives.", error);
  errorMessage.textContent = error.message;
  errorMessage.hidden = false;
}
