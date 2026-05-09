"""
One-shot script to update map pool tags in maps.json and regenerate maps-data.js.

Schema notes:
- Pool / status is encoded via the `tags` array on each map entry.
- Recognised pool tags (per cs-tools/js/browse-maps.js + map-modal.js):
    - active_duty
    - competitive_pool
    - former_competitive_pool
    - workshop_only

Target sets (per user request):
- Active Duty (exactly 7):
    de_ancient, de_anubis, de_overpass, de_inferno, de_mirage, de_dust2, de_nuke
- Competitive rotation = active duty + 8 more:
    de_train, de_vertigo, de_cache, de_warden, de_stronghold, de_alpine,
    cs_office, cs_italy

Active duty maps also receive the `competitive_pool` tag so that filtering by
"Competitive Pool" in the UI returns the full 15-map rotation.
"""

import json
import os

ROOT = os.path.dirname(os.path.abspath(__file__))
JSON_PATH = os.path.join(ROOT, "maps.json")
JS_PATH = os.path.join(ROOT, "maps-data.js")

ACTIVE_DUTY_IDS = {
    "de_ancient",
    "de_anubis",
    "de_overpass",
    "de_inferno",
    "de_mirage",
    "de_dust2",
    "de_nuke",
}

EXTRA_COMPETITIVE_IDS = {
    "de_train",
    "de_vertigo",
    "de_cache",
    "de_warden",
    "de_stronghold",
    "de_alpine",
    "cs_office",
    "cs_italy",
}

COMPETITIVE_IDS = ACTIVE_DUTY_IDS | EXTRA_COMPETITIVE_IDS

POOL_TAGS = {"active_duty", "competitive_pool", "former_competitive_pool", "workshop_only"}

NEW_MAPS = [
    {
        "id": "de_warden",
        "name": "Warden",
        "versions": ["CS2"],
        "added_date": "2025-01-01",
        "in_cs2": True,
        "cs2_type": "community",
        "workshop_links": [],
        "tags": ["bomb_defusal", "5v5"],
        "thumbnail": None,
        "notes": "Added to competitive rotation",
    },
    {
        "id": "de_stronghold",
        "name": "Stronghold",
        "versions": ["CS2"],
        "added_date": "2025-01-01",
        "in_cs2": True,
        "cs2_type": "community",
        "workshop_links": [],
        "tags": ["bomb_defusal", "5v5"],
        "thumbnail": None,
        "notes": "Added to competitive rotation",
    },
    {
        "id": "de_alpine",
        "name": "Alpine",
        "versions": ["CS2"],
        "added_date": "2025-01-01",
        "in_cs2": True,
        "cs2_type": "community",
        "workshop_links": [],
        "tags": ["bomb_defusal", "5v5"],
        "thumbnail": None,
        "notes": "Added to competitive rotation",
    },
]


def desired_pool_tags(map_id):
    """Return the set of pool tags this map should have given the new spec."""
    tags = set()
    if map_id in ACTIVE_DUTY_IDS:
        tags.add("active_duty")
    if map_id in COMPETITIVE_IDS:
        tags.add("competitive_pool")
    return tags


def update_tags(map_entry):
    existing = list(map_entry.get("tags", []) or [])
    non_pool = [t for t in existing if t not in POOL_TAGS]
    desired = desired_pool_tags(map_entry["id"])

    new_tags = list(non_pool)
    for tag in ("active_duty", "competitive_pool"):
        if tag in desired:
            new_tags.append(tag)

    seen = set()
    deduped = []
    for tag in new_tags:
        if tag not in seen:
            seen.add(tag)
            deduped.append(tag)
    map_entry["tags"] = deduped
    return map_entry


def main():
    with open(JSON_PATH, "r", encoding="utf-8") as fh:
        maps = json.load(fh)

    by_id = {m["id"]: m for m in maps}

    for new_map in NEW_MAPS:
        if new_map["id"] not in by_id:
            maps.append(dict(new_map))
            by_id[new_map["id"]] = maps[-1]

    for map_entry in maps:
        update_tags(map_entry)

    active_duty_actual = {m["id"] for m in maps if "active_duty" in m["tags"]}
    competitive_actual = {m["id"] for m in maps if "competitive_pool" in m["tags"]}

    assert active_duty_actual == ACTIVE_DUTY_IDS, (
        f"Active Duty mismatch.\n"
        f"  Expected: {sorted(ACTIVE_DUTY_IDS)}\n"
        f"  Actual:   {sorted(active_duty_actual)}\n"
        f"  Missing:  {sorted(ACTIVE_DUTY_IDS - active_duty_actual)}\n"
        f"  Extra:    {sorted(active_duty_actual - ACTIVE_DUTY_IDS)}"
    )
    assert competitive_actual == COMPETITIVE_IDS, (
        f"Competitive pool mismatch.\n"
        f"  Expected: {sorted(COMPETITIVE_IDS)}\n"
        f"  Actual:   {sorted(competitive_actual)}\n"
        f"  Missing:  {sorted(COMPETITIVE_IDS - competitive_actual)}\n"
        f"  Extra:    {sorted(competitive_actual - COMPETITIVE_IDS)}"
    )

    json_text = json.dumps(maps, indent=2)
    with open(JSON_PATH, "w", encoding="utf-8") as fh:
        fh.write(json_text + "\n")

    js_text = (
        "/* Generated file. Do not edit by hand. */\n"
        "window.CSToolsMapsData = "
        + json.dumps(maps, indent=2)
        + ";\n"
    )
    with open(JS_PATH, "w", encoding="utf-8") as fh:
        fh.write(js_text)

    print(f"Wrote {len(maps)} maps to maps.json and maps-data.js")
    print(f"Active Duty ({len(active_duty_actual)}): {sorted(active_duty_actual)}")
    print(f"Competitive Pool ({len(competitive_actual)}): {sorted(competitive_actual)}")
    print(f"Extra (non-AD) competitive ({len(EXTRA_COMPETITIVE_IDS)}): {sorted(EXTRA_COMPETITIVE_IDS)}")


if __name__ == "__main__":
    main()
