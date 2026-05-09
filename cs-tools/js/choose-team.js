(function () {
  "use strict";

  const STORAGE_KEY = "cs-tools-teams";

  const freshState = (modeBoth) => ({
    players: [],
    titles: {
      team1: "Team 1",
      team2: "Team 2",
      touches: { team1: false, team2: false },
    },
    sides: { team1: null, team2: null },
    locked: false,
    mode: modeBoth ? "both" : null,
    nextSeq: 0,
  });

  function uniqId(seqNumber) {
    return `plyr-${seqNumber}`;
  }

  function loadState(modeBothHint) {
    try {
      const payload = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (!payload || typeof payload !== "object") {
        return freshState(Boolean(modeBothHint));
      }

      const state = freshState(Boolean(modeBothHint) || payload.mode === "both");
      state.players = Array.isArray(payload.players) ? [...payload.players] : [];
      state.titles = {
        team1: typeof payload.titles?.team1 === "string" ? payload.titles.team1 : state.titles.team1,
        team2: typeof payload.titles?.team2 === "string" ? payload.titles.team2 : state.titles.team2,
        touches: {
          team1: Boolean(payload.titles?.touches?.team1),
          team2: Boolean(payload.titles?.touches?.team2),
        },
      };
      state.sides = {
        team1: payload.sides?.team1 === "T" || payload.sides?.team1 === "CT" ? payload.sides.team1 : null,
        team2: payload.sides?.team2 === "T" || payload.sides?.team2 === "CT" ? payload.sides.team2 : null,
      };
      state.locked = Boolean(payload.locked);
      state.mode = payload.mode === "both" ? "both" : null;
      state.nextSeq =
        typeof payload.nextSeq === "number"
          ? payload.nextSeq
          : state.players.reduce((max, chip) => {
              const [, maybe] = String(chip?.id || "").split("-");
              const parsed = Number(maybe);
              return Number.isFinite(parsed) ? Math.max(max, parsed) : max;
            }, 1000);

      return state.players.every((chip) => chip && chip.id && chip.name && chip.location)
        ? state
        : freshState(Boolean(modeBothHint));
    } catch (_) {
      return freshState(Boolean(modeBothHint));
    }
  }

  function persist(state) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function splitFragments(rawInput) {
    return String(rawInput || "")
      .split(/\n|,|;/)
      .map((token) => token.trim())
      .filter(Boolean);
  }

  function playersFor(state, slot) {
    return state.players.filter((player) => player.location === slot);
  }

  function createPlayer(seqNumber, rawName, location) {
    return {
      id: uniqId(seqNumber),
      name: rawName.trim(),
      location,
    };
  }

  function pushChip(state, chip) {
    state.players = state.players.filter((p) => p.id !== chip.id);
    state.players.push(chip);
  }

  function reorderPlayer(chip, state) {
    pushChip(state, chip);
  }

  function appendPlayers(rawInput, state) {
    const fragments = splitFragments(rawInput);
    fragments.forEach((fragment) => {
      state.nextSeq += 1;
      const chip = createPlayer(state.nextSeq, fragment, "pool");
      pushChip(state, chip);
    });
    autoTitles(state);
    persist(state);
  }

  function movePlayer(state, playerId, slot) {
    const player = state.players.find((chip) => chip.id === playerId);
    if (!player) return;
    player.location = slot;
    reorderPlayer(player, state);
    autoTitles(state);
    persist(state);
  }

  function autoTitles(state) {
    const leaderT1 = playersFor(state, "team1")[0]?.name;
    const leaderT2 = playersFor(state, "team2")[0]?.name;
    if (leaderT1 && !state.titles.touches.team1) state.titles.team1 = `${leaderT1}'s Team`;
    if (leaderT2 && !state.titles.touches.team2) state.titles.team2 = `${leaderT2}'s Team`;
  }

  let stateRef;

  function snapshotDom() {
    return {
      shell: document.getElementById("team-shell"),
      lockToggle: document.getElementById("lock-toggle"),
      resetBtn: document.getElementById("reset-teams"),
      pool: document.getElementById("player-pool"),
      poolInput: document.getElementById("pool-input"),
      zone1: document.querySelector('[data-drop-target="team1"]'),
      zone2: document.querySelector('[data-drop-target="team2"]'),
      title1: document.getElementById("team-one-title"),
      title2: document.getElementById("team-two-title"),
      side1: document.querySelector('[data-side-target="team1"]'),
      side2: document.querySelector('[data-side-target="team2"]'),
    };
  }

  function chipTemplate(player, locked) {
    const chip = document.createElement("span");
    chip.className = "team-chip player-chip";
    chip.draggable = !locked;
    chip.dataset.playerId = player.id;
    chip.dataset.label = player.name;
    chip.textContent = player.name;
    chip.title = locked ? undefined : `${player.name} — drag onto a roster box`;
    return chip;
  }

  function render(state) {
    const refs = snapshotDom();

    refs.shell.classList.toggle("is-locked", state.locked);
    refs.lockToggle.classList.toggle("is-on", state.locked);

    refs.pool.innerHTML = "";
    refs.zone1.innerHTML = "";
    refs.zone2.innerHTML = "";

    refs.title1.value = state.titles.team1;
    refs.title2.value = state.titles.team2;

    refs.title1.disabled = state.locked;
    refs.title2.disabled = state.locked;
    refs.poolInput.disabled = state.locked;
    refs.resetBtn.disabled = state.locked;
    refs.side1.disabled = state.locked;
    refs.side2.disabled = state.locked;

    refs.side1.classList.toggle("is-t", state.sides.team1 === "T");
    refs.side1.classList.toggle("is-ct", state.sides.team1 === "CT");
    refs.side1.classList.toggle("is-unknown", !state.sides.team1);
    refs.side1.textContent = state.sides.team1 === "T" ? "T" : state.sides.team1 === "CT" ? "CT" : "—";

    refs.side2.classList.toggle("is-t", state.sides.team2 === "T");
    refs.side2.classList.toggle("is-ct", state.sides.team2 === "CT");
    refs.side2.classList.toggle("is-unknown", !state.sides.team2);
    refs.side2.textContent = state.sides.team2 === "T" ? "T" : state.sides.team2 === "CT" ? "CT" : "—";

    const mount = (slot, host) =>
      playersFor(state, slot).forEach((player) => {
        host.appendChild(chipTemplate(player, state.locked));
      });

    mount("pool", refs.pool);
    mount("team1", refs.zone1);
    mount("team2", refs.zone2);

    fitPoolFonts(refs.pool);
  }

  let poolMeasured = false;
  function fitPoolFonts(pool) {
    if (!pool || !pool.parentElement) return;
    if (!poolMeasured) pool.dataset.baseFont ||= getComputedStyle(pool).fontSize;
    pool.style.fontSize = pool.dataset.baseFont;
    let guard = 0;
    while (pool.scrollHeight - pool.clientHeight > 12 && guard < 30) {
      const currentPx = Number.parseFloat(pool.style.fontSize || pool.dataset.baseFont);
      pool.style.fontSize = `${Math.max(10.5, currentPx - 0.75)}px`;
      guard += 1;
    }
  }

  function wireDnD(shell) {
    shell.addEventListener("dragstart", (event) => {
      const chipElement = event.target.closest(".team-chip");
      if (!chipElement?.draggable) return;
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/cs-tools-player-id", chipElement.dataset.playerId);
      chipElement.style.opacity = "0.46";
      shell.classList.add("is-dragging");
    });

    shell.addEventListener("dragend", (event) => {
      shell.classList.remove("is-dragging");
      event.target.closest(".team-chip") && (event.target.closest(".team-chip").style.opacity = "");
    });

    shell.addEventListener("dragover", (event) => {
      event.preventDefault();
    });

    shell.addEventListener("drop", (event) => {
      if (stateRef.locked) return;
      const dropHost = event.target.closest(".team-drop-zone, #player-pool");
      const id = event.dataTransfer.getData("text/cs-tools-player-id");
      if (!dropHost || !id) return;
      event.preventDefault();
      const slot = resolveSlot(dropHost);
      if (!slot) return;
      movePlayer(stateRef, id, slot);
      render(stateRef);
    });
  }

  function resolveSlot(node) {
    if (node.id === "player-pool") return "pool";
    const attr = node.getAttribute("data-drop-target");
    if (attr === "team1" || attr === "team2") return attr;
    return null;
  }

  function deriveModeBoth() {
    return new URLSearchParams(window.location.search || "").get("mode") === "both";
  }

  function resetBoard(combined) {
    localStorage.removeItem(STORAGE_KEY);
    stateRef = freshState(combined);
    persist(stateRef);
    render(stateRef);
  }

  function toggleLock(combinedFlow) {
    if (combinedFlow && !stateRef.locked) {
      stateRef.locked = true;
      persist(stateRef);
      render(stateRef);
      const teamOne = encodeURIComponent(
        stateRef.titles.team1.trim() || playersFor(stateRef, "team1")[0]?.name || "Team 1",
      );
      const teamTwo = encodeURIComponent(
        stateRef.titles.team2.trim() || playersFor(stateRef, "team2")[0]?.name || "Team 2",
      );
      window.location.assign(`choose-map.html?mode=both&team1=${teamOne}&team2=${teamTwo}`);
      return;
    }
    stateRef.locked = !stateRef.locked;
    persist(stateRef);
    render(stateRef);
  }

  function init() {
    CSToolsNav?.init(".site-menu");
    const combined = deriveModeBoth();
    stateRef = loadState(combined);
    persist(stateRef);

    const refs = snapshotDom();

    wireDnD(document.getElementById("team-shell"));

    const helpCopy = combined
      ? "Combined setup: finalize rosters below, Lock In pushes you toward map veto with both squads carried forward."
      : "Populate the pool, drag chips into roster boxes, and Lock In whenever you freeze lineups.";
    const helpEl = document.getElementById("mode-help");
    if (helpEl) helpEl.textContent = helpCopy;

    refs.title1.addEventListener("input", () => {
      stateRef.titles.team1 = refs.title1.value;
      stateRef.titles.touches.team1 = true;
      persist(stateRef);
    });
    refs.title2.addEventListener("input", () => {
      stateRef.titles.team2 = refs.title2.value;
      stateRef.titles.touches.team2 = true;
      persist(stateRef);
    });

    refs.side1.addEventListener("click", () => cycleSide("team1"));
    refs.side2.addEventListener("click", () => cycleSide("team2"));

    refs.poolInput.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      appendPlayers(refs.poolInput.value, stateRef);
      refs.poolInput.value = "";
      render(stateRef);
    });

    refs.resetBtn.addEventListener("click", () => {
      if (!confirm("Clear every roster assignment?")) return;
      resetBoard(combined);
    });

    refs.lockToggle.addEventListener("click", () => toggleLock(combined));

    render(stateRef);

    poolMeasured = false;
    window.requestAnimationFrame(() => {
      refs.pool.dataset.baseFont = getComputedStyle(refs.pool).fontSize;
      poolMeasured = true;
      render(stateRef);
    });
  }

  function cycleSide(slotKey) {
    if (stateRef.locked) return;
    const order = [null, "T", "CT"];
    const currentIdx = Math.max(
      0,
      order.findIndex((value) => value === stateRef.sides[slotKey]),
    );
    stateRef.sides[slotKey] = order[(currentIdx + 1) % order.length];
    persist(stateRef);
    render(stateRef);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  window.CSToolsTeams = {
    loadStateSnapshot: loadState,
  };
})();
