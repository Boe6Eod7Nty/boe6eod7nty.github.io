(function () {
  "use strict";

  function initNavMenu(detailsSelector) {
    const menu = document.querySelector(detailsSelector || ".site-menu");
    if (!menu) return;

    const panel = menu.querySelector(".site-menu-panel");
    document.addEventListener("click", (event) => {
      if (!menu.open) return;
      if (menu.contains(event.target)) return;
      menu.open = false;
    });

    document.addEventListener("keydown", (event) => {
      if (!menu.open || event.key !== "Escape") return;
      menu.open = false;
      const toggle = menu.querySelector("summary");
      toggle?.focus();
    });

    if (panel) {
      panel.addEventListener("click", () => {
        menu.open = false;
      });
    }
  }

  window.CSToolsNav = {
    init: initNavMenu,
  };
})();
