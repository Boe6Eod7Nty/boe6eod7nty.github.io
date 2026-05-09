(function () {
  "use strict";

  const DATA_URL = "data/maps.json";
  const OFFLINE_GLOBAL_KEY = "CSToolsMapsData";
  const MODE_ALIASES = {
    hostage: ["hostage", "hostage_rescue"],
    hostage_rescue: ["hostage", "hostage_rescue"],
  };

  let mapsCache = null;
  let mapsById = null;

  function normalizeText(value) {
    return String(value || "").trim().toLowerCase();
  }

  function getYear(map) {
    const match = String(map.added_date || "").match(/^\d{4}/);
    return match ? match[0] : "";
  }

  function hasTag(map, tag) {
    const acceptedTags = MODE_ALIASES[tag] || [tag];
    return acceptedTags.some((candidate) => map.tags.includes(candidate));
  }

  function sortMaps(maps, sortBy) {
    const sorted = [...maps];

    switch (sortBy) {
      case "oldest":
        return sorted.sort((a, b) => String(a.added_date || "").localeCompare(String(b.added_date || "")));
      case "az":
        return sorted.sort((a, b) => a.name.localeCompare(b.name));
      case "za":
        return sorted.sort((a, b) => b.name.localeCompare(a.name));
      case "newest":
      default:
        return sorted.sort((a, b) => String(b.added_date || "").localeCompare(String(a.added_date || "")));
    }
  }

  function isActiveDuty(map) {
    return map.tags && map.tags.includes("active_duty");
  }

  /** Matches version badges: official CS2 or workshop CS2* port; also honors in_cs2 for active pool maps. */
  function isCs2CompatibleMap(map) {
    const versions = Array.isArray(map?.versions) ? map.versions : [];
    if (versions.includes("CS2") || versions.includes("CS2*")) return true;
    if (map && map.in_cs2 === true) return true;
    return false;
  }

  function parseCs2OnlyFlag(filters) {
    if (!Object.prototype.hasOwnProperty.call(filters, "cs2Only")) return false;
    const raw = filters.cs2Only;
    if (raw == null || raw === "") return false;
    const v = String(raw).trim().toLowerCase();
    if (v === "0" || v === "false" || v === "off" || v === "no") return false;
    return true;
  }

  function sortMapsChooser(maps, sortWithin = "newest") {
    const duty = maps.filter(isActiveDuty);
    const rest = maps.filter((m) => !isActiveDuty(m));
    return [...sortMaps(duty, sortWithin), ...sortMaps(rest, sortWithin)];
  }

  function thumbnailUrl(map) {
    if (map.thumbnail) {
      return map.thumbnail;
    }
    return null;
  }

  function normalizeMap(map) {
    return {
      ...map,
      versions: Array.isArray(map.versions) ? map.versions : [],
      workshop_links: Array.isArray(map.workshop_links) ? map.workshop_links : [],
      tags: Array.isArray(map.tags) ? map.tags : [],
      thumbnail:
        map.thumbnail == null || (typeof map.thumbnail === "string" && map.thumbnail.trim() === "")
          ? null
          : map.thumbnail,
    };
  }

  function readOfflineMaps() {
    const candidate = window[OFFLINE_GLOBAL_KEY];
    if (Array.isArray(candidate)) {
      return candidate;
    }
    return null;
  }

  async function loadMaps() {
    if (mapsCache) {
      return mapsCache;
    }

    let maps = null;

    if (window.location?.protocol === "file:") {
      maps = readOfflineMaps();
    }

    if (!maps) {
      try {
        const response = await fetch(DATA_URL);
        if (!response.ok) {
          throw new Error(`Unable to load map data: ${response.status} ${response.statusText}`);
        }
        maps = await response.json();
      } catch (error) {
        maps = readOfflineMaps();
        if (!maps) {
          const hint =
            window.location?.protocol === "file:"
              ? "You're opening this page directly from disk (file://). Include data/maps-data.js, or run a local server."
              : "Try reloading, or ensure data/maps.json is accessible.";
          throw new Error(`Unable to load map data. ${hint} (${String(error && error.message ? error.message : error)})`);
        }
      }
    }

    mapsCache = maps.map(normalizeMap);
    mapsById = new Map(mapsCache.map((map) => [map.id, map]));

    return mapsCache;
  }

  async function getAllMaps() {
    return loadMaps();
  }

  async function getMapById(id) {
    await loadMaps();
    return mapsById.get(id) || null;
  }

  async function filterMaps(filters = {}) {
    const maps = await loadMaps();
    const search = normalizeText(filters.search);

    const toList = (value) => {
      if (value == null) return [];
      if (Array.isArray(value)) return value.map(String).filter(Boolean);
      const raw = String(value).trim();
      if (!raw) return [];
      if (raw === "all") return ["all"];
      return raw
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean);
    };

    const hasAny = (list, matcher) => {
      if (!list.length || list.includes("all")) return true;
      return list.some(matcher);
    };

    const versionList = toList(filters.version);
    const modeList = toList(filters.mode);
    const yearList = toList(filters.year);
    const operationList = toList(filters.operation);
    const poolList = toList(filters.poolStatus);
    const cs2Only = parseCs2OnlyFlag(filters);

    const filtered = maps.filter((map) => {
      if (search && !normalizeText(map.name).includes(search)) {
        return false;
      }

      if (cs2Only && !isCs2CompatibleMap(map)) {
        return false;
      }

      if (!hasAny(versionList, (v) => map.versions.includes(v))) {
        return false;
      }

      if (!hasAny(modeList, (m) => hasTag(map, m))) {
        return false;
      }

      if (!hasAny(yearList, (y) => getYear(map) === String(y))) {
        return false;
      }

      if (!hasAny(operationList, (op) => hasTag(map, op))) {
        return false;
      }

      if (!hasAny(poolList, (p) => hasTag(map, p))) {
        return false;
      }

      if (typeof filters.inCs2 === "boolean" && map.in_cs2 !== filters.inCs2) {
        return false;
      }

      return true;
    });

    return sortMaps(filtered, filters.sortBy || "newest");
  }

  async function getAvailableYears() {
    const maps = await loadMaps();
    return [...new Set(maps.map(getYear).filter(Boolean))].sort((a, b) => b.localeCompare(a));
  }

  async function getAvailableOperations() {
    const maps = await loadMaps();
    const operationTags = maps.flatMap((map) => map.tags.filter((tag) => tag.startsWith("operation_")));
    return [...new Set(operationTags)].sort();
  }

  async function getAvailableVersions() {
    const maps = await loadMaps();
    const versions = maps.flatMap((map) => map.versions || []);
    return [...new Set(versions)].sort();
  }

  window.CSToolsMaps = {
    filterMaps,
    getAllMaps,
    getAvailableOperations,
    getAvailableVersions,
    getAvailableYears,
    getMapById,
    isActiveDuty,
    sortMaps,
    sortMapsChooser,
    thumbnailUrl,
  };
})();
