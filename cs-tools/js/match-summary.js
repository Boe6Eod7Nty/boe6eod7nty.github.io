(function () {
  "use strict";

  const KEY = "cs-tools-match-summary";
  let atlas = [];

  function escapeHtml(value) {
    return String(value || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  async function hydrate() {
    atlas = await window.CSToolsMaps.getAllMaps();
  }

  function entry(id) {
    return atlas.find((item) => item.id === id) || null;
  }

  function readPayload() {

    try {
      return JSON.parse(sessionStorage.getItem(KEY) || "null");

    } catch (_) {
      return null;
    }

  }

  function sideWord(code) {

    if (code === "T") return "Terrorist";
    if (code === "CT") return "Counter-Terrorist";
    return "Side unset";

  }

  function teamRoster(players, lane) {

    return (players || []).filter((player) => player?.location === lane).map((player) => player.name);

  }

  function renderHeroMaps(mountPoint, roster) {

    mountPoint.innerHTML = "";
    if (!Array.isArray(roster) || !roster.length) {

      mountPoint.innerHTML = `<div class="placeholder-fill summary-large-card">&nbsp;</div>`;
      return;
    }

    roster.forEach((card, ordinal) => {
      const slug = card.id || card.slug || card?.map?.id || "";

      const mapRef = slug ? entry(slug) : null;

      const figureNode = document.createElement("figure");
      figureNode.className = `summary-large-card`;

      const surfaceNode = document.createElement("article");
      surfaceNode.className = `map-card placeholder-fill`;
      surfaceNode.style.minHeight = `220px`;

      const heroImg = document.createElement("img");

      heroImg.alt = "";

      heroImg.className = `map-card-thumb is-visible`;

      CSToolsMapCards.decorateCardThumbnail(surfaceNode, heroImg, mapRef || { id: slug || `map-${ordinal}`, name: card.name });

      surfaceNode.appendChild(heroImg);

      const captionNode = document.createElement("figcaption");

      captionNode.className = `map-card-title`;
      captionNode.style.marginTop = `8px`;
      captionNode.textContent = `${ordinal + 1}. ${escapeHtml(card.name || mapRef?.name || slug || "")}`;

      figureNode.appendChild(surfaceNode);

      figureNode.appendChild(captionNode);

      mountPoint.appendChild(figureNode);

    });

  }

  async function bootstrap() {

    window.CSToolsNav?.init(".site-menu");
    await hydrate();
    const payload = readPayload();
    const ledeEl = document.getElementById("summary-lede");
    const mapDeck = document.getElementById("summary-map-deck");
    const story = document.getElementById("summary-history");

    if (!payload) {

      mapDeck.innerHTML = `<div class="placeholder-fill summary-large-card"></div>`;
      story.textContent = "No veto payload cached. Run Choose Both → Lock In → complete veto → Accept to populate this recap.";
      if (ledeEl) ledeEl.textContent = "Complete the Choose Both roadmap to hydrate this recap.";

      return;
    }

    document.getElementById("team-one-banner").textContent = payload.team1Name || "Team 1";
    document.getElementById("team-two-banner").textContent = payload.team2Name || "Team 2";

    const metaOneNode = document.getElementById("team-one-meta");
    const metaTwoNode = document.getElementById("team-two-meta");
    metaOneNode.textContent = sideWord(payload.sides?.team1);
    metaTwoNode.textContent = sideWord(payload.sides?.team2);

    function fillList(domNode, rosterRow) {

      domNode.innerHTML = "";

      rosterRow.forEach((name) => {

        const listItemNode = document.createElement("li");
        listItemNode.textContent = name;
        domNode.appendChild(listItemNode);

      });
      if (!rosterRow.length) {

        domNode.innerHTML = `<li>—</li>`;

      }

    }

    fillList(document.getElementById("team-one-roster"), teamRoster(payload.roster || [], `team1`));
    fillList(document.getElementById("team-two-roster"), teamRoster(payload.roster || [], `team2`));
    renderHeroMaps(mapDeck, payload.maps || []);
    story.textContent = (payload.history || []).slice(-360).join(`\n`);
  }

  if (document.readyState === "loading")

    document.addEventListener(`DOMContentLoaded`, bootstrap);

  else bootstrap();
})();
