(function () {
  "use strict";

  const CFG_KEY = "cs-tools-map-config";
  const VETO_KEY = "cs-tools-veto";
  const SUMMARY_KEY = "cs-tools-match-summary";
  /** Set on combined lock-in (choose-team); survives when localStorage is empty so recap payloads still list players. */
  const ROSTER_LOCK_KEY = "cs-tools-roster-at-lock";
  const SIDES_LOCK_KEY = "cs-tools-sides-at-lock";

  let atlas = [];
  let staged = new Set();
  let pickerOrder = [];

  let plan = [];
  let meta = { format: "", bestOf: 3 };
  let chain = [
    {
      remaining: [],
      picks: [],
      logs: [],
      pointer: 0,
      statuses: {},
      done: false,
      startingSides: {},
      sideChooserForMap: [],
    },
  ];
  let cursorIdx = 0;

  let ui = {};

  async function hydrateAtlas() {
    atlas = await window.CSToolsMaps.getAllMaps();
  }

  function entry(id) {
    return atlas.find((item) => item.id === id) || null;
  }

  function store(key, blob) {
    localStorage.setItem(key, JSON.stringify(blob));
  }

  function read(key, fallback = null) {
    try {
      return JSON.parse(localStorage.getItem(key) || "") || fallback;
    } catch (_) {
      return fallback;
    }
  }

  function escapeHtml(raw) {
    return String(raw || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function bothHints() {
    return new URLSearchParams(window.location.search || "").get("mode") === "both";
  }

  /** `URLSearchParams#get` already applies percent-decoding; extra decodeURIComponent can corrupt or throw. */
  function qpDecoded(name) {
    const raw = new URLSearchParams(location.search || "").get(name);
    if (raw == null || raw === "") return "";
    try {
      return decodeURIComponent(raw.replace(/\+/g, " "));
    } catch (_) {
      return raw.replace(/\+/g, " ");
    }
  }

  function teamTitlesFromTeamsBlob() {
    try {
      const raw = localStorage.getItem("cs-tools-teams");
      if (!raw) return { team1: "", team2: "" };
      const blob = JSON.parse(raw);
      if (!blob?.titles || typeof blob.titles !== "object") return { team1: "", team2: "" };
      return {
        team1: typeof blob.titles.team1 === "string" ? blob.titles.team1.trim() : "",
        team2: typeof blob.titles.team2 === "string" ? blob.titles.team2.trim() : "",
      };
    } catch (_) {
      return { team1: "", team2: "" };
    }
  }

  function readCfg() {
    const disk = read(CFG_KEY, {});
    const qs = new URLSearchParams(location.search || "");
    const blended = qs.get("mode") === "both";
    const combinedFlow = blended || Boolean(disk.bothFlow);

    let t1 = "Team 1";
    let t2 = "Team 2";
    if (combinedFlow) {
      t1 = typeof disk.team1Name === "string" ? disk.team1Name : "Team 1";
      t2 = typeof disk.team2Name === "string" ? disk.team2Name : "Team 2";
      const fromTitles = blended ? teamTitlesFromTeamsBlob() : { team1: "", team2: "" };
      if (blended && qs.has("team1")) {
        const q = qpDecoded("team1");
        if (q) t1 = q;
        else if (fromTitles.team1) t1 = fromTitles.team1;
      }
      if (blended && qs.has("team2")) {
        const q = qpDecoded("team2");
        if (q) t2 = q;
        else if (fromTitles.team2) t2 = fromTitles.team2;
      }
      const looksDefaultName = (s, fb) => {
        const x = String(s ?? "").trim().toLowerCase();
        return !x || x === fb || x.replace(/\s+/g, "") === "team1" || x.replace(/\s+/g, "") === "team2";
      };
      if (blended && !qs.has("team1") && fromTitles.team1 && looksDefaultName(t1, "team 1")) t1 = fromTitles.team1;
      if (blended && !qs.has("team2") && fromTitles.team2 && looksDefaultName(t2, "team 2")) t2 = fromTitles.team2;
    }
    const pool = Number.isFinite(Number(disk.poolSize)) ? Number(disk.poolSize) : 7;

    let bestVal = Number(disk.bestOf);
    if (![1, 3, 5].includes(bestVal)) bestVal = 3;

    return {
      team1Name: String(t1).slice(0, 72),
      team2Name: String(t2).slice(0, 72),
      vetoFormat: typeof disk.vetoFormat === "string" ? disk.vetoFormat : "esl",
      poolSize: pool >= 3 ? pool : 7,
      bestOf: bestVal,
      filters: disk.filters && typeof disk.filters === "object" ? disk.filters : {},
      selections: Array.isArray(disk.selectedIds) ? disk.selectedIds.slice() : [],
      bothFlow: combinedFlow,
    };
  }

  function persistCfg(patch) {
    store(CFG_KEY, { ...read(CFG_KEY, {}), ...patch, updatedAt: Date.now() });
  }

  function seedSelection(cap, atlasCopy) {
    const ordered = window.CSToolsMaps.sortMapsChooser(atlasCopy.slice());
    const duty = ordered.filter((mapItem) => window.CSToolsMaps.isActiveDuty(mapItem));
    const rest = ordered.filter((mapItem) => !window.CSToolsMaps.isActiveDuty(mapItem));
    const stack = [...duty, ...rest].slice(0, cap).map((mapItem) => mapItem.id);
    staged = new Set(stack);
  }

  function pickCap() {

    const cap = Number(ui.poolSel.value || 7);

    return cap >= 3 ? cap : 7;

  }

  function trimSelection(cap) {

    const priority = pickerOrder.filter((slot) => staged.has(slot.id)).map((slot) => slot.id);

    staged = new Set(priority.slice(0, cap));

  }

  function buildFilters(holder) {
    holder.innerHTML = `
      <div class="filter-stack">
        <label for="pick-version">Game version</label>
        <div class="multiselect" data-multiselect="version" data-label="Game version">
          <button type="button" class="field multiselect-toggle" id="pick-version" aria-haspopup="true" aria-expanded="false"></button>
          <input type="hidden" name="version" value="all">
          <div class="multiselect-menu" role="menu" aria-label="Game version options"></div>
        </div>
      </div>
      <div class="filter-stack">
        <label for="pick-mode">Game mode</label>
        <div class="multiselect" data-multiselect="mode" data-label="Game mode">
          <button type="button" class="field multiselect-toggle" id="pick-mode" aria-haspopup="true" aria-expanded="false"></button>
          <input type="hidden" name="mode" value="hostage_rescue,bomb_defusal">
          <div class="multiselect-menu" role="menu" aria-label="Game mode options"></div>
        </div>
      </div>
      <div class="filter-stack">
        <label for="pick-year">Year</label>
        <div class="multiselect" data-multiselect="year" data-label="Year">
          <button type="button" class="field multiselect-toggle" id="pick-year" aria-haspopup="true" aria-expanded="false"></button>
          <input type="hidden" name="year" value="all">
          <div class="multiselect-menu" role="menu" aria-label="Year options"></div>
        </div>
      </div>
      <div class="filter-stack">
        <label for="pick-operation">Operation</label>
        <div class="multiselect" data-multiselect="operation" data-label="Operation">
          <button type="button" class="field multiselect-toggle" id="pick-operation" aria-haspopup="true" aria-expanded="false"></button>
          <input type="hidden" name="operation" value="all">
          <div class="multiselect-menu" role="menu" aria-label="Operation options"></div>
        </div>
      </div>
      <div class="filter-stack">
        <label for="pick-pool">Pool status</label>
        <div class="multiselect" data-multiselect="poolStatus" data-label="Pool status">
          <button type="button" class="field multiselect-toggle" id="pick-pool" aria-haspopup="true" aria-expanded="false"></button>
          <input type="hidden" name="poolStatus" value="all">
          <div class="multiselect-menu" role="menu" aria-label="Pool status options"></div>
        </div>
      </div>
      <div class="filter-stack">
        <label for="pick-sort">Sort</label>
        <select class="field" id="pick-sort" name="sortBy">
          <option value="newest">Newest</option>
          <option value="oldest">Oldest</option>
          <option value="az">A → Z</option>
          <option value="za">Z → A</option>
        </select>
      </div>
      <div class="filter-stack filter-stack--search">
        <label for="pick-search-input">Search</label>
        <input class="field" id="pick-search-input" name="search" type="search" autocomplete="off" />
      </div>`;
  }

  async function setupMultiSelects(formEl) {
    const Multi = window.CSToolsMultiSelect;
    if (!Multi) throw new Error("CSToolsMultiSelect not loaded");
    const titleCase = Multi.titleCaseFromSlug;

    const handles = [];

    handles.push(
      Multi.create(formEl.querySelector('[data-multiselect="version"]'), {
        allowAll: true,
        values: await window.CSToolsMaps.getAvailableVersions(),
        labelForValue: (v) => v,
      }),
    );

    handles.push(
      Multi.create(formEl.querySelector('[data-multiselect="mode"]'), {
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
              return titleCase(v);
          }
        },
      }),
    );

    handles.push(
      Multi.create(formEl.querySelector('[data-multiselect="year"]'), {
        allowAll: true,
        values: await window.CSToolsMaps.getAvailableYears(),
        labelForValue: (v) => String(v),
      }),
    );

    handles.push(
      Multi.create(formEl.querySelector('[data-multiselect="operation"]'), {
        allowAll: true,
        values: await window.CSToolsMaps.getAvailableOperations(),
        labelForValue: (v) => titleCase(String(v).replace(/^operation_/, "")),
      }),
    );

    handles.push(
      Multi.create(formEl.querySelector('[data-multiselect="poolStatus"]'), {
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
              return titleCase(v);
          }
        },
      }),
    );

    return handles;
  }

  function filterPacket(filterFormEl) {
    const data = Object.fromEntries(new FormData(filterFormEl).entries());
    const configForm = document.getElementById("config-form");
    const cs2 =
      configForm?.elements?.namedItem("cs2Only") || filterFormEl?.elements?.namedItem("cs2Only");
    if (cs2 && cs2.type === "checkbox") {
      data.cs2Only = cs2.checked ? "1" : "0";
    }
    return data;
  }

  async function deck(formEl) {
    pickerOrder = window.CSToolsMaps.sortMapsChooser(await window.CSToolsMaps.filterMaps(filterPacket(formEl)));
    renderPickerGrid();
    syncPickerHUD();
    persistDraft();
  }

  /** Full rebuild after filter/sort/order changes (cheap to recreate nodes). */
  function renderPickerGrid() {
    ui.pickerGrid.innerHTML = "";
    pickerOrder.forEach((mapItem) => ui.pickerGrid.appendChild(drawPicker(mapItem)));
  }

  /** Sync selection chrome without nuking cards (avoids thumbnail reload / flash). */
  function updatePickerSelection(mapId) {
    if (mapId != null && mapId !== "") {
      const idStr = String(mapId);
      const card = [...ui.pickerGrid.children].find((el) => el.dataset.mapId === idStr);
      if (card) card.classList.toggle("is-selected", staged.has(mapId));
      return;
    }
    pickerOrder.forEach((mapItem) => {
      const card = [...ui.pickerGrid.children].find((el) => el.dataset.mapId === String(mapItem.id));
      if (card) card.classList.toggle("is-selected", staged.has(mapItem.id));
    });
  }

  function drawPicker(mapItem) {
    const card = CSToolsMapCards.createBrowseStyleCard(mapItem, {
      extraClasses: [],
      onActivate: (eventEntry) => {
        if (eventEntry?.target?.closest?.(".map-expand")) return;
        toggleMap(mapItem.id);
      },
      onExpand: () => CSToolsModal.openMapModal(mapItem),
    });

    card.classList.toggle("is-selected", staged.has(mapItem.id));
    return card;

  }

  function toggleMap(id) {
    staged.has(id) ? staged.delete(id) : staged.add(id);
    updatePickerSelection(id);
    syncPickerHUD();
    persistDraft();
  }

  /** Fisher–Yates shuffle copy; returns first `take` element values (stable for take ≥ length). */
  function shuffleTake(ids, take) {
    const copy = [...ids];
    const n = Math.min(take, copy.length);
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy.slice(0, n);
  }

  /** Replace staged set with `pickCap()` random IDs from current `pickerOrder` (filters + sort). */
  function chooseRandomVisiblePool() {
    const cap = pickCap();
    const visibleIds = pickerOrder.map((slot) => slot.id);
    if (visibleIds.length < cap) {
      alert(
        `Not enough maps match your current filters.\nYou need ${cap} maps from the picker list but only ${visibleIds.length} ${
          visibleIds.length === 1 ? "is" : "are"
        } visible. Widen filters or clear search, then try again.`,
      );
      return;
    }
    staged = new Set(shuffleTake(visibleIds, cap));
    updatePickerSelection();
    syncPickerHUD();
    persistDraft();
  }

  function syncPickerHUD() {

    const cap = pickCap();

    ui.counter.textContent = `${staged.size} / ${cap} maps staged`;
    ui.go.disabled = staged.size !== cap;

  }

  function persistDraft() {

    const cfgSnap = readCfg();
    const combinedTeams = cfgSnap.bothFlow || bothHints();

    persistCfg({
      team1Name: combinedTeams ? ui.t1.value : "Team 1",
      team2Name: combinedTeams ? ui.t2.value : "Team 2",

      vetoFormat: ui.fmt.value,

      poolSize: capValue(),

      bestOf: bestValue(),

      selectedIds: [...staged],

      filters: ui.filters ? filterPacket(ui.filters) : {},

      bothFlow: combinedTeams,
    });

  }

  function capValue() {
    const cap = Number(ui.poolSel.value);
    return Number.isFinite(cap) && cap >= 3 ? cap : 7;
  }

  function bestValue() {
    const node = [...ui.bestBtns].find((btn) => btn.checked);
    return Number(node?.value || 3);
  }

  function rotations(fmt) {

    if (fmt === "hltv") return { banSeed: 1, pickSeed: 1 };
    if (fmt === "faceit") return { banSeed: 0, pickSeed: 1 };

    return { banSeed: 0, pickSeed: 0 };

  }

  function bans(len, starter) {

    return Array.from({ length: Math.max(len, 0) }, (_, turn) => ({ type: "ban", team: (starter + turn) % 2 }));
  }

  function picks(rows, starter) {

    return Array.from({ length: Math.max(rows, 0) }, (_, turn) => ({ type: "pick", team: (starter + turn) % 2 }));
  }

  function compose(poolLen, fmt, bo) {

    const { banSeed, pickSeed } = rotations(fmt);
    if (fmt === "random_pick") return [];
    if (fmt === "veto3_random") return [...bans(Math.max(poolLen - 3, 0), banSeed), { type: "lottery_three" }];
    if (bo === 1) return bans(Math.max(poolLen - 1, 0), banSeed);

    // Bo3: (poolLen - 3) bans and 2 picks before decider. Keep the final
    // two bans after picks when possible (11 maps -> 6 bans, 2 picks, 2 bans, decider).
    // banSeed / pickSeed come from rotations(fmt) — ESL default 0,0; HLTV 1,1; FACEIT 0,1.
    if (bo === 3) {
      const banLen = Math.max(poolLen - 3, 0);
      const lastBanCount = Math.min(2, banLen);
      const firstBanCount = banLen - lastBanCount;
      return [
        ...bans(firstBanCount, banSeed),
        ...picks(2, pickSeed),
        ...bans(lastBanCount, (banSeed + firstBanCount) % 2),
        { type: "decider" },
      ];
    }

    // Bo5: poolLen − 5 bans (no decider) and 5 pick steps — interleave like Bo3.
    // Prefer up to two trailing bans (same cap as Bo3; pool 13+ keeps more bans up front).
    // e.g. pool 9: banLen=4 → bans×2 → picks×5 → bans×2; pool 6: banLen=1 → picks×5 → ban×1.
    if (bo === 5) {
      const banLen = Math.max(poolLen - 5, 0);
      const lastBanCount = Math.min(2, banLen);
      const firstBanCount = banLen - lastBanCount;
      return [
        ...bans(firstBanCount, banSeed),
        ...picks(5, pickSeed),
        ...bans(lastBanCount, (banSeed + firstBanCount) % 2),
      ];
    }

    return [...bans(Math.max(poolLen - bo, 0), banSeed), ...picks(bo, pickSeed)];
  }

  function targetCount(fmt, bo) {
    return fmt === "veto3_random" ? 1 : bo;

  }

  function label(teamIdx) {
    const combinedTeams = bothHints() || readCfg().bothFlow;
    if (!combinedTeams) return `Team ${teamIdx + 1}`;

    const roster = meta.labels || [];

    return roster[teamIdx] || `Team ${teamIdx + 1}`;
  }

  function title(id) {

    return entry(id)?.name || id;

  }

  function dup(node) {

    return {
      remaining: [...node.remaining],

      picks: [...node.picks],

      logs: [...node.logs],

      pointer: node.pointer,

      statuses: { ...node.statuses },
      done: node.done,

      startingSides: { ...(node.startingSides || {}) },
      sideChooserForMap: [...(node.sideChooserForMap || [])],

    };

  }

  function genesis(ids) {

    const snapshot = {

      remaining: [...ids],

      picks: [],

      logs: [],

      pointer: 0,

      statuses: Object.fromEntries(ids.map((slug) => [slug, "open"])),
      done: false,

      startingSides: {},
      sideChooserForMap: [],
    };

    return snapshot;
  }

  function hasStartingSide(snapshot, mapSlug) {
    const s = snapshot.startingSides;
    return s && (s[mapSlug] === "T" || s[mapSlug] === "CT");
  }

  function getSideChooserTeam(snapshot, pickIndex) {
    const scm = snapshot.sideChooserForMap;
    if (scm && (scm[pickIndex] === 0 || scm[pickIndex] === 1)) return scm[pickIndex];
    return (pickIndex + 1) % 2;
  }

  /** First pick index (in series order) still missing a T/CT start choice. */
  function firstPendingSideIndex(snapshot) {
    const picks = snapshot.picks || [];
    for (let i = 0; i < picks.length; i++) {
      if (!hasStartingSide(snapshot, picks[i])) return i;
    }
    return -1;
  }

  function allStartingSidesComplete(snapshot) {
    if (!snapshot.picks?.length) return true;
    return snapshot.picks.every((slug) => hasStartingSide(snapshot, slug));
  }

  function resultsOverlayOpen() {
    return Boolean(document.querySelector(".result-overlay"));
  }

  function maybeOpenResults(snapshot) {
    if (!snapshot.done || !allStartingSidesComplete(snapshot) || resultsOverlayOpen()) return;
    openResults(snapshot);
  }

  function persistVeto(snapshot) {

    store(VETO_KEY, { snapshot: dup(snapshot), meta, plan, cursorIdx });
  }

  function step(snapshot) {

    return plan[snapshot.pointer] || null;

  }

  function markDone(snapshot) {

    snapshot.done = snapshot.picks.length >= targetCount(meta.format, meta.bestOf);

  }

  function runAuto(snapshot) {
    while (snapshot.pointer < plan.length && plan[snapshot.pointer] && ["lottery_three", "decider"].includes(plan[snapshot.pointer].type)) {
      if (plan[snapshot.pointer].type === "lottery_three") finalizeLottery(snapshot);
      if (plan[snapshot.pointer]?.type === "decider") finalizeDecider(snapshot);
      snapshot.pointer += 1;
    }

    if (meta.bestOf === 1 && snapshot.remaining.length === 1 && snapshot.pointer >= plan.length && !snapshot.picks.length && meta.format !== "random_pick")

      seizeLast(snapshot);

    markDone(snapshot);
  }

  function deciderStartingSideChooserTeam() {
    const pickSteps = plan.filter((step) => step.type === "pick");
    const secondPicker = pickSteps.length >= 2 ? pickSteps[1].team : pickSteps[0]?.team ?? 0;
    return (secondPicker + 1) % 2;
  }

  function lotteryStartingSideChooserTeam() {
    const lotIdx = plan.findIndex((step) => step.type === "lottery_three");
    if (lotIdx > 0) {
      for (let j = lotIdx - 1; j >= 0; j--) {
        if (plan[j].type === "ban") return (plan[j].team + 1) % 2;
      }
    }
    return rotations(meta.format).banSeed % 2;
  }

  function finalizeLottery(snapshot) {

    if (!snapshot.remaining.length) return;

    const choiceId = snapshot.remaining[Math.floor(Math.random() * snapshot.remaining.length)];

    snapshot.remaining.forEach((slug) => {
      snapshot.statuses[slug] = slug === choiceId ? "picked" : "banned";
    });

    snapshot.picks.push(choiceId);
    snapshot.sideChooserForMap.push(lotteryStartingSideChooserTeam());
    snapshot.logs.push(`RNG sealed ${title(choiceId)}`);
    snapshot.remaining = [];
  }

  function finalizeDecider(snapshot) {

    if (snapshot.remaining.length !== 1) return;

    const solo = snapshot.remaining.pop();
    snapshot.picks.push(solo);
    snapshot.sideChooserForMap.push(deciderStartingSideChooserTeam());
    snapshot.statuses[solo] = "picked";
    snapshot.logs.push(`Decider keeps ${title(solo)}`);
  }

  function seizeLast(snapshot) {

    const lastId = snapshot.remaining.pop();
    if (!lastId) return;
    snapshot.picks.push(lastId);
    const bansOnly = plan.filter((step) => step.type === "ban");
    const lastBanTeam = bansOnly.length ? bansOnly[bansOnly.length - 1].team : rotations(meta.format).banSeed % 2;
    snapshot.sideChooserForMap.push((lastBanTeam + 1) % 2);
    snapshot.statuses[lastId] = "picked";
    snapshot.logs.push(`${title(lastId)} remains`);
    snapshot.pointer = plan.length;
  }

  function commitMove(mapSlug) {

    const base = dup(chain[cursorIdx]);
    const cue = step(base);

    if (!cue || !(cue.type === "ban" || cue.type === "pick")) return;

    if (!base.remaining.includes(mapSlug)) return;

    base.remaining = base.remaining.filter((slugEntry) => slugEntry !== mapSlug);

    if (cue.type === "ban") {

      base.statuses[mapSlug] = "banned";
      base.logs.push(`${label(cue.team)} banned ${title(mapSlug)}`);
    }

    else {

      base.picks.push(mapSlug);
      base.sideChooserForMap.push((cue.team + 1) % 2);
      base.statuses[mapSlug] = "picked";
      base.logs.push(`${label(cue.team)} chose ${title(mapSlug)}`);

    }

    base.pointer += 1;
    runAuto(base);
    chain = chain.slice(0, cursorIdx + 1);
    chain.push(base);
    cursorIdx += 1;
    persistVeto(base);
    renderVetoSuite();
    maybeOpenResults(base);

  }

  function undoSnap() {

    if (cursorIdx <= 0) return;
    cursorIdx -= 1;

    persistVeto(chain[cursorIdx]);
    renderVetoSuite();

  }

  function redoSnap() {

    if (cursorIdx >= chain.length - 1) return;
    cursorIdx += 1;
    persistVeto(chain[cursorIdx]);
    renderVetoSuite();

  }

  function wipeVeto() {
    localStorage.removeItem(VETO_KEY);
    chain = [
      {
        remaining: [],
        picks: [],
        logs: [],
        pointer: 0,
        statuses: {},
        done: false,
        startingSides: {},
        sideChooserForMap: [],
      },
    ];
    cursorIdx = 0;
    plan = [];
  }

  function renderTimeline(snapshot) {

    ui.history.innerHTML = "";
    snapshot.logs.slice(-240).forEach((lineEntry) => {
      const row = document.createElement("div");
      row.textContent = lineEntry;
      ui.history.appendChild(row);

    });

  }

  function renderRibbon(snapshot) {
    if (snapshot.done && !allStartingSidesComplete(snapshot)) {
      ui.turn.textContent = "Starting sides · choose T or CT";
      return;
    }

    ui.turn.textContent = snapshot.done ? "Resolved" : step(snapshot)?.type?.toUpperCase() || `Plan ready`;
    if (!snapshot.done && step(snapshot)?.type === "ban") ui.turn.textContent += ` · ${label(step(snapshot).team)}`;
    else if (!snapshot.done && step(snapshot)?.type === "pick") ui.turn.textContent += ` · ${label(step(snapshot).team)}`;

  }

  function renderVetoCard(mapItem, snapshot) {

    const card = document.createElement("article");
    card.className = "map-card map-card-static";
    card.classList.toggle("is-picked", snapshot.statuses[mapItem.id] === "picked");
    card.classList.toggle("is-banned", snapshot.statuses[mapItem.id] === "banned");
    card.style.height = "";

    const cue = step(snapshot);

    const canAct = cue && snapshot.remaining.includes(mapItem.id) && (cue.type === "ban" || cue.type === "pick");

    const preview = document.createElement("div");
    preview.className = "veto-indicator";
    if (canAct && cue.type === "ban") preview.innerHTML = `<span class="ban-done">✕</span>`;
    if (canAct && cue.type === "pick") preview.innerHTML = `<span class="pick-done">✔</span>`;

    let appliedTint = null;
    const st = snapshot.statuses[mapItem.id];
    if (st === "banned" || st === "picked") {
      appliedTint = document.createElement("div");
      appliedTint.className =
        st === "banned" ? "veto-applied-tint veto-applied-tint--ban" : "veto-applied-tint veto-applied-tint--pick";
      appliedTint.setAttribute("aria-hidden", "true");
    }

    if (canAct) {
      card.dataset.vetoCue = cue.type;
    }

    const thumbImg = document.createElement("img");
    thumbImg.className = `map-card-thumb is-visible`;

    CSToolsMapCards.decorateCardThumbnail(card, thumbImg, mapItem);

    const halo = document.createElement("div");
    halo.className = "map-card-overlay";
    if (snapshot.statuses[mapItem.id] === "banned") halo.innerHTML = `<span class="ban-done">✕</span>`;
    else if (snapshot.statuses[mapItem.id] === "picked") halo.innerHTML = `<span class="pick-done">✔</span>`;

    const titleBar = document.createElement("span");
    titleBar.className = "map-card-title";

    titleBar.textContent = mapItem.name;

    const plus = document.createElement("button");
    plus.type = "button";

    plus.className = "map-expand";
    plus.textContent = "＋";
    const wrapCtl = document.createElement("div");
    wrapCtl.className = "map-card-controls";

    wrapCtl.appendChild(plus);

    plus.addEventListener("click", (eventEntry) => {
      eventEntry.stopPropagation();
      CSToolsModal.openMapModal(mapItem);
    });

    if (canAct) card.addEventListener("click", () => commitMove(mapItem.id));

    card.appendChild(thumbImg);
    if (appliedTint) card.appendChild(appliedTint);
    card.appendChild(preview);
    card.appendChild(halo);
    card.appendChild(wrapCtl);

    card.appendChild(titleBar);
    return card;

  }

  function renderVetoSuite() {
    const snap = chain[cursorIdx];
    renderRibbon(snap);
    renderTimeline(snap);
    ui.vetoDeck.innerHTML = "";

    [...staged]
      .map((slug) => entry(slug))

      .filter(Boolean)

      .sort((lhs, rhs) => lhs.name.localeCompare(rhs.name))
      .forEach((resolved) => ui.vetoDeck.appendChild(renderVetoCard(resolved, snap)));

    ui.undo.disabled = cursorIdx <= 0;
    ui.redo.disabled = cursorIdx >= chain.length - 1;

    syncSidePickDock(snap);
  }

  function commitStartingSide(choice) {
    if (choice !== "T" && choice !== "CT") return;
    const snap = chain[cursorIdx];
    const idx = firstPendingSideIndex(snap);
    if (idx < 0) return;

    const mapId = snap.picks[idx];
    const base = dup(snap);
    base.startingSides = { ...base.startingSides, [mapId]: choice };
    const chooser = getSideChooserTeam(snap, idx);
    base.logs.push(`${label(chooser)} chose ${choice} start on ${title(mapId)}`);

    chain = chain.slice(0, cursorIdx + 1);
    chain.push(base);
    cursorIdx += 1;
    persistVeto(base);
    renderVetoSuite();
    maybeOpenResults(base);
  }

  function syncSidePickDock(snapshot) {
    const dock = ui.sidePickDock;
    if (!dock) return;

    const idx = firstPendingSideIndex(snapshot);
    if (idx < 0) {
      dock.hidden = true;
      dock.innerHTML = "";
      return;
    }

    const mapId = snapshot.picks[idx];
    const chooserTeam = getSideChooserTeam(snapshot, idx);
    const who = label(chooserTeam);

    dock.hidden = false;
    dock.innerHTML = `
      <div class="veto-side-pick-dock__inner">
        <div class="veto-side-pick-dock__copy">
          <span class="veto-side-pick-dock__eyebrow">Starting side</span>
          <strong class="veto-side-pick-dock__map">${escapeHtml(title(mapId))}</strong>
          <span class="veto-side-pick-dock__who"><span class="veto-side-pick-dock__team">${escapeHtml(who)}</span> choose T or CT</span>
        </div>
        <div class="veto-side-pick-dock__actions" role="group" aria-label="Starting side">
          <button type="button" class="button veto-side-btn veto-side-btn--t" data-side="T">T</button>
          <button type="button" class="button veto-side-btn veto-side-btn--ct" data-side="CT">CT</button>
        </div>
      </div>`;

    dock.querySelectorAll("[data-side]").forEach((btn) => {
      btn.addEventListener("click", () => commitStartingSide(btn.getAttribute("data-side")));
    });
  }

  function readRosterLockSession() {
    try {
      const raw = sessionStorage.getItem(ROSTER_LOCK_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
  }

  function readSidesLockSession() {
    try {
      const raw = sessionStorage.getItem(SIDES_LOCK_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      if (!parsed || typeof parsed !== "object") return null;
      return {
        team1: parsed.team1 === "T" || parsed.team1 === "CT" ? parsed.team1 : null,
        team2: parsed.team2 === "T" || parsed.team2 === "CT" ? parsed.team2 : null,
      };
    } catch (_) {
      return null;
    }
  }

  function parseCsToolsTeamsPersisted() {
    try {
      const raw = localStorage.getItem("cs-tools-teams");
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

  function classifyTeamLane(chip) {
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

  /** Ordered name lists derived from persisted chips (canonical team1 / team2). */
  function teamRostersFromPlayers(players) {
    const team1 = [];
    const team2 = [];
    if (!Array.isArray(players)) return { team1, team2 };

    players.forEach((chip) => {
      if (!chip || typeof chip !== "object") return;
      const name = String(chip.name ?? chip.label ?? chip.nick ?? "").trim();
      if (!name) return;
      const lane = classifyTeamLane(chip);
      if (lane === "team1") team1.push(name);
      else if (lane === "team2") team2.push(name);
    });
    return { team1, team2 };
  }

  /**
   * Pick slice for match summary payload + result overlay.
   * startingSides[slug] records the veto side-chooser team's starting role (T|CT).
   * sideChooserForMap[pickIndex] is team index (0|1) of who chose.
   */
  function perMapSummarizeSlice(slugEntry, pickIndex, snapshot, teamLabelsTwo) {
    const startingSide = snapshot?.startingSides?.[slugEntry] ?? null;

    let sideChooserTeamIdx = null;
    const scm = snapshot?.sideChooserForMap;
    if (scm && (scm[pickIndex] === 0 || scm[pickIndex] === 1)) sideChooserTeamIdx = scm[pickIndex];

    const L = Array.isArray(teamLabelsTwo)
      ? teamLabelsTwo.map((t) => String(t ?? "").trim() || `Team ?`)
      : ["Team 1", "Team 2"];

    let teamStartingSides = null;
    let startsTTeam = null;
    let startsCTTeam = null;

    const chooserKnown = sideChooserTeamIdx === 0 || sideChooserTeamIdx === 1;
    if (chooserKnown && (startingSide === "T" || startingSide === "CT")) {
      const other = startingSide === "T" ? "CT" : "T";
      const role0 = sideChooserTeamIdx === 0 ? startingSide : other;
      const role1 = sideChooserTeamIdx === 1 ? startingSide : other;
      teamStartingSides = [
        { teamIdx: 0, label: L[0], role: role0 },
        { teamIdx: 1, label: L[1], role: role1 },
      ];
      startsTTeam = role0 === "T" ? L[0] : L[1];
      startsCTTeam = role0 === "CT" ? L[0] : L[1];
    }

    return {
      id: slugEntry,
      name: title(slugEntry),
      startingSide,
      sideChooserTeamIdx,
      teamStartingSides,
      startsTTeam,
      startsCTTeam,
      teamLabels: [L[0], L[1]],
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
      const sorted = [...mapRow.teamStartingSides].sort((a, b) => a.teamIdx - b.teamIdx);
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

  function summarizePayload(built, journal, snapshot) {
    const teams = parseCsToolsTeamsPersisted();
    const combinedFlowHints = Boolean(readCfg().bothFlow || bothHints());
    let rosterPlayers = Array.isArray(teams.players) ? teams.players.slice() : [];
    if (!rosterPlayers.length && combinedFlowHints) rosterPlayers = readRosterLockSession().slice();

    const teamRosters = teamRostersFromPlayers(rosterPlayers);

    const pickSideCode = (v) => (v === "T" || v === "CT" ? v : null);
    let mergedSides =
      teams.sides && typeof teams.sides === "object"
        ? {
            team1: pickSideCode(teams.sides.team1),
            team2: pickSideCode(teams.sides.team2),
          }
        : { team1: null, team2: null };
    if (!(mergedSides.team1 || mergedSides.team2) && combinedFlowHints) {
      const lk = readSidesLockSession();
      if (lk) mergedSides = lk;
    }
    const persistedCfg = read(CFG_KEY, {});
    let labelPair = ["Team 1", "Team 2"];

    if (combinedFlowHints) {
      const fromBlob = teamTitlesFromTeamsBlob();
      const fallback1 =
        ui.t1.value.trim() ||
        (typeof persistedCfg.team1Name === "string" && persistedCfg.team1Name.trim()) ||
        fromBlob.team1 ||
        "Team 1";
      const fallback2 =
        ui.t2.value.trim() ||
        (typeof persistedCfg.team2Name === "string" && persistedCfg.team2Name.trim()) ||
        fromBlob.team2 ||
        "Team 2";
      labelPair = [fallback1.slice(0, 72), fallback2.slice(0, 72)];
    }

    return {

      team1Name: labelPair[0],
      team2Name: labelPair[1],

      maps: built.map((slugEntry, pickIndex) => perMapSummarizeSlice(slugEntry, pickIndex, snapshot, labelPair)),

      history: journal,

      sides: mergedSides,

      roster: rosterPlayers,
      teamRosters,

      bothMode: Boolean(readCfg().bothFlow || bothHints()),
    };

  }

  function openResults(snapshot) {
    const payload = summarizePayload(snapshot.picks, snapshot.logs.slice(), snapshot);
    if (payload.bothMode) {
      sessionStorage.setItem(SUMMARY_KEY, JSON.stringify(payload));
      try {
        sessionStorage.removeItem(ROSTER_LOCK_KEY);
        sessionStorage.removeItem(SIDES_LOCK_KEY);
      } catch (_) {}
    } else sessionStorage.removeItem(SUMMARY_KEY);

    const overlay = document.createElement("div");
    overlay.className = "result-overlay";
    overlay.innerHTML = `
      <div class="result-panel">
        <h2 class="result-title">Series maps</h2>
        <div class="result-maps" id="stack"></div>
        <details class="detail-section" style="width:min(740px,calc(100% - 20px));margin:16px auto 0;"><summary>Veto narration</summary>
          <pre id="ledger" style="white-space:pre-wrap;font:inherit;color:inherit;margin-top:8px;"></pre>
        </details>
        <div class="result-actions">
          <button class="button is-primary" id="cta" type="button">Accept</button>
        </div>
      </div>`;

    document.body.appendChild(overlay);

    const stackMount = overlay.querySelector("#stack");
    const overlayLabelPair = [payload.team1Name, payload.team2Name];
    snapshot.picks.forEach((slugWrap, ordinal) =>
      stackMount.appendChild(
        bigCard(
          slugWrap,
          ordinal + 1,
          perMapSummarizeSlice(slugWrap, ordinal, snapshot, overlayLabelPair),
        ),
      ),
    );
    overlay.querySelector("#ledger").textContent = snapshot.logs.slice(-320).join("\n");
    overlay.querySelector("#cta").addEventListener("click", () => {
      overlay.remove();
      localStorage.removeItem(VETO_KEY);
      window.location.href = payload.bothMode ? "match-summary.html" : "index.html";

    });

  }

  /** @param mapRow slice from {@link perMapSummarizeSlice} */
  function bigCard(id, slot, mapRow) {

    const box = document.createElement("figure");
    box.className = "summary-large-card result-map-card";

    const surface = document.createElement("article");
    surface.className = "map-card placeholder-fill";
    const imgSlice = document.createElement("img");
    imgSlice.className = `map-card-thumb is-visible`;

    CSToolsMapCards.decorateCardThumbnail(surface, imgSlice, entry(id) || { id });
    surface.appendChild(imgSlice);

    const captionNode = document.createElement("figcaption");
    captionNode.className = `map-card-title`;
    captionNode.style.marginTop = `8px`;

    const primaryLine = document.createElement("span");
    primaryLine.className = `map-caption-primary`;
    primaryLine.textContent = `${slot}. ${title(id)}`;
    captionNode.appendChild(primaryLine);

    const dualRows = getDualStartingSideRows(mapRow);
    const rawSide =
      typeof mapRow?.startingSide === "string" &&
      !dualRows &&
      (mapRow.startingSide === "T" || mapRow.startingSide === "CT")
        ? mapRow.startingSide
        : null;

    if (dualRows || rawSide) {
      const sub = document.createElement("div");
      sub.className = `map-caption-dual-side`;
      if (dualRows) {
        dualRows.forEach((line) => {
          const row = document.createElement("span");
          row.className = `map-caption-dual-side-line`;
          row.textContent = line;
          sub.appendChild(row);
        });
      } else sub.textContent = `Start ${rawSide}`;
      captionNode.appendChild(sub);
    }

    box.appendChild(surface);

    box.appendChild(captionNode);
    return box;

  }

  function randomInstantRun() {

    const poolSel = [...staged];
    for (let i = poolSel.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [poolSel[i], poolSel[j]] = [poolSel[j], poolSel[i]];
    }

    const pickedSubset = poolSel.slice(0, bestValue());

    meta = { labels: [ui.t1.value, ui.t2.value], format: "random_pick", bestOf: pickedSubset.length };
    plan = [];
    const faux = genesis([]);
    pickedSubset.forEach((slugChip) => (faux.statuses[slugChip] = `picked`));
    faux.remaining = [];

    faux.picks = pickedSubset.slice();
    faux.sideChooserForMap = pickedSubset.map((_, ord) => (ord + 1) % 2);
    faux.logs.push(`RNG pulled ${pickedSubset.map((slugLabel) => title(slugLabel)).join(", ")}`);
    faux.done = true;

    meta.format = meta.format || "random_pick";

    chain = [faux];
    cursorIdx = 0;

    persistVeto(faux);

    persistDraft();

    ui.pickPanel.classList.add("substate-hidden");
    ui.vetoPanel.classList.remove("substate-hidden");
    renderVetoSuite();
    maybeOpenResults(faux);
  }

  function launchSequence() {

    const poolRefs = [...staged];
    const fmt = ui.fmt.value;
    const boDigits = bestValue();
    persistDraft();
    if (fmt === "random_pick") return randomInstantRun();
    meta = {

      labels: [ui.t1.value || "Team 1", ui.t2.value || "Team 2"],

      format: fmt,
      bestOf: boDigits,

    };

    plan = compose(poolRefs.length, fmt, boDigits);
    chain = [];

    cursorIdx = 0;
    const seed = genesis(poolRefs.slice());
    runAuto(seed);

    chain = [seed];

    persistVeto(chain[cursorIdx]);
    ui.pickPanel.classList.add("substate-hidden");
    ui.vetoPanel.classList.remove("substate-hidden");
    renderVetoSuite();
    maybeOpenResults(chain[cursorIdx]);

  }

  function resetToPicker(question) {

    if (question !== false && !confirm("Discard veto progression?")) return;
    ui.vetoPanel.classList.add("substate-hidden");
    ui.pickPanel.classList.remove("substate-hidden");
    if (ui.sidePickDock) {
      ui.sidePickDock.hidden = true;
      ui.sidePickDock.innerHTML = "";
    }

    wipeVeto();
    hydrateAtlas().then(deck.bind(null, ui.filters));

  }

  function hydratePicker(cfg) {
    const combinedTeams = cfg.bothFlow || bothHints();
    if (!combinedTeams) {
      ui.t1.value = "Team 1";
      ui.t2.value = "Team 2";
    } else {
      ui.t1.value = cfg.team1Name;
      ui.t2.value = cfg.team2Name;
    }
    ui.fmt.value = cfg.vetoFormat;
    ui.poolSel.value = String(cfg.poolSize);
    ui.bestBtns.forEach((btnPiece) => (btnPiece.checked = btnPiece.value === String(cfg.bestOf)));

    staged.clear();

    const cap = cfg.poolSize >= 3 ? cfg.poolSize : 7;
    const savedSelections = cfg.selections || [];
    if (savedSelections.length) {
      savedSelections
        .slice(0, cap)
        .filter((slugValue) => Boolean(slugValue) && entry(slugValue))

        .forEach((slug) => staged.add(slug));
    }
    if (!staged.size) seedSelection(cap, atlas);

    if (cfg.filters) {
      Object.entries(cfg.filters).forEach(([fname, payload]) => {
        const ctl =
          ui.filters.elements.namedItem(fname) || ui.configForm?.elements?.namedItem(fname);
        if (!ctl) return;
        if (ctl.type === "checkbox") {
          const truthy = payload === "1" || payload === 1 || payload === true;
          const str = String(payload ?? "").trim().toLowerCase();
          ctl.checked = truthy || str === "true" || str === "on";
          return;
        }
        if (ctl.value !== undefined) ctl.value = payload;
      });
    }

    const cs2OnlyCtl =
      ui.configForm?.elements?.namedItem("cs2Only") || ui.filters.elements.namedItem("cs2Only");
    if (
      cs2OnlyCtl &&
      cs2OnlyCtl.type === "checkbox" &&
      (!cfg.filters || !Object.prototype.hasOwnProperty.call(cfg.filters, "cs2Only"))
    ) {
      cs2OnlyCtl.checked = true;
    }
  }

  async function bootstrap() {

    window.CSToolsNav?.init(".site-menu");
    ui.configForm = document.getElementById("config-form");
    ui.pickPanel = document.getElementById("panel-selection");
    ui.vetoPanel = document.getElementById("panel-veto");
    ui.turn = document.getElementById("turn-label");

    ui.history = document.getElementById("history-list");
    ui.vetoDeck = document.getElementById("veto-grid");
    ui.pickerGrid = document.getElementById("picker-grid");
    ui.counter = document.getElementById("picker-count-banner");
    ui.randomPool = document.getElementById("random-pool-btn");
    ui.deselectAll = document.getElementById("deselect-all-btn");
    ui.go = document.getElementById("go-veto-btn");

    ui.t1 = document.getElementById("team-one-name");
    ui.t2 = document.getElementById("team-two-name");

    ui.fmt = document.getElementById("veto-format-select");
    ui.poolSel = document.getElementById("pool-size-select");
    ui.bestBtns = document.querySelectorAll('input[name="bestOf"]');
    ui.poolSel.innerHTML = "";
    ;[3, 5, 7, 9, 11, 13, 15].forEach((digits) =>
      ui.poolSel.appendChild(
        Object.assign(document.createElement("option"), {

          textContent: String(digits),
          value: String(digits),
        }),

      ),

    );

    ui.undo = document.getElementById("undo-action");

    ui.redo = document.getElementById("redo-action");

    ui.sidePickDock = document.getElementById("side-pick-dock");

    const filterRoot = document.getElementById("picker-filters");
    buildFilters(filterRoot);
    ui.filters = filterRoot;

    ui.undo?.addEventListener("click", undoSnap);
    ui.redo?.addEventListener("click", redoSnap);
    document.getElementById("reset-veto")?.addEventListener("click", () => resetToPicker(true));

    document.getElementById("back-to-picker")?.addEventListener("click", () => resetToPicker(true));

    ui.randomPool?.addEventListener("click", chooseRandomVisiblePool);

    ui.deselectAll?.addEventListener("click", () => {
      staged.clear();
      updatePickerSelection();
      syncPickerHUD();
      persistDraft();
    });

    ui.go?.addEventListener("click", () => {
      if (staged.size !== capValue()) {

        alert(`Select exactly ${capValue()} maps.`);
        return;
      }

      persistDraft();
      launchSequence();

    });

    ;[ui.t1, ui.t2, ui.fmt, ui.poolSel].forEach((field) =>
      field?.addEventListener("input", () => {
        persistDraft();
      }),

    );

    ui.poolSel.addEventListener("change", async () => {
      trimSelection(capValue());
      await hydrateAtlas();
      await deck(ui.filters);
      syncPickerHUD();
      persistDraft();
    });

    ui.bestBtns.forEach((btnEl) =>
      btnEl.addEventListener(`change`, () => {
        persistDraft();
      }),
    );

    ui.configForm?.elements?.namedItem("cs2Only")?.addEventListener("change", async () => {
      await hydrateAtlas();
      await deck(ui.filters);
      syncPickerHUD();
      persistDraft();
    });

    await hydrateAtlas();
    const cfgDraft = readCfg();
    // Order matters: hydrate hidden inputs from saved cfg.filters BEFORE the
    // multiselect factory reads them so checkbox state mirrors restored values.
    hydratePicker(cfgDraft);
    ui.multiSelects = await setupMultiSelects(ui.filters);

    document.addEventListener("click", (event) => {
      (ui.multiSelects || []).forEach((ms) => {
        if (ms.isOpen() && !ms.root.contains(event.target)) ms.close();
      });
    });
    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      (ui.multiSelects || []).forEach((ms) => ms.close());
    });

    await deck(ui.filters);
    persistCfg({ ...cfgDraft, selections: [...staged], bothFlow: cfgDraft.bothFlow });
    persistDraft();

    ui.filters.addEventListener("change", async () => {
      await hydrateAtlas();
      await deck(ui.filters);
      syncPickerHUD();
      persistDraft();
    });

    let filterTimer;

    ui.filters.addEventListener("input", () => {
      window.clearTimeout(filterTimer);
      filterTimer = window.setTimeout(async () => {
        await hydrateAtlas();
        await deck(ui.filters);
        syncPickerHUD();
      }, 150);
    });

    if (bothHints()) persistCfg({ ...readCfg(), bothFlow: true });

    const prose = document.getElementById("chooser-lede");

    if (prose && readCfg().bothFlow)
      prose.textContent = `Combined matchup path — Accept routes into the condensed recap sheet.`;

    /*
     * Query resetVeto=1: defense-in-depth after combined lock-in (choose-team also clears cs-tools-veto).
     * Strip param so refresh does not rely on it. Map-only flows omit this and keep veto resume on reload.
     * Verify: open choose-map?mode=both&resetVeto=1 with leftover veto in localStorage → picker visible.
     */
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.get("resetVeto") === "1") {
        wipeVeto();
        url.searchParams.delete("resetVeto");
        const next = url.pathname + (url.searchParams.toString() ? `?${url.searchParams.toString()}` : "") + url.hash;
        history.replaceState(null, "", next);
      }
    } catch (_) {}

    const vRestore = read(VETO_KEY, null);
    if (vRestore?.meta && vRestore.snapshot) {
      meta = vRestore.meta;
      plan = Array.isArray(vRestore.plan) ? vRestore.plan : [];
      const sn = dup(vRestore.snapshot);
      if (!sn.startingSides) sn.startingSides = {};
      if (!Array.isArray(sn.sideChooserForMap)) sn.sideChooserForMap = [];
      while (sn.sideChooserForMap.length < sn.picks.length) {
        sn.sideChooserForMap.push((sn.sideChooserForMap.length + 1) % 2);
      }
      if (sn.sideChooserForMap.length > sn.picks.length) {
        sn.sideChooserForMap = sn.sideChooserForMap.slice(0, sn.picks.length);
      }
      staged = new Set([...(sn.remaining || []), ...(sn.picks || [])]);
      chain = [sn];
      cursorIdx = 0;
      const hasVeto =
        (sn.remaining && sn.remaining.length > 0) ||
        (sn.picks && sn.picks.length > 0) ||
        (typeof sn.pointer === "number" && sn.pointer > 0) ||
        (plan && plan.length > 0);
      if (hasVeto || sn.done) {
        ui.pickPanel.classList.add("substate-hidden");
        ui.vetoPanel.classList.remove("substate-hidden");
        renderVetoSuite();
        maybeOpenResults(sn);
      }
    }
  }

  if (document.readyState === `loading`)

    document.addEventListener(`DOMContentLoaded`, bootstrap);

  else bootstrap();
})();
