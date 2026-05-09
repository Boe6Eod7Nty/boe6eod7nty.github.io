#!/usr/bin/env python3
"""
CS Tools — Map Data Intake Script
Converts a CSV file of map data into maps.json format.

Usage:
    python csv_to_maps.py input.csv
    python csv_to_maps.py input.csv --output maps.json
    python csv_to_maps.py input.csv --merge       # merge into existing maps.json
    python csv_to_maps.py --template              # print a blank CSV template row

CSV Column Reference (in order):
    id              - Snake_case map identifier, e.g. de_dust2
    name            - Display name, e.g. "Dust II"
    versions        - Pipe-separated game versions the map appeared in
                      Canonical values: CS | CSS | CS:CZ | CS:GO | CS2
                      Aliases accepted: CS1.6 -> CS, CS:S -> CSS
                      Example: CS|CSS|CS:GO|CS2
    added_date      - Date the map was officially added. Format: YYYY-MM-DD
                      Use YYYY-01-01 if only year is known.
    in_cs2          - true / false
    cs2_type        - How it exists in CS2: official | community | none
    workshop_links  - Pipe-separated full Steam Workshop URLs (can be empty)
                      Example: https://steamcommunity.com/sharedfiles/filedetails/?id=123|https://...
    tags            - Pipe-separated tags (see TAG REFERENCE below)
    thumbnail       - Relative path from cs-tools/ root
                      Example: images/maps/de_dust2.jpg  (leave blank if no image yet)
    notes           - Optional freeform notes string (can be empty)

TAG REFERENCE (use exactly these strings):
  Game Modes:
    bomb_defusal, hostage, wingman, arms_race, deathmatch, demolition
  Format:
    5v5, 3v3, 2v2, 1v1
  Active / Pool Status:
    active_duty, competitive_pool, former_competitive_pool, official_casual, workshop_only
  CS2 Presence:
    in_cs2_official, in_cs2_community, cs2_unplayable
  Operations (add more as needed):
    operation_bloodhound, operation_riptide, operation_broken_fang,
    operation_wildfire, operation_hydra, operation_vanguard,
    operation_phoenix, operation_bravo, operation_payback,
    operation_shattered_web, operation_riptide, operation_cs2_armory
  History:
    has_been_competitive, classic_map, valve_original, valve_remake, community_classic
"""

import csv
import json
import sys
import os
import copy
from datetime import datetime

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

VERSION_ALIASES = {
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

# Canonical values consumed by the website/app.
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

TEMPLATE_ROW = {
    "id": "de_example",
    "name": "Example Map",
    "versions": "CS|CSS|CS:GO|CS2",
    "added_date": "2015-09-17",
    "in_cs2": "true",
    "cs2_type": "official",
    "workshop_links": "",
    "tags": "bomb_defusal|5v5|active_duty|competitive_pool",
    "thumbnail": "images/maps/de_example.jpg",
    "notes": "",
}

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def split_pipe(value: str) -> list[str]:
    """Split a pipe-separated string into a cleaned list, ignoring empty parts."""
    return [v.strip() for v in value.split("|") if v.strip()]


def parse_bool(value: str) -> bool:
    return value.strip().lower() in ("true", "yes", "1", "y")


def validate_versions(versions: list[str], row_id: str) -> list[str]:
    bad = [v for v in versions if v not in VALID_VERSIONS]
    if bad:
        print(f"  [WARN] {row_id}: Unknown version(s): {bad}. Valid: {sorted(VALID_VERSIONS)}")
    return versions


def validate_date(date_str: str, row_id: str) -> str:
    date_str = date_str.strip()
    if not date_str:
        return ""
    try:
        datetime.strptime(date_str, "%Y-%m-%d")
        return date_str
    except ValueError:
        # Try year-only
        try:
            datetime.strptime(date_str, "%Y")
            print(f"  [INFO] {row_id}: Year-only date '{date_str}', storing as {date_str}-01-01")
            return f"{date_str}-01-01"
        except ValueError:
            print(f"  [WARN] {row_id}: Could not parse date '{date_str}'. Storing raw.")
            return date_str


def normalize_versions(raw_versions: list[str]) -> list[str]:
    normalized: list[str] = []
    for v in raw_versions:
        key = v.strip().lower()
        normalized.append(VERSION_ALIASES.get(key, v.strip()))
    seen = set()
    deduped: list[str] = []
    for v in normalized:
        if not v or v in seen:
            continue
        seen.add(v)
        deduped.append(v)
    return deduped


def row_to_map(row: dict) -> dict:
    """Convert a single CSV row dict into a map JSON object."""
    row_id = row.get("id", "unknown").strip()

    versions = normalize_versions(split_pipe(row.get("versions", "")))
    validate_versions(versions, row_id)

    workshop_links = split_pipe(row.get("workshop_links", ""))
    tags = split_pipe(row.get("tags", ""))
    thumbnail = row.get("thumbnail", "").strip()
    notes = row.get("notes", "").strip()

    cs2_type = row.get("cs2_type", "none").strip().lower()
    if cs2_type not in ("official", "community", "none"):
        print(f"  [WARN] {row_id}: cs2_type '{cs2_type}' is not official/community/none.")

    map_obj = {
        "id": row_id,
        "name": row.get("name", "").strip(),
        "versions": versions,
        "added_date": validate_date(row.get("added_date", ""), row_id),
        "in_cs2": parse_bool(row.get("in_cs2", "false")),
        "cs2_type": cs2_type,
        "workshop_links": workshop_links,
        "tags": tags,
        "thumbnail": thumbnail if thumbnail else None,
        "notes": notes if notes else None,
    }
    return map_obj


# ---------------------------------------------------------------------------
# Core operations
# ---------------------------------------------------------------------------

def load_csv(path: str) -> list[dict]:
    maps = []
    print(f"\nReading: {path}")
    with open(path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)

        # Validate headers
        missing = [c for c in CSV_COLUMNS if c not in reader.fieldnames]
        if missing:
            print(f"  [WARN] CSV is missing columns: {missing}")
            print(f"         Expected columns: {CSV_COLUMNS}")
            print(f"         Found columns:    {list(reader.fieldnames)}")

        for i, row in enumerate(reader, start=2):  # row 1 = header
            if not row.get("id", "").strip():
                print(f"  [SKIP] Row {i}: empty id, skipping.")
                continue
            try:
                maps.append(row_to_map(row))
            except Exception as e:
                print(f"  [ERROR] Row {i} ({row.get('id', '?')}): {e}")
    print(f"  Parsed {len(maps)} map(s).")
    return maps


def merge_maps(existing: list[dict], incoming: list[dict]) -> tuple[list[dict], int, int]:
    """
    Merge incoming maps into existing list.
    Existing maps are updated in-place; new maps are appended.
    Returns (merged_list, updated_count, added_count).
    """
    index = {m["id"]: i for i, m in enumerate(existing)}
    updated = 0
    added = 0
    result = copy.deepcopy(existing)

    for new_map in incoming:
        mid = new_map["id"]
        if mid in index:
            result[index[mid]] = new_map
            updated += 1
        else:
            result.append(new_map)
            index[mid] = len(result) - 1
            added += 1

    return result, updated, added


def write_json(maps: list[dict], path: str) -> None:
    with open(path, "w", encoding="utf-8") as f:
        json.dump(maps, f, indent=2, ensure_ascii=False)
    print(f"\nWrote {len(maps)} map(s) to: {path}")


def write_js_fallback(maps: list[dict], json_path: str) -> None:
    """Write a file:// friendly JS fallback next to the JSON output."""
    out_dir = os.path.dirname(os.path.abspath(json_path)) or "."
    js_path = os.path.join(out_dir, "maps-data.js")
    payload = json.dumps(maps, indent=2, ensure_ascii=False)
    with open(js_path, "w", encoding="utf-8") as f:
        f.write("/* Generated file. Do not edit by hand. */\n")
        f.write("window.CSToolsMapsData = ")
        f.write(payload)
        f.write(";\n")
    print(f"Wrote JS fallback to: {js_path}")

def print_template() -> None:
    print("\nCSV Template — copy this as your header + example row:\n")
    print(",".join(CSV_COLUMNS))
    print(",".join(TEMPLATE_ROW[c] for c in CSV_COLUMNS))
    print("\nColumn notes:")
    print("  versions, workshop_links, tags  → pipe-separated  (e.g. CS:GO|CS2)")
    print("  in_cs2                          → true or false")
    print("  cs2_type                        → official | community | none")
    print("  added_date                      → YYYY-MM-DD  (YYYY alone also accepted)\n")


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main() -> None:
    args = sys.argv[1:]

    if "--template" in args or "-t" in args:
        print_template()
        return

    if not args:
        print(__doc__)
        print("\nUsage:")
        print("  python csv_to_maps.py input.csv")
        print("  python csv_to_maps.py input.csv --output maps.json")
        print("  python csv_to_maps.py input.csv --merge")
        print("  python csv_to_maps.py --template")
        sys.exit(1)

    csv_path = args[0]
    do_merge = "--merge" in args or "-m" in args

    # Determine output path
    output_path = "maps.json"
    if "--output" in args:
        idx = args.index("--output")
        output_path = args[idx + 1]
    elif "-o" in args:
        idx = args.index("-o")
        output_path = args[idx + 1]

    if not os.path.isfile(csv_path):
        print(f"[ERROR] File not found: {csv_path}")
        sys.exit(1)

    incoming = load_csv(csv_path)

    if do_merge and os.path.isfile(output_path):
        print(f"\nMerging into existing: {output_path}")
        with open(output_path, encoding="utf-8") as f:
            existing = json.load(f)
        merged, updated, added = merge_maps(existing, incoming)
        print(f"  Updated: {updated}  |  Added: {added}  |  Total: {len(merged)}")
        write_json(merged, output_path)
        write_js_fallback(merged, output_path)
    else:
        if do_merge:
            print(f"  [INFO] --merge specified but {output_path} not found. Writing fresh.")
        write_json(incoming, output_path)
        write_js_fallback(incoming, output_path)


if __name__ == "__main__":
    main()
