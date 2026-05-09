#!/usr/bin/env python3
"""
Prompt for Steam Workshop links per map.

- Reads cs-tools/data/maps.json (list of map objects)
- Prompts for a workshop link/ID per map (blank = skip)
- Normalizes input to a full Steam Workshop URL when possible
- Writes back to maps.json (with a .bak backup) and regenerates maps-data.js

Field used: `workshop_links` (array of URLs).
Special version tag used when adding a workshop link for a non-CS2 map: `CS2*`.
"""

from __future__ import annotations

import argparse
import atexit
import json
import os
import re
import shutil
import signal
import sys
from datetime import datetime
from typing import Any


STEAM_WORKSHOP_CANONICAL = "https://steamcommunity.com/sharedfiles/filedetails/?id={id}"


def _read_json(path: str) -> list[dict[str, Any]]:
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    if not isinstance(data, list):
        raise ValueError(f"Expected JSON list at {path}")
    out: list[dict[str, Any]] = []
    for item in data:
        if not isinstance(item, dict):
            continue
        out.append(item)
    return out


def _write_json(path: str, maps: list[dict[str, Any]]) -> None:
    payload = json.dumps(maps, indent=2, ensure_ascii=False) + "\n"
    _atomic_write_text(path, payload)


def _write_js_fallback(path: str, maps: list[dict[str, Any]]) -> None:
    payload = json.dumps(maps, indent=2, ensure_ascii=False)
    content = "/* Generated file. Do not edit by hand. */\nwindow.CSToolsMapsData = " + payload + ";\n"
    _atomic_write_text(path, content)


def _atomic_write_text(path: str, content: str) -> None:
    tmp_path = f"{path}.tmp.{os.getpid()}"
    with open(tmp_path, "w", encoding="utf-8", newline="\n") as f:
        f.write(content)
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp_path, path)


class Persistor:
    def __init__(self, maps_json: str, maps_js: str, maps: list[dict[str, Any]]) -> None:
        self.maps_json = maps_json
        self.maps_js = maps_js
        self.maps = maps
        self.dirty = False
        self.backup_path: str | None = None

    def mark_dirty(self) -> None:
        self.dirty = True

    def flush(self, reason: str = "") -> bool:
        if not self.dirty:
            return False

        self._ensure_backup()
        _write_json(self.maps_json, self.maps)
        _write_js_fallback(self.maps_js, self.maps)
        self.dirty = False

        prefix = f"{reason} " if reason else ""
        print(f"{prefix}[OK] Updated: {self.maps_json}")
        print(f"{prefix}[OK] Regenerated: {self.maps_js}")
        return True

    def _ensure_backup(self) -> None:
        if self.backup_path:
            return
        timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
        self.backup_path = self.maps_json + f".bak.{timestamp}"
        shutil.copy2(self.maps_json, self.backup_path)
        print(f"[OK] Backup written: {self.backup_path}")


_RE_DIGITS = re.compile(r"^\d+$")
_RE_ID_PARAM = re.compile(r"[?&]id=(\d+)\b")
_RE_SHAREDFILES_PATH = re.compile(r"/sharedfiles/filedetails/?\b", re.IGNORECASE)


def normalize_workshop_input(raw: str) -> tuple[str | None, str | None]:
    """
    Returns (normalized_url, workshop_id).
    If cannot normalize but looks like a URL, returns (raw_url, None).
    If blank/invalid, returns (None, None).
    """
    s = str(raw or "").strip()
    if not s:
        return (None, None)

    # Bare id.
    if _RE_DIGITS.fullmatch(s):
        wid = s
        return (STEAM_WORKSHOP_CANONICAL.format(id=wid), wid)

    # URL containing id=123
    m = _RE_ID_PARAM.search(s)
    if m:
        wid = m.group(1)
        return (STEAM_WORKSHOP_CANONICAL.format(id=wid), wid)

    # Some people paste the "sharedfiles/filedetails/" URL without id param
    # (rare). Keep it as-is if it looks like a workshop URL.
    lowered = s.lower()
    if "steamcommunity.com" in lowered and _RE_SHAREDFILES_PATH.search(lowered):
        return (s, None)

    # Looks like any URL: keep, but don't pretend it's normalized.
    if "://" in s:
        return (s, None)

    return (None, None)


def has_cs2(map_obj: dict[str, Any]) -> bool:
    versions = map_obj.get("versions")
    if isinstance(versions, list) and any(str(v).strip() == "CS2" for v in versions):
        return True
    if map_obj.get("in_cs2") is True:
        return True
    return False


def ensure_list_str(value: Any) -> list[str]:
    if isinstance(value, list):
        out: list[str] = []
        for v in value:
            s = str(v or "").strip()
            if s:
                out.append(s)
        return out
    return []


def parse_start_at(value: str | None, maps: list[dict[str, Any]]) -> int:
    if value is None:
        return 0
    v = str(value).strip()
    if not v:
        return 0

    if _RE_DIGITS.fullmatch(v):
        idx = int(v)
        if idx < 0:
            return 0
        return idx

    for i, m in enumerate(maps):
        if str(m.get("id") or "").strip() == v:
            return i

    raise ValueError(f"--start-at '{value}' not found (expected index or map id)")


def main() -> int:
    parser = argparse.ArgumentParser(description="Prompt for Steam Workshop links per map, update maps.json, regenerate maps-data.js.")
    parser.add_argument("--maps-json", default=os.path.join(os.path.dirname(__file__), "maps.json"), help="Path to maps.json")
    parser.add_argument("--maps-js", default=os.path.join(os.path.dirname(__file__), "maps-data.js"), help="Path to maps-data.js (file:// fallback)")
    parser.add_argument("--limit", type=int, default=0, help="Only process first N maps (0 = all)")
    parser.add_argument("--start-at", default=None, help="Start at map index (0-based) or map id")
    parser.add_argument("--yes", action="store_true", help="Non-interactive mode (no prompts). Useful with --limit to validate IO only.")
    args = parser.parse_args()

    maps_json = os.path.abspath(args.maps_json)
    maps_js = os.path.abspath(args.maps_js)

    maps = _read_json(maps_json)
    persistor = Persistor(maps_json, maps_js, maps)

    def final_flush(reason: str = "[INFO] Final flush:") -> None:
        try:
            persistor.flush(reason)
        except Exception as exc:
            print(f"[WARN] Could not flush pending changes: {exc}", file=sys.stderr)

    def signal_flush(signum: int, _frame: Any) -> None:
        print(f"\n[INFO] Received signal {signum}; saving pending changes before exit.")
        final_flush()
        raise SystemExit(128 + signum)

    atexit.register(final_flush)
    signal.signal(signal.SIGTERM, signal_flush)

    start_idx = parse_start_at(args.start_at, maps)
    end_idx = len(maps) if not args.limit or args.limit <= 0 else min(len(maps), start_idx + args.limit)

    changed = 0
    skipped = 0

    if args.yes:
        print("[INFO] --yes provided; not prompting, only validating read/write paths.")
    else:
        print("Paste a Steam Workshop URL, a workshop ID (digits), or press Enter to skip.\n")

    try:
        for i in range(start_idx, end_idx):
            m = maps[i]
            mid = str(m.get("id") or "").strip()
            name = str(m.get("name") or "").strip()
            versions = ensure_list_str(m.get("versions"))
            workshop_links = ensure_list_str(m.get("workshop_links"))

            existing_ws = workshop_links[0] if workshop_links else ""
            versions_display = ", ".join(versions) if versions else "(none)"
            existing_display = existing_ws if existing_ws else "(none)"

            print(f"[{i}] {name}  (id={mid})")
            print(f"  versions: {versions_display}")
            print(f"  workshop: {existing_display}")

            if args.yes:
                skipped += 1
                continue

            raw = input("  workshop url/id (blank=skip): ").strip()
            if not raw:
                skipped += 1
                print("  -> skipped\n")
                continue

            url, wid = normalize_workshop_input(raw)
            if not url:
                skipped += 1
                print("  -> invalid input (skipped)\n")
                continue

            # Update workshop_links (front-load, no duplicates).
            next_links = [u for u in workshop_links if u != url]
            next_links.insert(0, url)
            m["workshop_links"] = next_links

            # Add CS2* only when map is NOT already CS2-tagged.
            if not has_cs2(m) and "CS2*" not in versions:
                m["versions"] = versions + ["CS2*"]

            changed += 1
            persistor.mark_dirty()
            persistor.flush()
            normalized_note = f" (normalized from id={wid})" if wid and url == STEAM_WORKSHOP_CANONICAL.format(id=wid) else ""
            print(f"  -> saved: {url}{normalized_note}\n")
    except KeyboardInterrupt:
        print("\n[INFO] Interrupted; saving pending changes before exit.")
        final_flush()
        raise

    if changed == 0:
        print(f"Done. No changes. Processed={end_idx - start_idx} Skipped={skipped}")
        return 0

    final_flush()
    print(f"Done. Changed={changed} Processed={end_idx - start_idx} Skipped={skipped}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

