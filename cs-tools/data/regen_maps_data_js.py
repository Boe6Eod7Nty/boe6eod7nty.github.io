#!/usr/bin/env python3
import json
from pathlib import Path
import sys
import argparse
import hashlib
import os
import tempfile
import shutil
from datetime import datetime, timezone


HEADER = "/* Generated file. Do not edit by hand. */\n"
PREFIX = "window.CSToolsMapsData = "
SUFFIX = ";\n"


def _atomic_write_text(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", newline="\n", delete=False, dir=str(path.parent)) as tf:
        tmp_name = tf.name
        tf.write(text)
        tf.flush()
        os.fsync(tf.fileno())
    Path(tmp_name).replace(path)


def _sha256_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def main() -> int:
    parser = argparse.ArgumentParser(description="Regenerate maps-data.js from maps.json deterministically.")
    parser.add_argument("--json", dest="json_path", default="maps.json", help="Input JSON path (default: maps.json)")
    parser.add_argument("--out", dest="out_path", default="maps-data.js", help="Output JS path (default: maps-data.js)")
    parser.add_argument(
        "--compact",
        action="store_true",
        help="Write minified JSON (no pretty-print). Default is pretty-printed with 2 spaces.",
    )
    args = parser.parse_args()

    json_path = Path(args.json_path)
    out_path = Path(args.out_path)

    maps = json.loads(json_path.read_text(encoding="utf-8"))
    payload = json.dumps(maps, ensure_ascii=False, indent=None if args.compact else 2)
    js_text = f"{HEADER}{PREFIX}{payload}{SUFFIX}"

    before = out_path.read_text(encoding="utf-8") if out_path.exists() else ""
    _atomic_write_text(out_path, js_text)

    changed = before != js_text
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    print(f"Wrote {out_path.as_posix()} (changed={str(changed).lower()}, sha256={_sha256_text(js_text)[:12]}, utc={now})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

