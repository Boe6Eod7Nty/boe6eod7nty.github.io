(function () {
  "use strict";

  const KEY = "cs-tools-match-summary";
  const TEAMS_LS = "cs-tools-teams";
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

  /** Mirrors `classifyTeamLane` in choose-map.js so persisted chips classify the same everywhere. */
  function classifyTeamLaneChip(chip) {
    const raw = chip?.location ?? chip?.slot ?? chip?.team ?? chip?.lane ?? chip?.assignment ?? chip?.squad;
    if (raw === 0 || raw === "0") return "team1";
    if (raw === 1 || raw === "1") return "team2";
    const slug = String(raw ?? "")
      .trim()
      .toLowerCase()
      .replace(/\s+|_/g, "");
    if (slug === "team1" || slug === "t1" || slug === "a" || slug === "attackers") return "team1";
    if (slug === "team2" || slug === "t2" || slug === "b" || slug === "defenders") return "team2";
    if (slug === "pool" || slug === "bench" || slug === "unassigned" || slug === "freeagent") return "pool";
    return "";
  }

  function parseCsToolsTeamsPersisted() {
    try {
      const raw = localStorage.getItem(TEAMS_LS);
      if (raw === null || raw === "") return { sides: null, players: [] };
      const blob = JSON.parse(raw);
      if (!blob || typeof blob !== "object") return { sides: null, players: [] };

      let sides = null;
      if (blob.sides && typeof blob.sides === "object") {
        sides = {
          team1: blob.sides.team1 === "T" || blob.sides.team1 === "CT" ? blob.sides.team1 : null,
          team2: blob.sides.team2 === "T" || blob.sides.team2 === "CT" ? blob.sides.team2 : null,
        };
      }

      const players = Array.isArray(blob.players) ? blob.players : [];
      return { sides, players };
    } catch (_) {
      return { sides: null, players: [] };
    }
  }

  function teamRostersFromPlayers(players) {
    const team1 = [];
    const team2 = [];
    if (!Array.isArray(players)) return { team1, team2 };

    players.forEach((chip) => {
      if (!chip || typeof chip !== "object") return;
      const name = String(chip.name ?? chip.label ?? chip.nick ?? "").trim();
      if (!name) return;
      const lane = classifyTeamLaneChip(chip);
      if (lane === "team1") team1.push(name);
      else if (lane === "team2") team2.push(name);
    });
    return { team1, team2 };
  }

  function coerceRosterDisplayNames(entries) {
    if (!Array.isArray(entries)) return [];
    const out = [];
    for (const entry of entries) {
      let name = "";
      if (typeof entry === "string" || typeof entry === "number") name = String(entry).trim();
      else if (entry && typeof entry === "object")
        name = String(entry.name ?? entry.label ?? entry.nick ?? "").trim();
      if (name) out.push(name);
    }
    return out;
  }

  /** Align with summarizePayload emissions; graft localStorage roster when session blob lacks names. */
  function normalizeSummaryPayload(payload) {
    if (!payload) return null;

    const diskTeams = parseCsToolsTeamsPersisted();
    const diskPlayers = Array.isArray(diskTeams.players) ? diskTeams.players : [];

    let rosterPlayers = [];
    if (Array.isArray(payload.roster) && payload.roster.length) rosterPlayers = payload.roster.slice();
    else if (Array.isArray(payload.players) && payload.players.length) rosterPlayers = payload.players.slice();
    else if (diskPlayers.length) rosterPlayers = diskPlayers.slice();

    const rosterBucket =
      payload.teamRosters && typeof payload.teamRosters === "object"
        ? payload.teamRosters
        : payload.team_rosters && typeof payload.team_rosters === "object"
          ? payload.team_rosters
          : payload.rosters && typeof payload.rosters === "object"
            ? payload.rosters
            : null;

    let teamRosters = rosterBucket
      ? {
          team1: coerceRosterDisplayNames(rosterBucket.team1),
          team2: coerceRosterDisplayNames(rosterBucket.team2),
        }
      : { team1: [], team2: [] };

    const derivedPayload = teamRostersFromPlayers(rosterPlayers);
    const derivedFromDiskTeams = teamRostersFromPlayers(diskPlayers);

    const tableEmpty =
      !(teamRosters.team1.length || teamRosters.team2.length);
    const payloadDerivedNonEmpty =
      derivedPayload.team1.length || derivedPayload.team2.length;
    const diskDerivedNonEmpty = derivedFromDiskTeams.team1.length || derivedFromDiskTeams.team2.length;

    if (tableEmpty && payloadDerivedNonEmpty) teamRosters = derivedPayload;
    else if (tableEmpty && !payloadDerivedNonEmpty && diskDerivedNonEmpty)
      teamRosters = derivedFromDiskTeams;

    // Payload can carry stale or mis-classified `teamRosters` / roster chips (still "team" buckets in LS).
    // Finalize per lane: prefer non-empty serialized lists; otherwise fall back to current `cs-tools-teams`.
    const laneFinalize = (lane) => {
      const fromTbl = coerceRosterDisplayNames(teamRosters[lane]);
      if (fromTbl.length) return fromTbl;
      const fromDisk = coerceRosterDisplayNames(derivedFromDiskTeams[lane]);
      if (fromDisk.length) return fromDisk;
      return [];
    };

    teamRosters = { team1: laneFinalize("team1"), team2: laneFinalize("team2") };

    return {
      ...payload,
      roster: rosterPlayers,
      teamRosters,
    };
  }

  /**
   * Two caption lines ordered by team index (team 0, then team 1). Null when no dual starting-side data.
   * @returns {string[] | null}
   */
  function getDualStartingSideRows(mapRow) {
    if (!mapRow || typeof mapRow !== "object") return null;

    if (
      Array.isArray(mapRow.teamStartingSides) &&
      mapRow.teamStartingSides.length === 2 &&
      mapRow.teamStartingSides.every((row) => row && (row.role === "T" || row.role === "CT"))
    ) {
      const sorted = [...mapRow.teamStartingSides].sort((lhs, rhs) => lhs.teamIdx - rhs.teamIdx);
      return sorted.map((row) => `${row.label} starts ${row.role}`);
    }

    const tStarter = typeof mapRow.startsTTeam === "string" ? mapRow.startsTTeam.trim() : "";
    const ctStarter = typeof mapRow.startsCTTeam === "string" ? mapRow.startsCTTeam.trim() : "";
    if (!tStarter || !ctStarter) return null;

    const L = Array.isArray(mapRow.teamLabels)
      ? mapRow.teamLabels.map((item) => String(item ?? "").trim()).filter(Boolean)
      : [];

    const roleForLabel = (lab) => {
      const n = lab.toLowerCase();
      if (n === tStarter.toLowerCase()) return "T";
      if (n === ctStarter.toLowerCase()) return "CT";
      return null;
    };

    if (L.length >= 2) {
      const r0 = roleForLabel(L[0]);
      const r1 = roleForLabel(L[1]);
      if (r0 && r1) return [`${L[0]} starts ${r0}`, `${L[1]} starts ${r1}`];
    }

    return [`${tStarter} starts T`, `${ctStarter} starts CT`];
  }

  function rosterNames(payload, lane) {
    const pre = coerceRosterDisplayNames(payload.teamRosters?.[lane]);
    if (pre.length) return pre;

    const pool = Array.isArray(payload.roster)
      ? payload.roster
      : Array.isArray(payload.players)
        ? payload.players
        : [];

    return coerceRosterDisplayNames(
      (pool || [])
        .filter((player) => player && classifyTeamLaneChip(player) === lane)
        .map((player) =>
          typeof player === "string"
            ? player
            : String(player?.name ?? player?.label ?? player?.nick ?? "").trim(),
        ),
    );
  }

  function renderHeroMaps(mountPoint, roster, teamNamePair) {
    const labelFallback = [
      String(teamNamePair?.[0] ?? "").trim() || "Team 1",
      String(teamNamePair?.[1] ?? "").trim() || "Team 2",
    ];

    mountPoint.innerHTML = "";
    if (!Array.isArray(roster) || !roster.length) {

      mountPoint.innerHTML = `<div class="placeholder-fill summary-large-card">&nbsp;</div>`;
      return;
    }

    roster.forEach((card, ordinal) => {
      const slug = card.id || card.slug || card?.map?.id || "";

      const mergedCard = {
        ...card,
        teamLabels:
          Array.isArray(card.teamLabels) && card.teamLabels.length >= 2 ? card.teamLabels : labelFallback,
      };

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
      const titleLine = document.createElement("span");
      titleLine.className = "map-caption-primary";
      titleLine.textContent = `${ordinal + 1}. ${card.name || mapRef?.name || slug || ""}`;
      captionNode.appendChild(titleLine);

      const dualRows = getDualStartingSideRows(mergedCard);
      const rawSide =
        typeof mergedCard.startingSide === "string" &&
        !dualRows &&
        (mergedCard.startingSide === "T" || mergedCard.startingSide === "CT")
          ? mergedCard.startingSide
          : null;

      if (dualRows || rawSide) {
        const sub = document.createElement("div");
        sub.className = "map-caption-dual-side";
        if (dualRows) {
          dualRows.forEach((line) => {
            const row = document.createElement("span");
            row.className = "map-caption-dual-side-line";
            row.textContent = line;
            sub.appendChild(row);
          });
        } else sub.textContent = `Start ${rawSide}`;
        captionNode.appendChild(sub);
      }

      figureNode.appendChild(surfaceNode);

      figureNode.appendChild(captionNode);

      mountPoint.appendChild(figureNode);

    });

  }

  async function bootstrap() {

    window.CSToolsNav?.init(".site-menu");
    await hydrate();
    const payload = normalizeSummaryPayload(readPayload());
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

    function fillList(domNode, rosterRow) {

      domNode.innerHTML = "";

      const names = rosterRow.map((item) => String(item ?? "").trim()).filter(Boolean);

      names.forEach((name) => {

        const listItemNode = document.createElement("li");
        listItemNode.textContent = name;
        domNode.appendChild(listItemNode);

      });
      if (!names.length) {

        domNode.innerHTML = `<li>—</li>`;

      }

    }

    fillList(document.getElementById("team-one-roster"), rosterNames(payload, `team1`));
    fillList(document.getElementById("team-two-roster"), rosterNames(payload, `team2`));
    renderHeroMaps(mapDeck, payload.maps || [], [payload.team1Name, payload.team2Name]);
    story.textContent = (payload.history || []).slice(-360).join(`\n`);
  }

  if (document.readyState === "loading")

    document.addEventListener(`DOMContentLoaded`, bootstrap);

  else bootstrap();
})();
