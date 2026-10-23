const DATA_ELEMENT_ID = "viviers-data";
const RADIUS_KM = 50;
const FRANCE_BOUNDS = [
  [41.25, -5.2],
  [51.2, 9.7],
];

const LEVELS = [
  { id: "Bac+2", label: "Bac+2", detail: "BTS", css: "level-bac2", color: "#df8a49" },
  { id: "Bac+3", label: "Bac+3", detail: "BUT, licence, licence pro, bachelor", css: "level-bac3", color: "#16745c" },
  { id: "Bac+5", label: "Bac+5", detail: "Écoles d’ingénieurs post-bac", css: "level-bac5", color: "#3c64b1" },
];
const UNIVERSITY_COLOR = "#7a4fa3";
const SITE_COLOR = "#182a25";

const mapError = document.querySelector("#map-error");
const placesTotal = document.querySelector("#places-total");
const placesCaption = document.querySelector("#places-caption");
const mapResultCount = document.querySelector("#map-result-count");
const isolatedCount = document.querySelector("#isolated-count");
const findingText = document.querySelector("#finding-text");
const isolatedList = document.querySelector("#isolated-list");
const showUniversities = document.querySelector("#show-universities");
const showSites = document.querySelector("#show-sites");

const fmt = (n) => Math.round(n).toLocaleString("fr-FR");

function haversineKm(lat1, lon1, lat2, lon2) {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(a));
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function buildFilter(container, value, title, detail, swatchClass, count) {
  const label = el("label", "filter-option");
  const input = el("input");
  input.type = "checkbox";
  input.value = value;
  input.checked = true;
  label.append(input);
  const swatch = el("span", `filter-swatch ${swatchClass}`);
  swatch.setAttribute("aria-hidden", "true");
  label.append(swatch);
  const copy = el("span", "filter-copy");
  copy.append(el("strong", "", title));
  if (detail) copy.append(el("small", "", detail));
  label.append(copy);
  const badge = el("span", "filter-count", count);
  label.append(badge);
  container.append(label);
  return { input, badge };
}

function initializeMap() {
  const map = L.map("map", {
    zoomControl: false,
    minZoom: 5,
    maxZoom: 16,
    preferCanvas: true,
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
  L.control.zoom({ position: "bottomright" }).addTo(map);

  const universityLayer = L.layerGroup().addTo(map);
  const formationLayer = L.layerGroup().addTo(map);
  const siteLayer = L.layerGroup().addTo(map);
  const radiusLayer = L.layerGroup().addTo(map);

  let formations = [];
  let universities = [];
  let sites = [];
  const levelInputs = [];
  const domainInputs = [];

  const activeLevels = () =>
    new Set(levelInputs.filter((f) => f.input.checked).map((f) => f.input.value));
  const activeDomains = () =>
    new Set(domainInputs.filter((f) => f.input.checked).map((f) => f.input.value));

  function visibleFormations() {
    const levels = activeLevels();
    const domains = activeDomains();
    return formations.filter((f) => levels.has(f.niveau) && domains.has(f.domaine));
  }

  function siteVivier(site, list) {
    const byLevel = Object.fromEntries(LEVELS.map((l) => [l.id, 0]));
    let nearest = null;
    for (const f of list) {
      const d = site.distances.get(f);
      if (d <= RADIUS_KM) byLevel[f.niveau] += f.capacite;
      if (!nearest || d < nearest.distance) nearest = { formation: f, distance: d };
    }
    let pharmacie = 0;
    for (const u of universities) {
      if (u.lat == null) continue;
      if (haversineKm(site.lat, site.lon, u.lat, u.lon) <= RADIUS_KM) pharmacie += u.pharmacie;
    }
    const total = Object.values(byLevel).reduce((a, b) => a + b, 0);
    return { byLevel, total, nearest, pharmacie };
  }

  function formationPopup(f) {
    const card = el("div", "popup-card");
    card.append(el("h3", "", f.intitule));
    card.append(el("p", "", `${f.etablissement} · ${f.ville}`));
    card.append(el("p", "popup-code", `${f.niveau} · ${f.domaine} · ${f.statut}`));
    const ratio = f.capacite ? (f.voeux / f.capacite).toFixed(1).replace(".", ",") : "—";
    card.append(
      el("p", "", `${fmt(f.capacite)} places en 1re année · ${fmt(f.voeux)} vœux (${ratio} par place)`),
    );
    return card;
  }

  function universityPopup(u) {
    const card = el("div", "popup-card");
    card.append(el("h3", "", u.etablissement));
    card.append(el("p", "", [u.ville, u.dep_lib].filter(Boolean).join(" · ")));
    card.append(el("p", "popup-code", "Inscrits 2024-25, tous niveaux (L, M, D)"));
    const rows = [
      ["Pharmacie", u.pharmacie],
      ["Chimie", u.chimie],
      ["Sciences de la vie", u.sciences_vie],
    ].filter(([, n]) => n > 0);
    for (const [label, n] of rows) card.append(el("p", "", `${label} : ${fmt(n)}`));
    return card;
  }

  function sitePopup(site) {
    const v = siteVivier(site, visibleFormations());
    const card = el("div", "popup-card");
    card.append(el("h3", "", site.nom));
    card.append(el("p", "", site.commune || ""));
    card.append(el("p", "popup-code", `Vivier à moins de ${RADIUS_KM} km, filtres actifs`));
    for (const level of LEVELS) {
      if (!activeLevels().has(level.id)) continue;
      card.append(el("p", "", `${level.label} : ${fmt(v.byLevel[level.id])} places en 1re année`));
    }
    card.append(el("p", "", `Étudiants en pharmacie : ${fmt(v.pharmacie)}`));
    if (v.nearest) {
      card.append(
        el(
          "p",
          "popup-code",
          `Formation la plus proche : ${v.nearest.formation.intitule.replace(/^[^-]+- /, "")}, ${v.nearest.formation.ville} (${fmt(v.nearest.distance)} km)`,
        ),
      );
    }
    const link = el("a", "", "Voir la fiche établissement ↗");
    link.href = `https://annuaire-entreprises.data.gouv.fr/etablissement/${encodeURIComponent(site.siret)}`;
    link.target = "_blank";
    link.rel = "noreferrer";
    card.append(link);
    return card;
  }

  function radiusFor(n, scale, min) {
    return Math.max(min, Math.sqrt(n) * scale);
  }

  function drawUniversities() {
    universityLayer.clearLayers();
    if (!showUniversities.checked) return;
    for (const u of universities) {
      if (u.lat == null) continue;
      const total = u.chimie + u.sciences_vie + u.pharmacie;
      L.circleMarker([u.lat, u.lon], {
        radius: radiusFor(total, 0.17, 5),
        color: UNIVERSITY_COLOR,
        weight: 2,
        fillColor: UNIVERSITY_COLOR,
        fillOpacity: 0.06,
      })
        .bindPopup(() => universityPopup(u), { minWidth: 230 })
        .addTo(universityLayer);
    }
  }

  function drawSites() {
    siteLayer.clearLayers();
    if (!showSites.checked) return;
    for (const site of sites) {
      site.marker = L.marker([site.lat, site.lon], {
        icon: L.divIcon({ className: "", html: '<span class="vivier-site"></span>', iconSize: [8, 8] }),
        keyboard: false,
      })
        .bindPopup(() => sitePopup(site), { minWidth: 250 })
        .on("popupopen", () => {
          radiusLayer.clearLayers();
          L.circle([site.lat, site.lon], {
            radius: RADIUS_KM * 1000,
            color: SITE_COLOR,
            weight: 1,
            dashArray: "4 4",
            fill: false,
            interactive: false,
          }).addTo(radiusLayer);
        })
        .on("popupclose", () => radiusLayer.clearLayers())
        .addTo(siteLayer);
    }
  }

  function drawFormations(list) {
    formationLayer.clearLayers();
    const sorted = [...list].sort((a, b) => b.capacite - a.capacite);
    for (const f of sorted) {
      const level = LEVELS.find((l) => l.id === f.niveau);
      L.circleMarker([f.lat, f.lon], {
        radius: radiusFor(f.capacite, 0.55, 3),
        color: "white",
        weight: 1,
        fillColor: level.color,
        fillOpacity: 0.78,
      })
        .bindPopup(() => formationPopup(f), { minWidth: 230 })
        .addTo(formationLayer);
    }
  }

  function renderIsolated(list) {
    const ranked = sites
      .map((site) => ({ site, vivier: siteVivier(site, list) }))
      .sort((a, b) => a.vivier.total - b.vivier.total || a.site.nom.localeCompare(b.site.nom, "fr"));
    const isolated = ranked.filter((r) => r.vivier.total === 0);

    isolatedCount.textContent = fmt(isolated.length);
    const share = sites.length ? Math.round((100 * isolated.length) / sites.length) : 0;
    const totals = ranked.map((r) => r.vivier.total);
    const mid = Math.floor(totals.length / 2);
    const median = totals.length
      ? totals.length % 2 ? totals[mid] : (totals[mid - 1] + totals[mid]) / 2
      : 0;
    findingText.textContent =
      `Sur ${fmt(sites.length)} sites industriels géolocalisés, ${fmt(isolated.length)} (${share} %) n’ont aucune ` +
      `place dans les formations sélectionnées à moins de ${RADIUS_KM} km ; la moitié des sites en ont au moins ` +
      `${fmt(median)}. Les sites sans vivier proche sont situés hors des grandes villes universitaires : ` +
      `la donnée suggère qu’ils doivent recruter plus loin ou former sur place, ce qu’elle ne permet pas de vérifier.`;

    isolatedList.replaceChildren();
    const fragment = document.createDocumentFragment();
    for (const { site, vivier } of ranked.slice(0, 40)) {
      const button = el("button", "company-row");
      button.type = "button";
      const avatar = el("span", "company-avatar", fmt(vivier.total));
      avatar.classList.toggle("is-zero", vivier.total === 0);
      button.append(avatar);
      const copy = el("span", "company-row-copy");
      copy.append(el("strong", "", site.nom));
      const nearest = vivier.nearest
        ? `formation la plus proche à ${fmt(vivier.nearest.distance)} km`
        : "aucune formation";
      copy.append(el("small", "", `${site.commune || ""} · ${nearest}`));
      button.append(copy);
      const arrow = el("span", "company-row-arrow", "›");
      arrow.setAttribute("aria-hidden", "true");
      button.append(arrow);
      button.setAttribute("aria-label", `${site.nom}, ${site.commune || ""} : ${fmt(vivier.total)} places à moins de ${RADIUS_KM} km`);
      button.addEventListener("click", () => {
        if (!showSites.checked) {
          showSites.checked = true;
          drawSites();
        }
        map.flyTo([site.lat, site.lon], 8, { duration: 0.55 });
        map.once("moveend", () => site.marker?.openPopup());
      });
      fragment.append(button);
    }
    isolatedList.append(fragment);
  }

  function update() {
    const list = visibleFormations();
    drawFormations(list);
    const places = list.reduce((sum, f) => sum + f.capacite, 0);
    placesTotal.textContent = fmt(places);
    placesCaption.textContent = `${fmt(list.length)} formations · Parcoursup 2025 · capacité d’accueil, pas diplômés`;
    mapResultCount.textContent = `${fmt(list.length)} ${list.length > 1 ? "formations affichées" : "formation affichée"}`;

    for (const f of levelInputs) {
      const n = formations.filter((x) => x.niveau === f.input.value && activeDomains().has(x.domaine)).length;
      f.badge.textContent = fmt(n);
    }
    for (const f of domainInputs) {
      const n = formations.filter((x) => x.domaine === f.input.value && activeLevels().has(x.niveau)).length;
      f.badge.textContent = fmt(n);
    }
    renderIsolated(list);
    map.closePopup();
  }

  function load() {
    // Données brutes intégrées dans viviers.html par scripts/embed_data.py.
    const element = document.getElementById(DATA_ELEMENT_ID);
    if (!element) {
      throw new Error("les données ne sont pas intégrées dans la page (lancez scripts/build_viviers.py).");
    }
    const viviers = JSON.parse(element.textContent);

    formations = viviers.formations;
    universities = viviers.universites;
    sites = viviers.sites.map((s) => ({ ...s }));

    // Distances site → formation calculées une fois (604 × ~530).
    for (const site of sites) {
      site.distances = new Map(
        formations.map((f) => [f, haversineKm(site.lat, site.lon, f.lat, f.lon)]),
      );
    }

    const levelBox = document.querySelector("#level-filters");
    for (const level of LEVELS) {
      levelInputs.push(buildFilter(levelBox, level.id, level.label, level.detail, `swatch-${level.css}`, "—"));
    }
    const domains = [...new Set(formations.map((f) => f.domaine))].sort((a, b) => a.localeCompare(b, "fr"));
    const domainBox = document.querySelector("#domain-filters");
    for (const domain of domains) {
      domainInputs.push(buildFilter(domainBox, domain, domain, "", "swatch-domain", "—"));
    }
    [...levelInputs, ...domainInputs].forEach((f) => f.input.addEventListener("change", update));

    document.querySelector("#count-universities").textContent = fmt(universities.filter((u) => u.lat != null).length);
    document.querySelector("#count-sites").textContent = fmt(sites.length);
    showUniversities.addEventListener("change", drawUniversities);
    showSites.addEventListener("change", () => {
      radiusLayer.clearLayers();
      drawSites();
    });
    document.querySelector("#zoom-france").addEventListener("click", () => map.fitBounds(FRANCE_BOUNDS));

    const generated = new Date(viviers.generatedAt).toLocaleDateString("fr-FR");
    document.querySelector("#generated-at").textContent =
      `Données préparées le ${generated} par scripts/build_viviers.py · ${viviers.sources.parcoursup} · ${viviers.sources.sies} · ${viviers.sources.sites}.`;

    drawUniversities();
    drawSites();
    update();
  }

  try {
    load();
  } catch (error) {
    console.error(error);
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
