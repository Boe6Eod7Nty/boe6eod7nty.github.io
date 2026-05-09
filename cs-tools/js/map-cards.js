(function () {
  "use strict";

  const Thumb = window.CSToolsMaps ? window.CSToolsMaps.thumbnailUrl : () => null;

  const CANONICAL_VERSION_ORDER = ["CS2", "CS2*", "CS:GO", "CSS", "CS", "CS:CZ"];

  function escapeHtml(value) {
    return String(value || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function decorateCardThumbnail(cardEl, imgEl, map, onLoad) {
    const thumb = Thumb(map);
    if (!thumb || !imgEl) {
      cardEl.classList.add("is-placeholder");
      return;
    }
    cardEl.classList.add("has-thumb-img");
    imgEl.onload = () => {
      imgEl.classList.add("is-visible");
      onLoad?.();
    };
    imgEl.onerror = () => {
      imgEl.removeAttribute("src");
      imgEl.classList.remove("is-visible");
      cardEl.classList.remove("has-thumb-img");
      cardEl.classList.add("is-placeholder");
    };
    imgEl.src = thumb;
  }

  function mapVersionBadges(map) {
    const versions = Array.isArray(map?.versions) ? map.versions : [];
    const set = new Set();

    versions.forEach((v) => {
      const s = String(v || "").trim();
      if (s) set.add(s);
    });

    // Defensive: some data may mark in_cs2 without listing "CS2" in versions.
    if (map?.in_cs2) set.add("CS2");

    const ordered = CANONICAL_VERSION_ORDER.filter((v) => set.has(v));
    // Include any non-canonical strings at end (but stable).
    const extras = Array.from(set).filter((v) => !CANONICAL_VERSION_ORDER.includes(v)).sort();
    return ordered.concat(extras);
  }

  function createBrowseStyleCard(map, options = {}) {
    const card = document.createElement("article");
    const classes = ["map-card", "browse-card"];
    if (options.interactive !== false) classes.push("is-interactive");
    if (Array.isArray(options.extraClasses)) classes.push(...options.extraClasses.filter(Boolean));
    card.className = classes.join(" ");
    if (options.tabIndex != null) {
      card.tabIndex = options.tabIndex;
    } else if (options.interactive !== false) {
      card.tabIndex = 0;
    }
    if (map?.id != null) {
      card.dataset.mapId = map.id;
    }

    const img = document.createElement("img");
    img.alt = `${map?.name || map?.id || "Map"} thumbnail`;
    img.className = "map-card-thumb";
    decorateCardThumbnail(card, img, map);

    const inner = document.createElement("div");
    inner.className = "map-card-inner";
    const versionBadges = mapVersionBadges(map);
    const versionBadgeHtml = versionBadges
      .map((v) => {
        const isCs2 = v === "CS2";
        const isCs2Star = v === "CS2*";
        const badgeClasses = ["badge", "is-version"];
        if (isCs2) badgeClasses.push("is-cs2");
        if (isCs2Star) badgeClasses.push("is-cs2-star");
        return `<span class="${badgeClasses.join(" ")}">${escapeHtml(v)}</span>`;
      })
      .join("");
    inner.innerHTML = `
      <div class="card-badge-stack">
        ${versionBadgeHtml}
      </div>
      <span class="map-card-title">${escapeHtml(map?.name || map?.id || "")}</span>
    `;

    const controls = document.createElement("div");
    controls.className = "map-card-controls";

    if (options.showExpand !== false) {
      controls.innerHTML = `<button type="button" class="map-expand" aria-label="Expand map detail">＋</button>`;
      const expandBtn = controls.querySelector("button");
      expandBtn?.addEventListener("click", (event) => {
        event.stopPropagation();
        options.onExpand?.(event, map, card);
      });
    }

    if (options.interactive !== false) {
      card.addEventListener("click", (event) => options.onActivate?.(event, map, card));
      card.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          options.onActivate?.(event, map, card);
        }
      });
    }

    card.appendChild(img);
    card.appendChild(inner);
    card.appendChild(controls);
    return card;
  }

  window.CSToolsMapCards = {
    decorateCardThumbnail,
    mapVersionBadges,
    createBrowseStyleCard,
    escapeHtml,
  };
})();
