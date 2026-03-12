#!/usr/bin/env python3
"""
Step 07 — Macropaedia reference extraction.

Within each section's raw text block, a marker like:

    Suggested reading in the Macropaedia:

is followed by a list of Encyclopaedia Britannica Macropaedia article
titles.  This script finds those markers, extracts the article titles,
and stores them in the corresponding section JSON under
"macropaediaReferences".

Usage:
    python3 pipeline/07_parse_macropaedia.py
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


def _extract_macropaedia_titles(text_block: str) -> list[str]:
    """Find and return Macropaedia article titles from a section's text."""
    m = config.MACROPAEDIA_MARKER_RE.search(text_block)
    if m is None:
        return []

    # The article list starts after the marker and ends at a blank line,
    # a Micropaedia marker, or the end of the block.
    after = text_block[m.end():]

    titles: list[str] = []
    for line in after.split("\n"):
        stripped = line.strip()
        if not stripped:
            # Blank line may end the list (but skip initial blanks)
            if titles:
                break
            continue
        # Stop if we hit a Micropaedia marker or another section header
        if config.MICROPAEDIA_MARKER_RE.match(stripped):
            break
        if config.SECTION_HEADER_RE.match(stripped):
            break
        # Some lines may have leading bullets or dashes — strip them
        cleaned = re.sub(r"^[-\u2022\u2013*]\s*", "", stripped)
        if cleaned:
            titles.append(cleaned)

    return titles


def parse_macropaedia() -> None:
    """Extract Macropaedia references and inject into section JSONs."""
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

    # Build section text blocks
    sections = sorted(boundaries.get("sections", []), key=lambda s: s["position"])
    sections_dir = config.SECTIONS_DIR
    if not os.path.isdir(sections_dir):
        logger.error("sections directory not found — run 03_parse_structure.py first")
        sys.exit(1)

    updated = 0
    for i, sec in enumerate(sections):
        code = sec["sectionCode"]
        start = sec["position"]
        end = sections[i + 1]["position"] if i + 1 < len(sections) else len(full_text)
        block = full_text[start:end]

        titles = _extract_macropaedia_titles(block)

        # Update section JSON
        filename = config.section_code_to_filename(code) + ".json"
        json_path = os.path.join(sections_dir, filename)
        if not os.path.isfile(json_path):
            logger.warning("Section JSON not found for %s: %s", code, json_path)
            continue

        with open(json_path, "r", encoding="utf-8") as fh:
            data = json.load(fh)

        data["macropaediaReferences"] = titles
        with open(json_path, "w", encoding="utf-8") as fh:
            json.dump(data, fh, indent=2, ensure_ascii=False)

        if titles:
            logger.info("Section %s: %d Macropaedia refs", code, len(titles))
            updated += 1

    logger.info("Updated Macropaedia references in %d sections", updated)


if __name__ == "__main__":
    parse_macropaedia()
