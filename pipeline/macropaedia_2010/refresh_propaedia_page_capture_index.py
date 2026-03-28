#!/usr/bin/env python3
"""Refresh the tracked capture index for 2010 Propaedia page photos."""

from __future__ import annotations

import csv
import re
from pathlib import Path

from paths import IMAGE_ROOT, PROJECT_DATA_DIR


OUTPUT_PATH = PROJECT_DATA_DIR / "propaedia_page_capture_index.csv"
PROPAEDIA_ROOT = IMAGE_ROOT / "propaedia_pages"
SUPPORTED_SUFFIXES = {".jpg", ".jpeg", ".png", ".heic"}
PART_DIR_RE = re.compile(r"part_(\d+)$")
SEQUENCE_RE = re.compile(r"-(\d+)(?:\.[^.]+)?$")


def read_existing_rows(path: Path) -> dict[str, dict[str, str]]:
    if not path.exists():
        return {}
    with path.open(newline="", encoding="utf-8") as handle:
        rows = list(csv.DictReader(handle))
    return {row["image_relative_path"]: row for row in rows}


def infer_part_number(path: Path) -> int:
    for parent in path.parents:
        match = PART_DIR_RE.search(parent.name)
        if match:
            return int(match.group(1))
    raise ValueError(f"Could not infer part number from {path}")


def infer_capture_sequence(path: Path) -> int:
    match = SEQUENCE_RE.search(path.name)
    if match:
        return int(match.group(1))
    raise ValueError(f"Could not infer capture sequence from {path.name}")


def discover_images() -> list[Path]:
    paths = [
        path
        for path in PROPAEDIA_ROOT.rglob("*")
        if path.is_file() and path.suffix.lower() in SUPPORTED_SUFFIXES
    ]
    return sorted(paths)


def main() -> None:
    existing = read_existing_rows(OUTPUT_PATH)
    rows: list[dict[str, str | int]] = []

    for path in discover_images():
        relative_path = path.relative_to(IMAGE_ROOT).as_posix()
        prior = existing.get(relative_path, {})
        rows.append(
            {
                "part_number": infer_part_number(path),
                "capture_sequence": infer_capture_sequence(path),
                "image_relative_path": relative_path,
                "propaedia_page_reference": prior.get("propaedia_page_reference", "").strip(),
                "capture_status": prior.get("capture_status", "").strip() or "captured",
                "notes": prior.get("notes", "").strip(),
            }
        )

    rows.sort(key=lambda row: (int(row["part_number"]), int(row["capture_sequence"])))
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with OUTPUT_PATH.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=[
                "part_number",
                "capture_sequence",
                "image_relative_path",
                "propaedia_page_reference",
                "capture_status",
                "notes",
            ],
        )
        writer.writeheader()
        writer.writerows(rows)

    print(f"Wrote {len(rows)} rows to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
