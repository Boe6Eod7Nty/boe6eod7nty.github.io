#!/usr/bin/env python3
"""
CS Tools — Merge Map CSV into existing JSON

This script ingests a CSV of map metadata and merges it into an existing
`maps.json` WITHOUT clearing old entries.

Stable key:
  - Uses `id` when present.
  - If `id` is blank but `name` exists, derives an id from the name (lowercase
    snake_case) and prints a warning. (Recommended: always provide `id`.)

Merge behavior (for existing ids):
  - Only overwrites a field if the CSV cell is non-empty.
  - For list fields (versions/tags/workshop_links): non-empty replaces the list;
    empty keeps existing.
  - For booleans: blank keeps existing; otherwise parsed from true/false-like values.
  - This script does NOT clear fields (blank never deletes existing data).

Ordering:
  - Default: preserve existing order, append new maps at the end.
  - Optional: `--sort name,id` for deterministic sort.

Outputs:
  - Writes merged JSON.
  - Regenerates `maps-data.js` next to the JSON output (same format as `csv_to_maps.py`).

Examples:
  python cs-tools/data/merge_maps_csv.py cs-tools/data/new-map-data.csv
  python cs-tools/data/merge_maps_csv.py input.csv --json cs-tools/data/maps.json
  python cs-tools/data/merge_maps_csv.py input.csv --out-json cs-tools/data/maps.json --out-js cs-tools/data/maps-data.js
  python cs-tools/data/merge_maps_csv.py input.csv --sort name,id
"""

from __future__ import annotations

import argparse
import copy
import csv
import json
import os
import re
from datetime import datetime

VERSION_ALIASES: dict[str, str] = {
    "cs1.6": "CS",
    "cs 1.6": "CS",
    "cs": "CS",
    "cs:s": "CSS",
    "cs:source": "CSS",
    "css": "CSS",
    "cs:cz": "CS:CZ",
    "cz": "CS:CZ",
    "cs:go": "CS:GO",
    "csgo": "CS:GO",
    "cs2": "CS2",
}

VALID_VERSIONS = {"CS", "CSS", "CS:CZ", "CS:GO", "CS2"}

CSV_COLUMNS = [
    "id",
    "name",
    "versions",
    "added_date",
    "in_cs2",
    "cs2_type",
    "workshop_links",
    "tags",
    "thumbnail",
    "notes",
]


def split_pipe(value: str) -> list[str]:
    return [v.strip() for v in str(value or "").split("|") if v.strip()]


def normalize_versions(raw_versions: list[str]) -> list[str]:
    normalized: list[str] = []
    for v in raw_versions:
        key = v.strip().lower()
        normalized.append(VERSION_ALIASES.get(key, v.strip()))
    seen: set[str] = set()
    out: list[str] = []
    for v in normalized:
        if not v or v in seen:
            continue
        seen.add(v)
        out.append(v)
    return out


def validate_versions(versions: list[str], row_id: str) -> None:
    bad = [v for v in versions if v not in VALID_VERSIONS]
    if bad:
        print(f"  [WARN] {row_id}: Unknown version(s): {bad}. Valid: {sorted(VALID_VERSIONS)}")


def parse_bool_or_none(value: str) -> bool | None:
    s = str(value or "").strip().lower()
    if not s:
        return None
    if s in ("true", "yes", "1", "y"):
        return True
    if s in ("false", "no", "0", "n"):
        return False
    print(f"  [WARN] Could not parse boolean '{value}', treating as blank (keep existing).")
    return None


def validate_date(date_str: str, row_id: str) -> str:
    date_str = str(date_str or "").strip()
    if not date_str:
        return ""
    try:
        datetime.strptime(date_str, "%Y-%m-%d")
        return date_str
    except ValueError:
        try:
            datetime.strptime(date_str, "%Y")
            print(f"  [INFO] {row_id}: Year-only date '{date_str}', storing as {date_str}-01-01")
            return f"{date_str}-01-01"
        except ValueError:
            print(f"  [WARN] {row_id}: Could not parse date '{date_str}'. Storing raw.")
            return date_str


_NON_ALNUM = re.compile(r"[^a-z0-9]+")


def derive_id_from_name(name: str) -> str:
    base = _NON_ALNUM.sub("_", name.strip().lower()).strip("_")
    return base or "unknown_map"


def read_existing_json(path: str) -> list[dict]:
    if not os.path.isfile(path):
        return []
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    if not isinstance(data, list):
        raise ValueError(f"Existing JSON must be a list of maps: {path}")
    return data


def load_csv_rows(path: str) -> list[dict]:
    print(f"\nReading CSV: {path}")
    with open(path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        missing = [c for c in CSV_COLUMNS if c not in (reader.fieldnames or [])]
        if missing:
            print(f"  [WARN] CSV is missing columns: {missing}")
            print(f"         Expected columns: {CSV_COLUMNS}")
            print(f"         Found columns:    {list(reader.fieldnames or [])}")
        return list(reader)


def row_to_partial_map(row: dict, row_num: int) -> dict:
    raw_id = str(row.get("id", "") or "").strip()
    name = str(row.get("name", "") or "").strip()

    if not raw_id and name:
        raw_id = derive_id_from_name(name)
        print(f"  [WARN] Row {row_num}: blank id; derived id '{raw_id}' from name '{name}'.")

    if not raw_id:
        raise ValueError("empty id and name")

    out: dict = {"id": raw_id}

    if name:
        out["name"] = name

    raw_versions = str(row.get("versions", "") or "").strip()
    if raw_versions:
        versions = normalize_versions(split_pipe(raw_versions))
        validate_versions(versions, raw_id)
        out["versions"] = versions

    raw_added = str(row.get("added_date", "") or "").strip()
    if raw_added:
        out["added_date"] = validate_date(raw_added, raw_id)

    raw_in_cs2 = row.get("in_cs2", "")
    parsed_in_cs2 = parse_bool_or_none(raw_in_cs2)
    if parsed_in_cs2 is not None:
        out["in_cs2"] = parsed_in_cs2

    raw_cs2_type = str(row.get("cs2_type", "") or "").strip()
    if raw_cs2_type:
        cs2_type = raw_cs2_type.lower()
        if cs2_type not in ("official", "community", "none"):
            print(f"  [WARN] {raw_id}: cs2_type '{cs2_type}' is not official/community/none.")
        out["cs2_type"] = cs2_type

    raw_workshop = str(row.get("workshop_links", "") or "").strip()
    if raw_workshop:
        out["workshop_links"] = split_pipe(raw_workshop)

    raw_tags = str(row.get("tags", "") or "").strip()
    if raw_tags:
        out["tags"] = split_pipe(raw_tags)

    raw_thumb = str(row.get("thumbnail", "") or "").strip()
    if raw_thumb:
        out["thumbnail"] = raw_thumb

    raw_notes = str(row.get("notes", "") or "").strip()
    if raw_notes:
        out["notes"] = raw_notes

    return out


def merge_one(existing: dict, incoming_partial: dict) -> dict:
    merged = copy.deepcopy(existing)
    for k, v in incoming_partial.items():
        if k == "id":
            continue
        merged[k] = v

    # Keep parity with existing schema: thumbnail/notes often stored as null.
    # If not set anywhere, keep existing value as-is.
    return merged


def ensure_schema_defaults(map_obj: dict) -> dict:
    out = copy.deepcopy(map_obj)
    out.setdefault("versions", [])
    out.setdefault("added_date", "")
    out.setdefault("in_cs2", False)
    out.setdefault("cs2_type", "none")
    out.setdefault("workshop_links", [])
    out.setdefault("tags", [])
    out.setdefault("thumbnail", None)
    out.setdefault("notes", None)
    return out


def write_json(maps: list[dict], path: str) -> None:
    with open(path, "w", encoding="utf-8") as f:
        json.dump(maps, f, indent=2, ensure_ascii=False)
    print(f"Wrote {len(maps)} map(s) to: {path}")


def write_js(maps: list[dict], path: str) -> None:
    payload = json.dumps(maps, indent=2, ensure_ascii=False)
    with open(path, "w", encoding="utf-8") as f:
        f.write("/* Generated file. Do not edit by hand. */\n")
        f.write("window.CSToolsMapsData = ")
        f.write(payload)
        f.write(";\n")
    print(f"Wrote JS fallback to: {path}")


def parse_sort(value: str) -> str | None:
    v = (value or "").strip().lower()
    if not v:
        return None
    if v in ("name,id", "name", "name_id"):
        return "name,id"
    raise ValueError("Unsupported --sort. Use: name,id")


def main() -> None:
    parser = argparse.ArgumentParser(description="Merge a map CSV into existing maps.json without dropping old entries.")
    parser.add_argument("csv", help="Input CSV path")
    parser.add_argument("--json", dest="json_in", default=os.path.join(os.path.dirname(__file__), "maps.json"), help="Existing JSON path (default: cs-tools/data/maps.json)")
    parser.add_argument("--out-json", default=None, help="Output JSON path (default: same as --json)")
    parser.add_argument("--out-js", default=None, help="Output JS path (default: next to output json as maps-data.js)")
    parser.add_argument("--sort", default="", type=parse_sort, help="Optional sort. Supported: name,id")
    args = parser.parse_args()

    json_in = args.json_in
    out_json = args.out_json or json_in
    out_js = args.out_js or os.path.join(os.path.dirname(os.path.abspath(out_json)) or ".", "maps-data.js")

    existing = read_existing_json(json_in)
    existing_index = {m.get("id"): i for i, m in enumerate(existing) if isinstance(m, dict) and m.get("id")}

    rows = load_csv_rows(args.csv)
    incoming_partials: list[dict] = []
    for i, row in enumerate(rows, start=2):
        try:
            incoming_partials.append(row_to_partial_map(row, i))
        except Exception as e:
            print(f"  [SKIP] Row {i}: {e}")

    merged = copy.deepcopy(existing)
    updated = 0
    added = 0

    for inc in incoming_partials:
        mid = inc["id"]
        if mid in existing_index:
            idx = existing_index[mid]
            merged[idx] = ensure_schema_defaults(merge_one(merged[idx], inc))
            updated += 1
        else:
            merged.append(ensure_schema_defaults(inc))
            existing_index[mid] = len(merged) - 1
            added += 1

    if args.sort == "name,id":
        merged.sort(key=lambda m: (str(m.get("name") or "").lower(), str(m.get("id") or "").lower()))

    print(f"\nMerged. Updated: {updated} | Added: {added} | Total: {len(merged)}")
    write_json(merged, out_json)
    write_js(merged, out_js)


if __name__ == "__main__":
    main()

