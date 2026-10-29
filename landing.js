// Landing page : un coup de molette (ou de doigt, ou de flèche) balaie l'écran
// avec un rideau vert et dépose le visiteur directement sur la carte.
(() => {
  const landing = document.getElementById("accueil");
  const appScreen = document.getElementById("carte");
  const sweep = document.querySelector(".sweep");
  const landingContent = landing.querySelector(".landing-content");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  const COVER_MS = 520;
  const REVEAL_MS = 620;
  const COOLDOWN_MS = 700;
  let busy = false;
  let lockedUntil = 0;

  if ("scrollRestoration" in history) history.scrollRestoration = "manual";

  // Reprend les compteurs calculés par app.js à partir de l'instantané.
  const companyCount = document.getElementById("total-count")?.textContent.trim();
  const siteCount = document.getElementById("site-count")?.textContent.trim();
  if (companyCount) document.getElementById("landing-company-count").textContent = companyCount;
  if (siteCount) document.getElementById("landing-site-count").textContent = siteCount;

  const mapTop = () => appScreen.offsetTop;
  const onLanding = () => window.scrollY < mapTop() - 4;
  const atMapTop = () => Math.abs(window.scrollY - mapTop()) <= 4;
  const isLocked = () => busy || performance.now() < lockedUntil;

  function setHash(hash) {
    history.replaceState(null, "", hash === "#accueil" ? location.pathname + location.search : hash);
  }

  function animate(element, keyframes, duration, easing) {
    return element.animate(keyframes, { duration, easing, fill: "forwards" }).finished;
  }

  async function go(direction) {
    if (isLocked()) return;
    const target = direction === "down" ? mapTop() : 0;

    if (reducedMotion.matches) {
      window.scrollTo(0, target);
      setHash(direction === "down" ? "#carte" : "#accueil");
      lockedUntil = performance.now() + COOLDOWN_MS;
      return;
    }

    busy = true;
    const from = direction === "down" ? "120%" : "-120%";
    const to = direction === "down" ? "-120%" : "120%";
    sweep.classList.add("is-active");

    const fadeOut = direction === "down"
      ? animate(landingContent, [
          { opacity: 1, transform: "translateY(0) scale(1)" },
          { opacity: 0, transform: "translateY(-60px) scale(0.97)" },
        ], COVER_MS, "cubic-bezier(0.5, 0, 0.75, 0)")
      : Promise.resolve();

    await Promise.all([
      animate(sweep, [{ transform: `translateY(${from})` }, { transform: "translateY(0)" }], COVER_MS, "cubic-bezier(0.7, 0, 0.3, 1)"),
      fadeOut,
    ]);

    // Écran entièrement couvert : on change de section en coulisses.
    window.scrollTo(0, target);
    landingContent.getAnimations().forEach((animation) => animation.cancel());
    if (direction === "down") {
      appScreen.classList.remove("is-entering");
      void appScreen.offsetWidth;
      appScreen.classList.add("is-entering");
    }
    setHash(direction === "down" ? "#carte" : "#accueil");

    await animate(sweep, [{ transform: "translateY(0)" }, { transform: `translateY(${to})` }], REVEAL_MS, "cubic-bezier(0.7, 0, 0.3, 1)");
    sweep.classList.remove("is-active");
    sweep.getAnimations().forEach((animation) => animation.cancel());
    busy = false;
    lockedUntil = performance.now() + COOLDOWN_MS;
  }

  // Un élément défilable (liste d'entreprises…) qui peut encore remonter garde la molette.
  function canScrollUpInside(target) {
    for (let node = target; node && node !== appScreen; node = node.parentElement) {
      if (node.scrollTop > 0 && node.scrollHeight > node.clientHeight) return true;
    }
    return false;
  }

  window.addEventListener(
    "wheel",
    (event) => {
      if (event.ctrlKey) return;
      if (onLanding()) {
        event.preventDefault();
        if (event.deltaY > 0 && !isLocked()) go("down");
        return;
      }
      // La carte utilise la molette pour zoomer : on ne la lui vole pas.
      if (event.target.closest("#map")) return;
      if (event.deltaY < 0 && atMapTop() && !canScrollUpInside(event.target)) {
        event.preventDefault();
        go("up");
      } else if (isLocked() && atMapTop()) {
        event.preventDefault();
      }
    },
    { passive: false },
  );

  let touchStartY = null;
  landing.addEventListener("touchstart", (event) => {
    touchStartY = event.touches[0].clientY;
  }, { passive: true });
  landing.addEventListener("touchend", (event) => {
    if (touchStartY === null) return;
    const delta = touchStartY - event.changedTouches[0].clientY;
    touchStartY = null;
    if (delta > 40) go("down");
  });

  document.addEventListener("keydown", (event) => {
    if (!onLanding() || ["INPUT", "TEXTAREA"].includes(document.activeElement.tagName)) return;
    if (["ArrowDown", "PageDown", "End"].includes(event.key) || (event.key === " " && document.activeElement === document.body)) {
      event.preventDefault();
      go("down");
    }
  });

  document.querySelectorAll('a[href="#carte"]').forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      go("down");
    });
  });

  document.querySelectorAll('a[href="#accueil"]').forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      go("up");
    });
  });

  if (location.hash === "#carte") {
    window.scrollTo(0, mapTop());
  } else {
    window.scrollTo(0, 0);
  }
})();
