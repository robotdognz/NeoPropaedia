#!/usr/bin/env python3
"""
Step 03 — Recursive outline parser for Propaedia sections.

This is the most complex pipeline stage. Each section contains a
hierarchical outline with up to four nesting levels:

  A/B/C  (major)    — OUTLINE_MAJOR_RE
  1/2/3  (numeric)  — OUTLINE_NUMERIC_RE
  a/b/c  (lowercase)— OUTLINE_LOWERCASE_RE
  i/ii/iii (roman)  — OUTLINE_ROMAN_RE

The parser reads the raw text between consecutive section boundaries,
splits it into lines, joins multi-line items, identifies the nesting
level of each item, and builds a tree that mirrors the JSON schema
used in src/content/sections/*.json.

Inline cross-references (e.g. "[see 423.B]") are preserved in the
item text.

Outputs one JSON file per section in output/sections/<code>.json.

Usage:
    python3 pipeline/03_parse_structure.py
"""

import json
import logging
import os
import re
import sys

sys.path.insert(0, os.path.dirname(__file__))
import config

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
logger = logging.getLogger(__name__)

# Nesting-level detection helpers (in priority order)
LEVEL_DETECTORS = [
    ("major", config.OUTLINE_MAJOR_RE),
    ("numeric", config.OUTLINE_NUMERIC_RE),
    ("lowercase", config.OUTLINE_LOWERCASE_RE),
    ("roman", config.OUTLINE_ROMAN_RE),
]

# Nesting depth map for ordering
LEVEL_DEPTH = {"major": 0, "numeric": 1, "lowercase": 2, "roman": 3}


def _detect_level(line: str):
    """Return (levelType, level_char, text) or None if no match."""
    stripped = line.strip()
    for level_type, regex in LEVEL_DETECTORS:
        m = regex.match(stripped)
        if m:
            return level_type, m.group(1), m.group(2).strip()
    return None


def _join_multiline(lines: list[str]) -> list[str]:
    """Join continuation lines (lines that don't start a new item) with
    the preceding item."""
    joined: list[str] = []
    for raw_line in lines:
        stripped = raw_line.strip()
        if not stripped:
            continue
        if _detect_level(stripped) is not None or not joined:
            joined.append(stripped)
        else:
            # Continuation of the previous item
            joined[-1] = joined[-1] + " " + stripped
    return joined


def _build_tree(lines: list[str]) -> list[dict]:
    """Parse a flat list of detected items into a nested outline tree.

    Each item is placed under the last item of the immediately shallower
    nesting level.
    """
    items = []
    for line in lines:
        det = _detect_level(line)
        if det is None:
            continue
        level_type, level_char, text = det
        items.append({
            "level": level_char,
            "levelType": level_type,
            "text": text,
            "children": [],
            "_depth": LEVEL_DEPTH.get(level_type, 0),
        })

    if not items:
        return []

    # Build the tree by using a stack of current ancestors
    root: list[dict] = []
    stack: list[dict] = []  # items in stack are ancestors of the next item

    for item in items:
        depth = item["_depth"]
        # Pop stack until we find a parent at a shallower depth
        while stack and stack[-1]["_depth"] >= depth:
            stack.pop()

        if stack:
            stack[-1]["children"].append(item)
        else:
            root.append(item)
        stack.append(item)

    # Remove internal _depth key from all nodes
    def _clean(node: dict):
        node.pop("_depth", None)
        for child in node.get("children", []):
            _clean(child)

    for node in root:
        _clean(node)

    return root


def _extract_section_text(full_text: str, boundaries: dict) -> dict[str, str]:
    """Return a mapping {sectionCode: raw_text_block} for each section."""
    sections = boundaries.get("sections", [])
    if not sections:
        return {}

    # Sort by position to extract text between consecutive sections
    sorted_secs = sorted(sections, key=lambda s: s["position"])

    result: dict[str, str] = {}
    for i, sec in enumerate(sorted_secs):
        start = sec["position"]
        end = sorted_secs[i + 1]["position"] if i + 1 < len(sorted_secs) else len(full_text)
        result[sec["sectionCode"]] = full_text[start:end]

    return result


def parse_structure() -> None:
    """Parse every section's outline from the raw text."""
    full_text_path = os.path.join(config.RAW_DIR, "full_text.txt")
    if not os.path.isfile(full_text_path):
        logger.error("full_text.txt not found — run 01_extract_raw.py first")
        sys.exit(1)

    boundaries_path = config.BOUNDARIES_PATH
    if not os.path.isfile(boundaries_path):
        logger.error("boundaries.json not found — run 02_identify_boundaries.py first")
        sys.exit(1)

    with open(full_text_path, "r", encoding="utf-8") as fh:
        full_text = fh.read()
    with open(boundaries_path, "r", encoding="utf-8") as fh:
        boundaries = json.load(fh)

    section_texts = _extract_section_text(full_text, boundaries)
    sections_dir = config.ensure_dir(config.SECTIONS_DIR)

    # Build a lookup from section code to boundary info (title, page, etc.)
    sec_info = {s["sectionCode"]: s for s in boundaries.get("sections", [])}

    parsed_count = 0
    for code, raw_block in section_texts.items():
        # Skip the header line itself (first line is "Section NNN. Title")
        lines = raw_block.split("\n")
        # Remove the header line
        body_lines = []
        header_skipped = False
        for line in lines:
            if not header_skipped and config.SECTION_HEADER_RE.search(line):
                header_skipped = True
                continue
            body_lines.append(line)

        joined = _join_multiline(body_lines)
        outline = _build_tree(joined)

        info = sec_info.get(code, {})
        section_data = {
            "sectionCode": code,
            "sectionCodeDisplay": code,
            "title": info.get("title", ""),
            "page": info.get("page"),
            "outline": outline,
            "crossReferences": [],
            "macropaediaReferences": [],
        }

        filename = config.section_code_to_filename(code) + ".json"
        out_path = os.path.join(sections_dir, filename)
        with open(out_path, "w", encoding="utf-8") as fh:
            json.dump(section_data, fh, indent=2, ensure_ascii=False)

        parsed_count += 1

    logger.info("Parsed %d section outlines -> %s", parsed_count, sections_dir)


if __name__ == "__main__":
    parse_structure()
