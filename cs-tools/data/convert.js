const fs = require("fs");

const VERSION_ALIASES = {
  "cs1.6": "CS",
  "cs 1.6": "CS",
  cs: "CS",
  "cs:s": "CSS",
  "cs:source": "CSS",
  css: "CSS",
  "cs:cz": "CS:CZ",
  cz: "CS:CZ",
  "cs:go": "CS:GO",
  csgo: "CS:GO",
  cs2: "CS2",
};

function parseCsvLine(line) {
  const out = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      const next = line[i + 1];
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }

    if (!inQuotes && ch === ",") {
      out.push(current);
      current = "";
      continue;
    }

    current += ch;
  }

  out.push(current);
  return out;
}

function splitPipe(value) {
  return String(value || "")
    .split("|")
    .map((v) => v.trim())
    .filter(Boolean);
}

function normalizeVersions(versions) {
  const mapped = versions.map((v) => VERSION_ALIASES[String(v).trim().toLowerCase()] || String(v).trim());
  return [...new Set(mapped.filter(Boolean))];
}

function normalizeAddedDate(value) {
  const trimmed = String(value || "").trim();
  if (/^\d{4}$/.test(trimmed)) return `${trimmed}-01-01`;
  return trimmed;
}

function parseBool(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes" || normalized === "y";
}

const inputPath = process.argv[2] || "new-map-data.csv";
const csv = fs.readFileSync(inputPath, "utf8").trim().split(/\r?\n/);
const headers = parseCsvLine(csv[0]).map((h) => h.trim());

const maps = [];
for (let i = 1; i < csv.length; i++) {
  const vals = parseCsvLine(csv[i]);
  const row = {};
  headers.forEach((h, j) => (row[h] = vals[j] || ""));

  maps.push({
    id: String(row.id || "").trim(),
    name: String(row.name || "").trim(),
    versions: normalizeVersions(splitPipe(row.versions)),
    added_date: normalizeAddedDate(row.added_date),
    in_cs2: parseBool(row.in_cs2),
    cs2_type: String(row.cs2_type || "").trim() || "none",
    workshop_links: splitPipe(row.workshop_links),
    tags: splitPipe(row.tags),
    thumbnail: String(row.thumbnail || "").trim() || null,
    notes: String(row.notes || "").trim() || null,
  });
}

const jsonOutPath = "../data/maps.json";
const jsOutPath = "../data/maps-data.js";

fs.writeFileSync(jsonOutPath, JSON.stringify(maps, null, 2));
fs.writeFileSync(
  jsOutPath,
  `/* Generated file. Do not edit by hand. */\nwindow.CSToolsMapsData = ${JSON.stringify(maps, null, 2)};\n`,
);
console.log("Wrote " + maps.length + " maps");
