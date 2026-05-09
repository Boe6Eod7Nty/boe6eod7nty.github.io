(function () {
  "use strict";

  const CFG_KEY = "cs-tools-map-config";
  const VETO_KEY = "cs-tools-veto";
  const SUMMARY_KEY = "cs-tools-match-summary";

  let atlas = [];
  let staged = new Set();
  let pickerOrder = [];

  let plan = [];
  let meta = { format: "", bestOf: 3 };
  let chain = [{ remaining: [], picks: [], logs: [], pointer: 0, statuses: {}, done: false }];
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

  function readCfg() {
    const disk = read(CFG_KEY, {});
    const qs = new URLSearchParams(location.search || "");
    const blended = qs.get("mode") === "both";
    let t1 = typeof disk.team1Name === "string" ? disk.team1Name : "Team 1";
    let t2 = typeof disk.team2Name === "string" ? disk.team2Name : "Team 2";
    if (blended && qs.has("team1")) t1 = decodeURIComponent(qs.get("team1") || "");
    if (blended && qs.has("team2")) t2 = decodeURIComponent(qs.get("team2") || "");
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
      bothFlow: blended || Boolean(disk.bothFlow),
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
        <label for="pick-search-input">Search</label>
        <input class="field" id="pick-search-input" name="search" type="search" autocomplete="off" />
      </div>
      <div class="filter-stack">
        <label for="pick-version">Game version</label>
        <select class="field" id="pick-version" name="version"></select>
      </div>
      <div class="filter-stack">
        <label for="pick-mode">Game mode</label>
        <select class="field" id="pick-mode" name="mode">
          <option value="all">All</option>
          <option value="bomb_defusal">Bomb Defusal</option>
          <option value="hostage_rescue">Hostage</option>
          <option value="wingman">Wingman</option>
        </select>
      </div>
      <div class="filter-stack">
        <label for="pick-year">Year</label>
        <select class="field" id="pick-year" name="year"></select>
      </div>
      <div class="filter-stack">
        <label for="pick-operation">Operation</label>
        <select class="field" id="pick-operation" name="operation"></select>
      </div>
      <div class="filter-stack">
        <label for="pick-pool">Pool status</label>
        <select class="field" id="pick-pool" name="poolStatus">
          <option value="all">All</option>
          <option value="active_duty">Active Duty</option>
          <option value="competitive_pool">Competitive Pool</option>
          <option value="former_competitive_pool">Former Competitive Pool</option>
          <option value="workshop_only">Workshop Only</option>
        </select>
      </div>
      <div class="filter-stack">
        <label for="pick-sort">Sort</label>
        <select class="field" id="pick-sort" name="sortBy">
          <option value="newest">Newest</option>
          <option value="oldest">Oldest</option>
          <option value="az">A → Z</option>
          <option value="za">Z → A</option>
        </select>
      </div>`;

  }

  function fillSelect(sel, caption, opts) {

    sel.innerHTML = "";

    const cap = document.createElement("option");
    cap.value = "all";
    cap.textContent = caption;

    sel.appendChild(cap);

    opts.forEach((optValue) => {
      const option = document.createElement("option");
      option.value = optValue;

      option.textContent = optValue;

      sel.appendChild(option);

    });

  }

  async function hydrateSelects(filtersNode) {

    fillSelect(filtersNode.querySelector("#pick-version"), "All versions", await window.CSToolsMaps.getAvailableVersions());
    fillSelect(filtersNode.querySelector("#pick-year"), "Any year", await window.CSToolsMaps.getAvailableYears());
    fillSelect(filtersNode.querySelector("#pick-operation"), "Any operation", await window.CSToolsMaps.getAvailableOperations());

  }

  function filterPacket(formEl) {

    return Object.fromEntries(new FormData(formEl).entries());

  }

  async function deck(formEl) {
    pickerOrder = window.CSToolsMaps.sortMapsChooser(await window.CSToolsMaps.filterMaps(filterPacket(formEl)));
    redrawPickerDeck();
    syncPickerHUD();
    persistDraft();
  }

  function redrawPickerDeck() {
    ui.pickerGrid.innerHTML = "";
    pickerOrder.forEach((mapItem) => ui.pickerGrid.appendChild(drawPicker(mapItem)));

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

    const cap = pickCap();
    const already = staged.has(id);
    if (!already && staged.size >= cap) return;
    staged.has(id) ? staged.delete(id) : staged.add(id);
    redrawPickerDeck();
    syncPickerHUD();
    persistDraft();
  }

  function syncPickerHUD() {

    const cap = pickCap();

    ui.counter.textContent = `${staged.size} / ${cap} maps staged`;
    ui.go.disabled = staged.size !== cap;

  }

  function persistDraft() {

    persistCfg({
      team1Name: ui.t1.value,
      team2Name: ui.t2.value,

      vetoFormat: ui.fmt.value,

      poolSize: capValue(),

      bestOf: bestValue(),

      selectedIds: [...staged],

      filters: ui.filters ? filterPacket(ui.filters) : {},

      bothFlow: readCfg().bothFlow || bothHints(),
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

    // Bo3: (poolLen − 3) bans and 2 picks before decider — interleave as
    // Ban, Ban, Pick, Pick, then any remaining bans (7 maps → B,B,P,P,B,B, decider).
    // banSeed / pickSeed come from rotations(fmt) — ESL default 0,0; HLTV 1,1; FACEIT 0,1.
    if (bo === 3) {
      const banLen = Math.max(poolLen - 3, 0);
      const firstBanCount = Math.min(2, banLen);
      const lastBanCount = Math.max(banLen - 2, 0);
      return [
        ...bans(firstBanCount, banSeed),
        ...picks(2, pickSeed),
        ...bans(lastBanCount, (banSeed + firstBanCount) % 2),
        { type: "decider" },
      ];
    }

    return [...bans(Math.max(poolLen - bo, 0), banSeed), ...picks(bo, pickSeed)];
  }

  function targetCount(fmt, bo) {
    return fmt === "veto3_random" ? 1 : bo;

  }

  function label(teamIdx) {

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
    };

    return snapshot;
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

  function finalizeLottery(snapshot) {

    if (!snapshot.remaining.length) return;

    const choiceId = snapshot.remaining[Math.floor(Math.random() * snapshot.remaining.length)];

    snapshot.remaining.forEach((slug) => {
      snapshot.statuses[slug] = slug === choiceId ? "picked" : "banned";
    });

    snapshot.picks.push(choiceId);
    snapshot.logs.push(`RNG sealed ${title(choiceId)}`);
    snapshot.remaining = [];
  }

  function finalizeDecider(snapshot) {

    if (snapshot.remaining.length !== 1) return;

    const solo = snapshot.remaining.pop();
    snapshot.picks.push(solo);
    snapshot.statuses[solo] = "picked";
    snapshot.logs.push(`Decider keeps ${title(solo)}`);
  }

  function seizeLast(snapshot) {

    const lastId = snapshot.remaining.pop();
    if (!lastId) return;
    snapshot.picks.push(lastId);
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
    if (base.done) openResults(base);

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
    chain = [{ remaining: [], picks: [], logs: [], pointer: 0, statuses: {}, done: false }];
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
    if (canAct && cue.type === "ban") preview.innerHTML = `<span class="ban">✕</span>`;
    if (canAct && cue.type === "pick") preview.innerHTML = `<span class="pick">✔</span>`;

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
  }

  function summarizePayload(built, journal) {

    let sidesWrap = null;
    let roster = null;
    try {
      sidesWrap = JSON.parse(localStorage.getItem("cs-tools-teams") || "{}").sides || null;

      roster = JSON.parse(localStorage.getItem("cs-tools-teams") || "{}").players || null;

    } catch (_) {
      sidesWrap = null;
    }

    return {

      team1Name: ui.t1.value,
      team2Name: ui.t2.value,

      maps: built.map((slugEntry) => ({ id: slugEntry, name: title(slugEntry) })),

      history: journal,

      sides: sidesWrap,

      roster,

      bothMode: Boolean(readCfg().bothFlow || bothHints()),
    };

  }

  function openResults(snapshot) {
    const payload = summarizePayload(snapshot.picks, snapshot.logs.slice());
    if (payload.bothMode) sessionStorage.setItem(SUMMARY_KEY, JSON.stringify(payload));
    else sessionStorage.removeItem(SUMMARY_KEY);

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
    snapshot.picks.forEach((slugWrap, ordinal) =>
      stackMount.appendChild(bigCard(slugWrap, ordinal + 1)),
    );
    overlay.querySelector("#ledger").textContent = snapshot.logs.slice(-320).join("\n");
    overlay.querySelector("#cta").addEventListener("click", () => {
      overlay.remove();
      window.location.href = payload.bothMode ? "match-summary.html" : "index.html";

    });

  }

  function bigCard(id, slot) {

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
    captionNode.textContent = `${slot}. ${title(id)}`;
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
    faux.logs.push(`RNG pulled ${pickedSubset.map((slugLabel) => title(slugLabel)).join(", ")}`);
    faux.done = true;

    meta.format = meta.format || "random_pick";

    persistVeto(faux);

    persistDraft();

    openResults(faux);
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
    if (chain[cursorIdx].done) openResults(chain[cursorIdx]);

  }

  function resetToPicker(question) {

    if (question !== false && !confirm("Discard veto progression?")) return;
    ui.vetoPanel.classList.add("substate-hidden");
    ui.pickPanel.classList.remove("substate-hidden");

    wipeVeto();
    hydrateAtlas().then(deck.bind(null, ui.filters));

  }

  function hydratePicker(cfg) {

    ui.t1.value = cfg.team1Name;
    ui.t2.value = cfg.team2Name;
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
        const ctl = ui.filters.elements.namedItem(fname);
        if (ctl && ctl.value !== undefined) ctl.value = payload;
      });

    }

  }

  async function bootstrap() {

    window.CSToolsNav?.init(".site-menu");
    ui.pickPanel = document.getElementById("panel-selection");
    ui.vetoPanel = document.getElementById("panel-veto");
    ui.turn = document.getElementById("turn-label");

    ui.history = document.getElementById("history-list");
    ui.vetoDeck = document.getElementById("veto-grid");
    ui.pickerGrid = document.getElementById("picker-grid");
    ui.counter = document.getElementById("picker-count-banner");
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

    const filterRoot = document.getElementById("picker-filters");
    buildFilters(filterRoot);
    ui.filters = filterRoot;

    ui.undo?.addEventListener("click", undoSnap);
    ui.redo?.addEventListener("click", redoSnap);
    document.getElementById("reset-veto")?.addEventListener("click", () => resetToPicker(true));

    document.getElementById("back-to-picker")?.addEventListener("click", () => resetToPicker(true));

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

    await hydrateAtlas();
    await hydrateSelects(ui.filters);
    const cfgDraft = readCfg();
    hydratePicker(cfgDraft);
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
  }

  if (document.readyState === `loading`)

    document.addEventListener(`DOMContentLoaded`, bootstrap);

  else bootstrap();
})();
