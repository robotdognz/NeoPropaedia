#!/usr/bin/env python3
"""Build a separate baseline of unique 2005 Macropaedia article titles."""

from __future__ import annotations

import json
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
SECTIONS_DIR = REPO_ROOT / "src" / "content" / "sections"
OUTPUT_DIR = REPO_ROOT / "pipeline" / "output" / "macropaedia_2010"
OUTPUT_PATH = OUTPUT_DIR / "2005_baseline_titles.json"


def normalize_lookup_text(value: str) -> str:
    return " ".join(value.split()).strip().lower()


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    titles: dict[str, dict[str, object]] = {}

    for path in sorted(SECTIONS_DIR.glob("*.json")):
        data = json.loads(path.read_text())
        section_code = data["sectionCode"]

        for raw_title in data.get("macropaediaReferences", []):
            title = " ".join(raw_title.split()).strip()
            if not title:
                continue
            key = normalize_lookup_text(title)
            entry = titles.setdefault(
                key,
                {
                    "title": title,
                    "lookupKey": key,
                    "sectionCodes": [],
                },
            )
            if section_code not in entry["sectionCodes"]:
                entry["sectionCodes"].append(section_code)

    ordered = sorted(
        titles.values(),
        key=lambda item: (item["title"].lower(), item["title"]),
    )

    payload = {
        "source": "2005 app Macropaedia references",
        "uniqueTitleCount": len(ordered),
        "titles": ordered,
    }
    OUTPUT_PATH.write_text(json.dumps(payload, indent=2, ensure_ascii=True) + "\n")
    print(f"Wrote {len(ordered)} unique 2005 Macropaedia titles to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
