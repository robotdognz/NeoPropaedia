#!/usr/bin/env python3
"""
Step 02 — Identify Part / Division / Section boundaries in the raw text.

Reads output/raw/full_text.txt and emits output/boundaries.json with
the page number and character position of every Part, Division, and
Section header found.

Usage:
    python3 pipeline/02_identify_boundaries.py
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

# Regex to extract the current page number from embedded markers
PAGE_MARKER_RE = re.compile(r"===== PAGE (\d+) =====")


def _current_page(text: str, pos: int) -> int:
    """Return the page number active at *pos* inside the full text."""
    page = 1
    for m in PAGE_MARKER_RE.finditer(text):
        if m.start() > pos:
            break
        page = int(m.group(1))
    return page


def identify_boundaries() -> dict:
    """Scan the full extracted text and return structured boundary data."""
    full_text_path = os.path.join(config.RAW_DIR, "full_text.txt")
    if not os.path.isfile(full_text_path):
        logger.error("full_text.txt not found — run 01_extract_raw.py first")
        sys.exit(1)

    with open(full_text_path, "r", encoding="utf-8") as fh:
        text = fh.read()

    boundaries: dict = {"parts": [], "divisions": [], "sections": []}

    # --- Parts ---
    for m in config.PART_HEADER_RE.finditer(text):
        word = m.group(1).capitalize()
        part_num = config.PART_NUMBER_WORDS.get(word)
        if part_num is None:
            continue
        page = _current_page(text, m.start())
        # Try to capture the rest of the line as title
        line_end = text.find("\n", m.start())
        raw_line = text[m.start(): line_end if line_end != -1 else m.start() + 200].strip()
        boundaries["parts"].append({
            "partNumber": part_num,
            "word": word,
            "page": page,
            "position": m.start(),
            "rawLine": raw_line,
        })
        logger.info("Part %d (%s) found on page %d", part_num, word, page)

    # --- Divisions ---
    for m in config.DIVISION_HEADER_RE.finditer(text):
        roman = m.group(1).upper()
        title = m.group(2).strip()
        page = _current_page(text, m.start())
        boundaries["divisions"].append({
            "roman": roman,
            "title": title,
            "page": page,
            "position": m.start(),
        })
        logger.info("Division %s found on page %d: %s", roman, page, title[:60])

    # --- Sections ---
    for m in config.SECTION_HEADER_RE.finditer(text):
        code = m.group(1)
        title = m.group(2).strip()
        page = _current_page(text, m.start())
        boundaries["sections"].append({
            "sectionCode": code,
            "title": title,
            "page": page,
            "position": m.start(),
        })
        logger.info("Section %s found on page %d: %s", code, page, title[:60])

    # --- Summary ---
    logger.info(
        "Boundaries found: %d parts, %d divisions, %d sections",
        len(boundaries["parts"]),
        len(boundaries["divisions"]),
        len(boundaries["sections"]),
    )

    # Write output
    config.ensure_dir(config.OUTPUT_DIR)
    with open(config.BOUNDARIES_PATH, "w", encoding="utf-8") as fh:
        json.dump(boundaries, fh, indent=2, ensure_ascii=False)
    logger.info("Wrote %s", config.BOUNDARIES_PATH)

    return boundaries


if __name__ == "__main__":
    identify_boundaries()
