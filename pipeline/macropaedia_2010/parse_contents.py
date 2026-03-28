#!/usr/bin/env python3
"""Parse 2010 Macropaedia OCR into article candidates using upright page geometry."""

from __future__ import annotations

import json
import re
import statistics
from pathlib import Path
from typing import Any


REPO_ROOT = Path(__file__).resolve().parents[2]
OUTPUT_DIR = REPO_ROOT / "pipeline" / "output" / "macropaedia_2010"
MANIFEST_PATH = OUTPUT_DIR / "manifest.json"
OUTPUT_PATH = OUTPUT_DIR / "2010_article_candidates.json"

PAGE_TOKEN_RE = re.compile(r"^\d{1,4}[A-Z]?$")
PAGE_PREFIX_RE = re.compile(r"^(\d{1,4}[A-Z]?)\s+(.+)$")
PAGE_SUFFIX_RE = re.compile(r"^(.+?)\s+(\d{1,4}[A-Z]?)$")


def normalize_lookup_text(value: str) -> str:
    return " ".join(value.split()).strip().lower()


def clean_text(value: str) -> str:
    text = " ".join(value.split()).strip()
    return text.replace("|", "I")


def transform_box(
    line: dict[str, Any],
    orientation: str,
    image_width: int,
    image_height: int,
) -> dict[str, float]:
    raw = line["boundingBox"]

    # The single landscape photo already yields OCR boxes in the upright reading
    # coordinate system when Vision is asked to read it rotated, so applying our
    # extra transform on top of that breaks the row geometry.
    if image_width > image_height and orientation in {"left", "right"}:
        return raw

    if "uprightBoundingBox" in line:
        return line["uprightBoundingBox"]

    x = raw["x"]
    y = raw["y"]
    width = raw["width"]
    height = raw["height"]

    if orientation == "up":
        return raw
    if orientation == "down":
        return {
            "x": 1 - (x + width),
            "y": 1 - (y + height),
            "width": width,
            "height": height,
            "midX": 1 - raw["midX"],
            "midY": 1 - raw["midY"],
        }
    if orientation == "left":
        return {
            "x": y,
            "y": 1 - (x + width),
            "width": height,
            "height": width,
            "midX": raw["midY"],
            "midY": 1 - raw["midX"],
        }
    if orientation == "right":
        return {
            "x": 1 - (y + height),
            "y": x,
            "width": height,
            "height": width,
            "midX": 1 - raw["midY"],
            "midY": raw["midX"],
        }
    return raw


def group_rows(
    lines: list[dict[str, Any]],
    orientation: str,
    image_width: int,
    image_height: int,
) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    text_thicknesses: list[float] = []

    for line in lines:
        text = clean_text(line["text"])
        if not text or text.upper() == "CONTENTS":
            continue
        upright_box = transform_box(line, orientation, image_width, image_height)
        items.append(
            {
                "text": text,
                "uprightBoundingBox": upright_box,
            }
        )
        text_thicknesses.append(min(float(upright_box["width"]), float(upright_box["height"])))

    if not items:
        return []

    tolerance = max(0.010, statistics.median(text_thicknesses) * 1.2)
    items.sort(
        key=lambda item: (
            -float(item["uprightBoundingBox"]["midY"]),
            float(item["uprightBoundingBox"]["midX"]),
        )
    )

    rows: list[dict[str, Any]] = []
    for item in items:
        item_mid_y = float(item["uprightBoundingBox"]["midY"])
        if not rows or abs(item_mid_y - rows[-1]["midY"]) > tolerance:
            rows.append({"midY": item_mid_y, "items": [item]})
            continue

        row = rows[-1]
        row["items"].append(item)
        count = len(row["items"])
        row["midY"] = ((row["midY"] * (count - 1)) + item_mid_y) / count

    for row in rows:
        row["items"].sort(key=lambda item: float(item["uprightBoundingBox"]["midX"]))

    return rows


def page_label_to_index(label: str) -> int:
    digits = "".join(character for character in label if character.isdigit())
    return int(digits) if digits else 0


def build_entry(title: str, page_label: str) -> dict[str, Any] | None:
    normalized_title = clean_text(title)
    normalized_page = clean_text(page_label).upper()
    if not normalized_title or not PAGE_TOKEN_RE.match(normalized_page):
        return None

    return {
        "title": normalized_title,
        "startPage": normalized_page,
        "startPageIndex": page_label_to_index(normalized_page),
    }


def parse_row(row: dict[str, Any]) -> tuple[list[dict[str, Any]], list[str]]:
    entries: list[dict[str, Any]] = []
    leftovers: list[str] = []
    unresolved_items: list[str] = []
    items = row["items"]

    for item in items:
        text = item["text"]

        prefix_match = PAGE_PREFIX_RE.match(text)
        if prefix_match:
            entry = build_entry(prefix_match.group(2), prefix_match.group(1))
            if entry is not None:
                entries.append(entry)
            else:
                leftovers.append(text)
            continue

        suffix_match = PAGE_SUFFIX_RE.match(text)
        if suffix_match:
            entry = build_entry(suffix_match.group(1), suffix_match.group(2))
            if entry is not None:
                entries.append(entry)
            else:
                leftovers.append(text)
            continue

        unresolved_items.append(text)

    if unresolved_items:
        page_positions = [index for index, text in enumerate(unresolved_items) if PAGE_TOKEN_RE.match(text)]
        title_positions = [index for index, text in enumerate(unresolved_items) if not PAGE_TOKEN_RE.match(text)]

        if page_positions and len(page_positions) == len(title_positions):
            if max(page_positions) < min(title_positions):
                page_texts = [unresolved_items[index] for index in page_positions]
                title_texts = [unresolved_items[index] for index in title_positions]
                for page_text, title_text in zip(page_texts, title_texts):
                    entry = build_entry(title_text, page_text)
                    if entry is not None:
                        entries.append(entry)
                    else:
                        leftovers.extend([page_text, title_text])
                return entries, leftovers

            if max(title_positions) < min(page_positions):
                title_texts = [unresolved_items[index] for index in title_positions]
                page_texts = [unresolved_items[index] for index in page_positions]
                for title_text, page_text in zip(title_texts, page_texts):
                    entry = build_entry(title_text, page_text)
                    if entry is not None:
                        entries.append(entry)
                    else:
                        leftovers.extend([title_text, page_text])
                return entries, leftovers

    index = 0
    while index < len(unresolved_items):
        text = unresolved_items[index]

        if PAGE_TOKEN_RE.match(text):
            if index + 1 < len(unresolved_items):
                next_text = unresolved_items[index + 1]
                if not PAGE_TOKEN_RE.match(next_text):
                    entry = build_entry(next_text, text)
                    if entry is not None:
                        entries.append(entry)
                    else:
                        leftovers.extend([text, next_text])
                    index += 2
                    continue

            leftovers.append(text)
            index += 1
            continue

        if index + 1 < len(unresolved_items) and PAGE_TOKEN_RE.match(unresolved_items[index + 1]):
            entry = build_entry(text, unresolved_items[index + 1])
            if entry is not None:
                entries.append(entry)
            else:
                leftovers.extend([text, unresolved_items[index + 1]])
            index += 2
            continue

        leftovers.append(text)
        index += 1

    return entries, leftovers


def with_page_lengths(entries: list[dict[str, Any]]) -> list[dict[str, Any]]:
    ordered = sorted(
        entries,
        key=lambda entry: (
            entry["startPageIndex"],
            entry["startPage"],
            entry["title"].lower(),
        ),
    )

    resolved_entries: list[dict[str, Any]] = []
    for index, entry in enumerate(ordered):
        next_entry = ordered[index + 1] if index + 1 < len(ordered) else None
        page_count = None
        if next_entry is not None and next_entry["startPageIndex"] > entry["startPageIndex"]:
            page_count = next_entry["startPageIndex"] - entry["startPageIndex"]

        resolved_entries.append(
            {
                "title": entry["title"],
                "lookupKey": normalize_lookup_text(entry["title"]),
                "startPage": entry["startPage"],
                "startPageIndex": entry["startPageIndex"],
                "pageCountEstimate": page_count,
            }
        )

    return resolved_entries


def main() -> None:
    manifest = json.loads(MANIFEST_PATH.read_text())
    volumes_output: list[dict[str, Any]] = []
    all_articles: list[dict[str, Any]] = []

    for image in manifest["images"]:
        lines_path = Path(image["ocrLinesPath"])
        lines_payload = json.loads(lines_path.read_text())
        rows = group_rows(
            lines_payload["lines"],
            image["chosenOrientation"],
            image["width"],
            image["height"],
        )

        volume_entries: list[dict[str, Any]] = []
        leftovers: list[str] = []

        for row_index, row in enumerate(rows, start=1):
            parsed_entries, leftover_items = parse_row(row)
            for entry in parsed_entries:
                entry["row"] = row_index
                entry["volumeNumber"] = image["volumeNumber"]
            volume_entries.extend(parsed_entries)
            leftovers.extend(leftover_items)

        deduped_entries: dict[tuple[str, str], dict[str, Any]] = {}
        for entry in volume_entries:
            deduped_entries[(entry["title"], entry["startPage"])] = entry

        parsed_entries = with_page_lengths(list(deduped_entries.values()))
        all_articles.extend(parsed_entries)

        volumes_output.append(
            {
                "volumeNumber": image["volumeNumber"],
                "sourceImage": image["relativePath"],
                "chosenOrientation": image["chosenOrientation"],
                "articleCount": len(parsed_entries),
                "leftoverCount": len(leftovers),
                "articles": parsed_entries,
                "leftovers": leftovers,
            }
        )

    payload = {
        "source": "2010 Macropaedia contents-page OCR",
        "volumeCount": len(volumes_output),
        "articleCount": len(all_articles),
        "volumes": volumes_output,
    }
    OUTPUT_PATH.write_text(json.dumps(payload, indent=2, ensure_ascii=True) + "\n")
    print(f"Wrote parsed 2010 article candidates to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
