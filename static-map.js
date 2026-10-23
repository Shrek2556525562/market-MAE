(() => {
  const SVG_NS = "http://www.w3.org/2000/svg";
  const MAP_WIDTH = 900;
  const MAP_HEIGHT = 930;
  const PLOT_LEFT = 50;
  const PLOT_TOP = 40;
  const PLOT_WIDTH = 800;
  const PLOT_HEIGHT = 850;
  const WEST = -5.2;
  const EAST = 9.7;
  const SOUTH = 41.25;
  const NORTH = 51.2;
  function project(coordinates) {
    const [latitude, longitude] = coordinates;
    if (
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      latitude < SOUTH ||
      latitude > NORTH ||
      longitude < WEST ||
      longitude > EAST
    ) {
      return null;
    }

    return {
      x:
        PLOT_LEFT +
        ((longitude - WEST) / (EAST - WEST)) * PLOT_WIDTH,
      y: PLOT_TOP + ((NORTH - latitude) / (NORTH - SOUTH)) * PLOT_HEIGHT,
    };
  }

  function coordinatesFrom(value) {
    if (Array.isArray(value) && value.length === 2) {
      return value.map(Number);
    }
    if (typeof value === "string") {
      const parts = value.split(",").map(Number);
      if (parts.length === 2) return parts;
    }
    return null;
  }

  function create(svg, popup, panel) {
    const popupContent = popup.querySelector(".static-map-popup-content");
    const popupClose = popup.querySelector(".static-map-popup-close");
    const records = new WeakMap();
    let viewBox = { x: 0, y: 0, width: MAP_WIDTH, height: MAP_HEIGHT };
    let dragStart = null;

    function closePopup() {
      popup.hidden = true;
    }

    function applyViewBox(nextViewBox) {
      viewBox = nextViewBox;
      svg.setAttribute(
        "viewBox",
        `${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`,
      );
      closePopup();
    }

    function eventPoint(event) {
      const point = svg.createSVGPoint();
      point.x = event.clientX;
      point.y = event.clientY;
      const matrix = svg.getScreenCTM();
      return matrix ? point.matrixTransform(matrix.inverse()) : null;
    }

    function zoomAt(factor, point) {
      const width = Math.min(MAP_WIDTH, Math.max(120, viewBox.width * factor));
      const height = (width / MAP_WIDTH) * MAP_HEIGHT;
      const relativeX = point
        ? (point.x - viewBox.x) / viewBox.width
        : 0.5;
      const relativeY = point
        ? (point.y - viewBox.y) / viewBox.height
        : 0.5;
      applyViewBox({
        x: (point?.x ?? viewBox.x + viewBox.width / 2) - relativeX * width,
        y: (point?.y ?? viewBox.y + viewBox.height / 2) - relativeY * height,
        width,
        height,
      });
    }

    function showPopup(marker) {
      const record = records.get(marker);
      if (!record) return;
      popupContent.replaceChildren();

      const heading = document.createElement("h3");
      heading.textContent = record.title;
      popupContent.append(heading);

      for (const detail of record.details.filter(Boolean)) {
        const paragraph = document.createElement("p");
        paragraph.textContent = detail;
        popupContent.append(paragraph);
      }

      if (record.href) {
        const link = document.createElement("a");
        link.href = record.href;
        link.target = "_blank";
        link.rel = "noreferrer";
        link.textContent = record.linkLabel;
        popupContent.append(link);
      }

      popup.hidden = false;
      const mapPoint = svg.createSVGPoint();
      mapPoint.x = record.point.x;
      mapPoint.y = record.point.y;
      const matrix = svg.getScreenCTM();
      if (!matrix) return;
      const screenPoint = mapPoint.matrixTransform(matrix);
      const panelBounds = panel.getBoundingClientRect();
      const popupBounds = popup.getBoundingClientRect();
      const left = Math.max(
        10,
        Math.min(
          screenPoint.x - panelBounds.left,
          panelBounds.width - popupBounds.width - 10,
        ),
      );
      const above = screenPoint.y - panelBounds.top - popupBounds.height - 14;
      popup.style.left = `${left}px`;
      popup.style.top = `${Math.max(10, above >= 10 ? above : screenPoint.y - panelBounds.top + 14)}px`;
    }

    function addMarker({
      coordinates,
      title,
      details = [],
      href = "",
      linkLabel = "Voir la fiche ↗",
      layer,
      color,
      radius = 6,
    }) {
      const point = project(coordinatesFrom(coordinates) ?? []);
      if (!point) return null;

      const marker = document.createElementNS(SVG_NS, "circle");
      marker.classList.add("map-marker", `map-marker-${layer}`);
      marker.setAttribute("cx", String(point.x));
      marker.setAttribute("cy", String(point.y));
      marker.setAttribute("r", String(radius));
      marker.setAttribute("fill", color);
      marker.setAttribute("stroke", "#fff");
      marker.setAttribute("stroke-width", "1.7");
      marker.setAttribute("role", "button");
      marker.setAttribute("tabindex", "0");
      marker.setAttribute("aria-label", title);
      marker.setAttribute("data-layer", layer);
      const markerTitle = document.createElementNS(SVG_NS, "title");
      markerTitle.textContent = title;
      marker.append(markerTitle);
      records.set(marker, { title, details, href, linkLabel, point });
      svg.querySelector("#map-markers").append(marker);

      marker.addEventListener("click", (event) => {
        event.stopPropagation();
        showPopup(marker);
      });
      marker.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          showPopup(marker);
        }
      });
      return marker;
    }

    svg.addEventListener(
      "wheel",
      (event) => {
        event.preventDefault();
        const point = eventPoint(event);
        if (point) zoomAt(event.deltaY < 0 ? 0.82 : 1.22, point);
      },
      { passive: false },
    );

    svg.addEventListener("pointerdown", (event) => {
      if (event.target.closest(".map-marker")) return;
      dragStart = {
        point: eventPoint(event),
        x: viewBox.x,
        y: viewBox.y,
        scaleX: svg.getScreenCTM()?.a ?? 1,
        scaleY: svg.getScreenCTM()?.d ?? 1,
        clientX: event.clientX,
        clientY: event.clientY,
      };
      if (dragStart.point) svg.setPointerCapture(event.pointerId);
    });

    svg.addEventListener("pointermove", (event) => {
      if (!dragStart) return;
      applyViewBox({
        ...viewBox,
        x: dragStart.x - (event.clientX - dragStart.clientX) / dragStart.scaleX,
        y: dragStart.y - (event.clientY - dragStart.clientY) / dragStart.scaleY,
      });
    });
    svg.addEventListener("pointerup", () => {
      dragStart = null;
    });
    svg.addEventListener("pointercancel", () => {
      dragStart = null;
    });
    svg.addEventListener("click", (event) => {
      if (!event.target.closest(".map-marker")) closePopup();
    });

    popupClose.addEventListener("click", closePopup);
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closePopup();
    });
    document.querySelector("#zoom-in")?.addEventListener("click", () => {
      zoomAt(0.75);
    });
    document.querySelector("#zoom-out")?.addEventListener("click", () => {
      zoomAt(1.33);
    });
    document.querySelector("#zoom-france")?.addEventListener("click", () => {
      applyViewBox({ x: 0, y: 0, width: MAP_WIDTH, height: MAP_HEIGHT });
    });

    return {
      addMarker,
      closePopup,
      focus(coordinates, zoom = 3) {
        const point = project(coordinatesFrom(coordinates) ?? []);
        if (!point) return;
        const width = MAP_WIDTH / zoom;
        const height = MAP_HEIGHT / zoom;
        applyViewBox({
          x: point.x - width / 2,
          y: point.y - height / 2,
          width,
          height,
        });
      },
      open(marker) {
        if (marker) showPopup(marker);
      },
      setVisible(marker, visible) {
        if (marker) marker.style.display = visible ? "" : "none";
      },
    };
  }

  window.PharmaMap = { create };
})();
