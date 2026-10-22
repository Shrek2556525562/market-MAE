const ANALYSIS_URL = "data/pharmaceutical_data_sources_analysis.json";

const sourceGrid = document.querySelector("#source-grid");
const searchInput = document.querySelector("#source-search");
const typeFilter = document.querySelector("#type-filter");
const snapshotColumns = document.querySelector("#snapshot-columns");
const coordinateStats = document.querySelector("#coordinate-stats");

const numberFormatter = new Intl.NumberFormat("fr-FR", {
  maximumFractionDigits: 2,
});
const percentFormatter = new Intl.NumberFormat("fr-FR", {
  maximumFractionDigits: 1,
});

function formatNumber(value, digits = 2) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) {
    return "—";
  }
  return new Intl.NumberFormat("fr-FR", {
    maximumFractionDigits: digits,
  }).format(Number(value));
}

function formatPercent(value) {
  return `${percentFormatter.format(Number(value) || 0)} %`;
}

function formatScore(value) {
  return `${numberFormatter.format(Number(value))} %`;
}

function appendText(parent, tagName, className, text) {
  const element = document.createElement(tagName);
  if (className) element.className = className;
  element.textContent = text;
  parent.append(element);
  return element;
}

function makeLink(label, url) {
  const link = document.createElement("a");
  link.href = url;
  link.target = "_blank";
  link.rel = "noreferrer";
  link.textContent = label;
  return link;
}

function createSnapshotRow(group, profile) {
  const row = document.createElement("tr");
  appendText(row, "td", "", group);
  appendText(row, "td", "mono", profile.column);
  appendText(row, "td", "", profile.type);
  appendText(
    row,
    "td",
    "",
    `${formatNumber(profile.missing, 0)} / ${formatNumber(profile.n, 0)} (${formatPercent(profile.missing_pct)})`,
  );
  appendText(row, "td", "", formatNumber(profile.unique, 0));
  return row;
}

function renderSnapshot(analysis) {
  const snapshot = analysis.snapshot;
  const summary = analysis.catalog.qualityScores;
  document.querySelector("#source-count").textContent = formatNumber(
    analysis.scope.sourceCount,
    0,
  );
  document.querySelector("#primary-count").textContent = formatNumber(
    analysis.scope.primarySourcesPresent,
    0,
  );
  document.querySelector("#company-count").textContent = formatNumber(
    snapshot.companyCount,
    0,
  );
  document.querySelector("#site-count").textContent = formatNumber(
    snapshot.siteCount,
    0,
  );
  document.querySelector("#source-total").textContent =
    `${analysis.scope.sourceCount} sources`;

  const generatedDate = new Date(snapshot.generatedAt);
  document.querySelector("#snapshot-intro").textContent =
    `Instantané secondaire de l'API Recherche d'entreprises, généré le ${generatedDate.toLocaleDateString("fr-FR")}. ` +
    `${formatNumber(snapshot.companyCount, 0)} entreprises et ${formatNumber(snapshot.siteCount, 0)} établissements ; ` +
    `les sites sont rattachés à ${formatNumber(snapshot.companySiteSearchCount, 0)} recherches d'entreprises.`;

  const rows = [];
  for (const profile of snapshot.metadata) {
    rows.push(createSnapshotRow("Instantané", profile));
  }
  for (const profile of snapshot.companies.columns) {
    rows.push(createSnapshotRow("Entreprise", profile));
  }
  for (const profile of snapshot.sites.columns) {
    rows.push(createSnapshotRow("Établissement", profile));
  }
  snapshotColumns.replaceChildren(...rows);

  const coordinateRows = snapshot.coordinates.map((stats) => {
    const row = document.createElement("tr");
    appendText(row, "td", "", `${stats.level} · ${stats.column}`);
    appendText(row, "td", "", formatNumber(stats.n, 0));
    appendText(row, "td", "", formatNumber(stats.mean, 3));
    appendText(row, "td", "", formatNumber(stats.variance, 3));
    appendText(row, "td", "", formatNumber(stats.std, 3));
    appendText(
      row,
      "td",
      "",
      `${formatNumber(stats.q1, 3)} – ${formatNumber(stats.q3, 3)}`,
    );
    appendText(
      row,
      "td",
      "",
      `${formatNumber(stats.min, 3)} – ${formatNumber(stats.max, 3)}`,
    );
    return row;
  });
  coordinateStats.replaceChildren(...coordinateRows);

  const scoreNote = document.querySelector("#catalog-score");
  scoreNote.textContent =
    `Dans le catalogue, les scores de qualité estimés ont une moyenne de ${formatScore(summary.mean)}, ` +
    `une médiane de ${formatScore(summary.median)}, une variance de population de ` +
    `${formatNumber(summary.variance, 2)} points² et un écart-type de ${formatNumber(summary.std, 2)} points. ` +
    "Ces notes sont des estimations éditoriales, pas des scores publiés par les producteurs.";

  document.querySelector("#updated-at").textContent =
    `Profil calculé le ${new Date(analysis.generatedAt).toLocaleDateString("fr-FR")}.`;
}

function addMetaItem(list, label, value) {
  const item = document.createElement("div");
  appendText(item, "dt", "", label);
  appendText(item, "dd", "", value);
  list.append(item);
}

function sourceMatches(source, query, category) {
  const allText = [
    source.source,
    source.description,
    source.unitOfObservation,
    source.update_frequency,
    source.limitations,
    ...source.variables.flatMap((variable) => [
      variable.name,
      variable.type,
      variable.description,
    ]),
  ]
    .join(" ")
    .toLocaleLowerCase("fr");

  return (
    (!query || allText.includes(query)) &&
    (category === "all" ||
      source.variables.some((variable) => variable.category === category))
  );
}

function createSourceCard(source) {
  const card = document.createElement("article");
  card.className = "source-card";

  const header = document.createElement("header");
  header.className = "source-card-header";
  const title = appendText(header, "h3", "", source.source);
  title.id = `source-${source.source
    .toLocaleLowerCase("fr")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")}`;
  const score = appendText(
    header,
    "span",
    "source-score",
    formatScore(source.estimated_quality_percent),
  );
  score.title = "Estimation éditoriale du catalogue, non fournie par le producteur.";
  score.setAttribute("aria-label", `Score estimé : ${formatScore(source.estimated_quality_percent)}`);
  card.append(header);

  appendText(card, "p", "source-description", source.description);

  const meta = document.createElement("dl");
  meta.className = "source-meta";
  addMetaItem(meta, "Donnée", source.dataClass);
  addMetaItem(meta, "Unité d'observation", source.unitOfObservation);
  addMetaItem(meta, "Mise à jour", source.update_frequency);
  addMetaItem(meta, "Statistiques observées", "Données brutes absentes");
  card.append(meta);

  appendText(card, "h4", "eyebrow", "Colonnes et types probables");
  const variables = document.createElement("ul");
  variables.className = "variable-list";
  for (const variable of source.variables) {
    const item = document.createElement("li");
    item.className = "variable-item";
    const heading = document.createElement("div");
    heading.className = "variable-heading";
    appendText(heading, "span", "variable-name", variable.name);
    const badge = appendText(heading, "span", "type-badge", variable.type);
    badge.dataset.category = variable.category;
    item.append(heading);
    appendText(item, "p", "variable-description", variable.description);
    variables.append(item);
  }
  card.append(variables);
  appendText(card, "p", "schema-note", source.statisticsNote);
  appendText(
    card,
    "p",
    "limitation-note",
    `Limite : ${source.limitations}`,
  );

  const links = document.createElement("div");
  links.className = "source-links";
  links.append(makeLink("Fiche de la source ↗", source.data_url));
  links.append(makeLink("Accès aux données ↗", source.download_or_query_url));
  card.append(links);
  return card;
}

function renderSources(analysis) {
  const query = searchInput.value.trim().toLocaleLowerCase("fr");
  const category = typeFilter.value;
  const sources = analysis.catalog.sources.filter((source) =>
    sourceMatches(source, query, category),
  );

  document.querySelector("#result-count").textContent =
    `${formatNumber(sources.length, 0)} source${sources.length > 1 ? "s" : ""} affichée${sources.length > 1 ? "s" : ""} sur ${formatNumber(analysis.catalog.sources.length, 0)}.`;

  if (!sources.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "Aucune source ne correspond à ces filtres.";
    sourceGrid.replaceChildren(empty);
    return;
  }
  sourceGrid.replaceChildren(...sources.map(createSourceCard));
}

function showTableError(tableBody, columnCount, errorMessage) {
  const row = document.createElement("tr");
  const cell = document.createElement("td");
  cell.colSpan = columnCount;
  cell.textContent = errorMessage;
  row.append(cell);
  tableBody.replaceChildren(row);
}

async function loadAnalysis() {
  try {
    const response = await fetch(ANALYSIS_URL);
    if (!response.ok) {
      throw new Error(`Le fichier d'analyse a répondu avec le statut ${response.status}.`);
    }
    const analysis = await response.json();
    if (
      !Array.isArray(analysis.catalog?.sources) ||
      !Array.isArray(analysis.snapshot?.coordinates)
    ) {
      throw new Error("Le fichier d'analyse ne contient pas les profils attendus.");
    }
    renderSnapshot(analysis);
    renderSources(analysis);
    searchInput.addEventListener("input", () => renderSources(analysis));
    typeFilter.addEventListener("change", () => renderSources(analysis));
  } catch (error) {
    console.error("Échec du chargement des profils de données.", error);
    const message = document.createElement("p");
    message.className = "error-state";
    message.setAttribute("role", "alert");
    message.textContent =
      `Impossible de charger l'analyse : ${error.message} ` +
      "Régénérez-la avec python scripts\\analyze_data_sources.py.";
    sourceGrid.replaceChildren(message);
    showTableError(snapshotColumns, 5, message.textContent);
    showTableError(coordinateStats, 7, message.textContent);
  }
}

loadAnalysis();
