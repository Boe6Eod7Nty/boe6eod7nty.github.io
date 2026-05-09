(function () {
  "use strict";

  const Thumb = window.CSToolsMaps ? window.CSToolsMaps.thumbnailUrl : () => null;

  function categorizeTag(tag) {
    const value = String(tag || "");
    if (value.startsWith("operation_")) return "operations";
    if (value.includes("pool") || value === "active_duty" || value === "official_casual") return "pools";
    if (/^(5v5|3v3|2v2)$/.test(value)) return "formats";
    if (["bomb_defusal", "hostage_rescue", "hostage", "wingman", "arms_race", "deathmatch"].includes(value)) {
      return "modes";
    }
    return "other";
  }

  function groupedChipsHtml(tags = []) {
    const groups = {};
    tags.forEach((tag) => {
      const bucket = categorizeTag(tag);
      if (!groups[bucket]) groups[bucket] = [];
      groups[bucket].push(tag.replace(/_/g, " "));
    });
    const headings = {
      modes: "Modes",
      formats: "Formats",
      pools: "Pool / status",
      operations: "Operations",
      versions: "Legacy",
      other: "Tags",
    };
    let html = "";
    Object.entries(groups).forEach(([key, chips]) => {
      const label = headings[key] || "Tags";
      html += `<section class="detail-section"><span class="detail-label">${escapeHtml(label)}</span><div class="chip-row">${chips
        .slice()
        .sort()
        .map((chip) => `<span class="chip">${escapeHtml(chip)}</span>`)
        .join("")}</div></section>`;
    });
    return html || `<span class="detail-stack">${escapeHtml("No tags captured yet.")}</span>`;
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function modalMarkup(map) {
    const thumbSrc = Thumb(map);
    const versionPills = (map.versions || [])
      .map((ver) => `<span class="chip">${escapeHtml(ver)}</span>`)
      .join("");
    const workshop = (map.workshop_links || [])
      .filter(Boolean)
      .map((link, index) =>
        `<a class="workshop-button" href="${escapeHtml(link)}" target="_blank" rel="noopener noreferrer">Open in Steam Workshop ${index > 0 ? `#${index + 1}` : ""}</a>`,
      )
      .join(" ");
    const cs2Badge = map.in_cs2 ? `<span class="chip badge is-cs2">CS2 (${escapeHtml(map.cs2_type || "unknown")})</span>` : `<span class="chip">Not flagged for CS2</span>`;

    const hero = thumbSrc
      ? `<img class="modal-thumb-img" alt="" decoding="async" src="${escapeHtml(thumbSrc)}">`
      : `<div class="placeholder-thumb"></div>`;

    return `
      <div class="modal-backdrop" data-modal-root>
        <div class="modal-sheet" role="dialog" aria-modal="true" aria-label="${escapeHtml(map.name)} details">
          <div class="modal-toolbar">
            <button type="button" class="modal-close" aria-label="Close details">✕</button>
          </div>
          <div class="modal-body">
            <div class="modal-hero-thumb">
              ${hero}
            </div>
            <h2 class="modal-title">${escapeHtml(map.name)}</h2>
            <section class="detail-section">
              <span class="detail-label">CS2 Status</span>
              <div class="chip-row">${cs2Badge}</div>
            </section>
            <section class="detail-section">
              <span class="detail-label">Versions</span>
              <div class="chip-row">${versionPills || `<span class="detail-stack">${escapeHtml("No version list")}</span>`}</div>
            </section>
            <section class="detail-section">
              <span class="detail-label">Added</span>
              <span class="detail-stack">${escapeHtml(map.added_date || "—")}</span>
            </section>
            <section class="detail-section">
              <span class="detail-label">Tags</span>
              ${groupedChipsHtml(map.tags || [])}
            </section>
            ${
              workshop
                ? `<section class="detail-section"><span class="detail-label">Workshop</span><div>${workshop}</div></section>`
                : ""
            }
            ${
              map.notes
                ? `<section class="detail-section"><span class="detail-label">Notes</span><p class="detail-stack">${escapeHtml(map.notes)}</p></section>`
                : ""
            }
          </div>
        </div>
      </div>`;
  }

  async function openMapModal(map) {
    if (!map || !document.body) return;
    const markup = modalMarkup(map);
    const wrapper = document.createElement("div");
    wrapper.innerHTML = markup.trim();
    const backdrop = wrapper.firstElementChild;
    document.body.appendChild(backdrop);
    document.body.classList.add("has-modal-open");

    const heroImg = backdrop.querySelector(".modal-thumb-img");
    if (heroImg) {
      heroImg.addEventListener("error", () => {
        heroImg.replaceWith(Object.assign(document.createElement("div"), { className: "placeholder-thumb" }));
      });
    }

    const teardown = () => {
      backdrop.remove();
      document.body.classList.remove("has-modal-open");
    };

    const closeButton = backdrop.querySelector(".modal-close");
    backdrop.addEventListener("click", (event) => {
      if (event.target === backdrop) teardown();
    });
    closeButton?.addEventListener("click", teardown);
    document.addEventListener(
      "keydown",
      function escCloser(event) {
        if (event.key === "Escape") {
          teardown();
          document.removeEventListener("keydown", escCloser);
        }
      },
    );

    closeButton?.focus();
  }

  async function openMapModalById(id) {
    if (!window.CSToolsMaps?.getMapById || !id) return;
    const map = await window.CSToolsMaps.getMapById(id);
    if (map) await openMapModal(map);
  }

  window.CSToolsModal = {
    openMapModal,
    openMapModalById,
  };
})();
