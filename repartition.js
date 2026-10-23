const analysis = window.PHARMA_GEO_ANALYSIS;
const zoneLevel = document.querySelector("#zone-level");
const pharmaMetric = document.querySelector("#pharma-metric");
const rowsElement = document.querySelector("#repartition-rows");
const pharmaLeadingLabel = document.querySelector("#pharma-leading-label");
const pharmaLeading = document.querySelector("#pharma-leading");
const pharmaLeadingCount = document.querySelector("#pharma-leading-count");
const trainingLeading = document.querySelector("#training-leading");
const trainingLeadingCount = document.querySelector("#training-leading-count");
const sharedZones = document.querySelector("#shared-zones");
const sharedZonesDescription = document.querySelector("#shared-zones-description");
const pharmaLegend = document.querySelector("#pharma-legend");
const pharmaColumnHeading = document.querySelector("#pharma-column-heading");
const sourceNote = document.querySelector("#repartition-source-note");
const chartNote = document.querySelector("#repartition-chart-note");

const METRIC_LABELS = {
  sites: {
    label: "Sites industriels",
    singular: "site industriel",
    total: "sites géolocalisés",
  },
  entreprises: {
    label: "Sièges d’entreprise",
    singular: "siège géolocalisé",
    total: "sièges géolocalisés",
  },
};

function formatCount(value) {
  return value.toLocaleString("fr-FR");
}

function formatShare(value, total) {
  return total ? `${((value / total) * 100).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %` : "0 %";
}

function formatSnapshotDate(value) {
  return value
    ? new Date(value).toLocaleDateString("fr-FR", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : "date inconnue";
}

function compareRows(left, right, metric) {
  return (
    Math.max(
      left.formations / analysis.totals.formations.located,
      left[metric] / analysis.totals[metric].located,
    ) -
      Math.max(
        right.formations / analysis.totals.formations.located,
        right[metric] / analysis.totals[metric].located,
      ) ||
    left.name.localeCompare(right.name, "fr")
  );
}

function createBarCell(count, total, maxShare, type) {
  const cell = document.createElement("td");
  const value = document.createElement("div");
  value.className = "repartition-value";

  const track = document.createElement("span");
  track.className = "repartition-bar-track";
  track.setAttribute("aria-hidden", "true");

  const bar = document.createElement("span");
  bar.className = `repartition-bar ${type}`;
  bar.style.width = `${total && maxShare ? (count / total / maxShare) * 100 : 0}%`;
  track.append(bar);

  const label = document.createElement("span");
  label.className = "repartition-value-label";
  label.textContent = `${formatCount(count)} · ${formatShare(count, total)}`;
  value.append(track, label);
  cell.append(value);
  return cell;
}

function getTop(rows, field) {
  return [...rows].sort(
    (left, right) =>
      right[field] - left[field] || left.name.localeCompare(right.name, "fr"),
  );
}

function updateHighlights(rows, metric) {
  const labels = METRIC_LABELS[metric];
  const pharmaTop = getTop(rows, metric);
  const trainingTop = getTop(rows, "formations");
  const topPharmaZones = new Set(pharmaTop.slice(0, 3).map((zone) => zone.name));
  const common = trainingTop
    .slice(0, 3)
    .filter((zone) => topPharmaZones.has(zone.name));

  pharmaLeadingLabel.textContent = `${labels.label} · pôle principal`;
  pharmaLeading.textContent = pharmaTop[0]?.name || "Aucune donnée";
  pharmaLeadingCount.textContent =
    `${formatCount(pharmaTop[0]?.[metric] || 0)} ${labels.singular}${pharmaTop[0]?.[metric] > 1 ? "s" : ""}`;
  trainingLeading.textContent = trainingTop[0]?.name || "Aucune donnée";
  trainingLeadingCount.textContent =
    `${formatCount(trainingTop[0]?.formations || 0)} fiche${trainingTop[0]?.formations > 1 ? "s" : ""} de formation`;

  sharedZones.textContent =
    common.length === 3 ? "3 zones communes" : `${common.length} zone${common.length > 1 ? "s" : ""} commune${common.length > 1 ? "s" : ""}`;
  sharedZonesDescription.textContent =
    common.length > 0
      ? common.map((zone) => zone.name).join(" · ")
      : "Les deux top 3 sont distincts";
}

function updateRows(rows, metric) {
  const pharmaTotal = analysis.totals[metric].located;
  const trainingTotal = analysis.totals.formations.located;
  const maxShare = Math.max(
    ...rows.flatMap((zone) => [
      trainingTotal ? zone.formations / trainingTotal : 0,
      pharmaTotal ? zone[metric] / pharmaTotal : 0,
    ]),
    0,
  );
  const sortedRows = [...rows].sort((left, right) =>
    compareRows(right, left, metric),
  );
  const visibleRows =
    zoneLevel.value === "departments"
      ? sortedRows.filter((zone) => zone.formations || zone[metric]).slice(0, 15)
      : sortedRows;
  const fragment = document.createDocumentFragment();

  for (const zone of visibleRows) {
    const row = document.createElement("tr");
    const name = document.createElement("td");
    name.className = "repartition-zone-name";
    name.textContent = zone.name;
    if (zone.code) {
      const code = document.createElement("span");
      code.className = "repartition-zone-code";
      code.textContent = `Département ${zone.code}`;
      name.append(code);
    }
    row.append(name, createBarCell(zone.formations, trainingTotal, maxShare, "training"));
    row.append(createBarCell(zone[metric], pharmaTotal, maxShare, "pharma"));
    fragment.append(row);
  }
  rowsElement.replaceChildren(fragment);
}

function render() {
  if (
    !analysis ||
    !Array.isArray(analysis.regions) ||
    !Array.isArray(analysis.departments) ||
    !analysis.totals
  ) {
    throw new Error("Les données statiques de répartition sont introuvables.");
  }

  const metric = pharmaMetric.value;
  const labels = METRIC_LABELS[metric];
  const rows =
    zoneLevel.value === "departments"
      ? analysis.departments
      : analysis.regions;

  pharmaLegend.textContent = labels.label;
  pharmaColumnHeading.textContent = labels.label;
  chartNote.textContent =
    zoneLevel.value === "departments"
      ? "Barres comparables en part du total national ; les 15 départements les plus concentrés sont affichés."
      : "Barres comparables en part du total national de chaque catégorie ; les zones sont classées selon leur plus forte part.";
  updateHighlights(rows, metric);
  updateRows(rows, metric);
  sourceNote.textContent =
    `${formatCount(analysis.totals.formations.located)} formations, ` +
    `${formatCount(analysis.totals[metric].located)} ${labels.total} ` +
    `sur ${formatCount(analysis.totals[metric].records)} enregistrements ` +
    `au total. Instantané pharma du ${formatSnapshotDate(analysis.generatedAt)} ; ` +
    `Parcoursup du ${formatSnapshotDate(analysis.trainingGeneratedAt)}.`;
}

zoneLevel.addEventListener("change", render);
pharmaMetric.addEventListener("change", render);

try {
  render();
} catch (error) {
  console.error("Échec de l’affichage de la répartition géographique.", error);
  sourceNote.textContent = error.message;
}
