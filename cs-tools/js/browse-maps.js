(function () {
  "use strict";

  const Filters = window.CSToolsMaps;
  const Modal = window.CSToolsModal;
  const Cards = window.CSToolsMapCards;

  if (window.__CSToolsBrowseMapsInit) {
    return;
  }
  window.__CSToolsBrowseMapsInit = true;

  function formValues(form) {
    const data = new FormData(form);
    return Object.fromEntries(data.entries());
  }

  const MultiSelect = window.CSToolsMultiSelect;
  const titleCaseFromSlug = MultiSelect.titleCaseFromSlug;
  const createMultiSelect = MultiSelect.create;

  function createCard(map) {
    return Cards.createBrowseStyleCard(map, {
      onActivate: () => Modal.openMapModal(map),
      onExpand: () => Modal.openMapModal(map),
    });
  }

  async function render(filters, mount) {
    mount.innerHTML = "";
    try {
      const maps = await Filters.filterMaps(filters);
      if (!maps.length) {
        mount.innerHTML = `<p style="padding:28px;color:var(--text-secondary);">No maps match filters.</p>`;
        return;
      }
      const fragment = document.createDocumentFragment();
      maps.forEach((map) => fragment.appendChild(createCard(map)));
      mount.appendChild(fragment);
    } catch (error) {
      mount.innerHTML = `<p style="padding:28px;color:var(--accent-red);">${Cards.escapeHtml(error.message)}</p>`;
      console.error(error);
    }
  }

  async function init() {
    const form = document.getElementById("filter-form");
    const grid = document.getElementById("map-results");

    CSToolsNav?.init(".site-menu");

    const multiSelects = [];

    multiSelects.push(
      createMultiSelect(document.querySelector('[data-multiselect="version"]'), {
        allowAll: true,
        values: await Filters.getAvailableVersions(),
        labelForValue: (v) => v,
      }),
    );

    multiSelects.push(
      createMultiSelect(document.querySelector('[data-multiselect="mode"]'), {
        allowAll: false,
        values: ["hostage_rescue", "bomb_defusal", "wingman"],
        labelForValue: (v) => {
          switch (v) {
            case "bomb_defusal":
              return "Defuse";
            case "hostage_rescue":
              return "Hostage";
            case "wingman":
              return "Wingman";
            default:
              return titleCaseFromSlug(v);
          }
        },
      }),
    );

    multiSelects.push(
      createMultiSelect(document.querySelector('[data-multiselect="year"]'), {
        allowAll: true,
        values: await Filters.getAvailableYears(),
        labelForValue: (v) => String(v),
      }),
    );

    multiSelects.push(
      createMultiSelect(document.querySelector('[data-multiselect="operation"]'), {
        allowAll: true,
        values: await Filters.getAvailableOperations(),
        labelForValue: (v) => titleCaseFromSlug(String(v).replace(/^operation_/, "")),
      }),
    );

    multiSelects.push(
      createMultiSelect(document.querySelector('[data-multiselect="poolStatus"]'), {
        allowAll: true,
        values: ["active_duty", "competitive_pool", "former_competitive_pool", "workshop_only"],
        labelForValue: (v) => {
          switch (v) {
            case "active_duty":
              return "Active Duty";
            case "competitive_pool":
              return "Competitive Pool";
            case "former_competitive_pool":
              return "Former Competitive Pool";
            case "workshop_only":
              return "Workshop Only";
            default:
              return titleCaseFromSlug(v);
          }
        },
      }),
    );

    document.addEventListener("click", (event) => {
      multiSelects.forEach((ms) => {
        if (ms.isOpen() && !ms.root.contains(event.target)) {
          ms.close();
        }
      });
    });

    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      multiSelects.forEach((ms) => ms.close());
    });

    const refresh = async () => {
      const parsed = formValues(form);
      await render(parsed, grid);
    };

    await refresh();
    form.addEventListener("input", refresh);
    form.addEventListener("change", refresh);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
