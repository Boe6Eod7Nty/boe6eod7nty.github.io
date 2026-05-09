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

  function titleCaseFromSlug(value) {
    return String(value || "")
      .replaceAll(/[_-]+/g, " ")
      .trim()
      .replaceAll(/\s+/g, " ")
      .replaceAll(/\b\w/g, (c) => c.toUpperCase());
  }

  function parseHiddenMulti(value) {
    if (value == null) return [];
    const raw = String(value).trim();
    if (!raw) return [];
    if (raw === "all") return ["all"];
    return raw
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);
  }

  function createMultiSelect(root, options) {
    const toggle = root.querySelector(".multiselect-toggle");
    const menu = root.querySelector(".multiselect-menu");
    const hidden = root.querySelector('input[type="hidden"]');

    if (!toggle || !menu || !hidden) {
      throw new Error("Multiselect markup missing required elements.");
    }

    const labelPrefix = root.dataset.label || "Filter";
    const allowAll = Boolean(options.allowAll);

    const state = {
      open: false,
      selected: new Set(parseHiddenMulti(hidden.value)),
    };

    const resolveLabel = (value) => {
      if (options.labelForValue) return options.labelForValue(value);
      return titleCaseFromSlug(value);
    };

    const normalizeSelection = () => {
      if (allowAll) {
        if (state.selected.size === 0) {
          state.selected.add("all");
        }
        if (state.selected.has("all") && state.selected.size > 1) {
          state.selected = new Set(["all"]);
        }
      } else {
        state.selected.delete("all");
      }
    };

    const writeHidden = () => {
      normalizeSelection();
      if (allowAll && state.selected.has("all")) {
        hidden.value = "all";
        return;
      }
      hidden.value = [...state.selected].join(",");
    };

    const selectionSummary = () => {
      if (allowAll && state.selected.has("all")) {
        return "All";
      }

      const selectedValues = options.values.filter((v) => state.selected.has(v));
      if (selectedValues.length === 0) {
        return allowAll ? "All" : "None";
      }
      if (selectedValues.length <= 2) {
        return selectedValues.map(resolveLabel).join(", ");
      }
      return `${selectedValues.length} selected`;
    };

    const syncToggleText = () => {
      toggle.textContent = `${labelPrefix}: ${selectionSummary()}`;
    };

    const setOpen = (next) => {
      state.open = Boolean(next);
      root.classList.toggle("is-open", state.open);
      toggle.setAttribute("aria-expanded", state.open ? "true" : "false");
    };

    const buildMenu = () => {
      menu.innerHTML = "";

      const values = allowAll ? ["all", ...options.values] : [...options.values];

      values.forEach((value) => {
        const row = document.createElement("label");
        row.className = "multiselect-option";

        const input = document.createElement("input");
        input.type = "checkbox";
        input.value = value;
        input.checked = state.selected.has(value);

        const text = document.createElement("span");
        text.textContent = value === "all" ? "All" : resolveLabel(value);

        input.addEventListener("click", (event) => {
          // Prevent checkbox clicks from toggling/closing via root handlers.
          event.stopPropagation();
        });

        input.addEventListener("change", () => {
          if (value === "all") {
            if (input.checked) {
              state.selected = new Set(["all"]);
            } else if (allowAll) {
              // Can't have "no filter" be empty; fall back to all.
              state.selected = new Set(["all"]);
              input.checked = true;
            }
          } else {
            state.selected.delete("all");
            if (input.checked) {
              state.selected.add(value);
            } else {
              state.selected.delete(value);
            }

            if (allowAll && state.selected.size === 0) {
              state.selected = new Set(["all"]);
              buildMenu();
              writeHidden();
              syncToggleText();
              return;
            }
          }

          if (allowAll) {
            const allBox = menu.querySelector('input[type="checkbox"][value="all"]');
            if (allBox) allBox.checked = state.selected.has("all");
          }

          writeHidden();
          syncToggleText();
          hidden.dispatchEvent(new Event("change", { bubbles: true }));
        });

        row.appendChild(input);
        row.appendChild(text);
        menu.appendChild(row);
      });
    };

    toggle.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      setOpen(!state.open);
    });

    toggle.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
      if (event.key === "ArrowDown" && !state.open) {
        event.preventDefault();
        setOpen(true);
        const firstInput = menu.querySelector('input[type="checkbox"]');
        firstInput?.focus();
      }
    });

    root.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        setOpen(false);
        toggle.focus();
      }
    });

    buildMenu();
    writeHidden();
    syncToggleText();

    return {
      close: () => setOpen(false),
      isOpen: () => state.open,
      root,
    };
  }

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
