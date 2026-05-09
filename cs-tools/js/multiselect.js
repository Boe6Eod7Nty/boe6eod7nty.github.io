(function () {
  "use strict";

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

  function create(root, options) {
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
          event.stopPropagation();
        });

        input.addEventListener("change", () => {
          if (value === "all") {
            if (input.checked) {
              state.selected = new Set(["all"]);
            } else if (allowAll) {
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

    /** Re-read hidden input and refresh menu/label without dispatching change. */
    const refresh = () => {
      state.selected = new Set(parseHiddenMulti(hidden.value));
      buildMenu();
      writeHidden();
      syncToggleText();
    };

    return {
      close: () => setOpen(false),
      isOpen: () => state.open,
      refresh,
      root,
    };
  }

  window.CSToolsMultiSelect = { create, parseHiddenMulti, titleCaseFromSlug };
})();
