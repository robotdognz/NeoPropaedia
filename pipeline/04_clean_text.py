#!/usr/bin/env python3
"""
Step 04 — Text cleaning for extracted Propaedia content.

Applies post-extraction fixes to section JSON files in output/sections/:
  * Re-join words split by hyphens at line breaks
  * Fix common OCR/encoding artefacts
  * Normalize whitespace (collapse runs, strip leading/trailing)
  * Normalize smart quotes and dashes to ASCII equivalents

All changes are applied in-place to the section JSON files.

Usage:
    python3 pipeline/04_clean_text.py
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

# ---------------------------------------------------------------------------
# Cleaning functions
# ---------------------------------------------------------------------------

# Hyphenated line-break: "exam-\nple" -> "example"
_HYPHEN_BREAK_RE = re.compile(r"(\w)-\s*\n\s*(\w)")

# Common OCR artefacts
_OCR_REPLACEMENTS = [
    ("\ufb01", "fi"),   # fi ligature
    ("\ufb02", "fl"),   # fl ligature
    ("\ufb00", "ff"),   # ff ligature
    ("\ufb03", "ffi"),  # ffi ligature
    ("\ufb04", "ffl"),  # ffl ligature
    ("\u2019", "'"),    # right single quote
    ("\u2018", "'"),    # left single quote
    ("\u201c", '"'),    # left double quote
    ("\u201d", '"'),    # right double quote
    ("\u2013", "-"),    # en-dash
    ("\u2014", "--"),   # em-dash
    ("\u2026", "..."),  # ellipsis
    ("\u00a0", " "),    # non-breaking space
    ("\u200b", ""),     # zero-width space
]

_MULTI_SPACE_RE = re.compile(r"[ \t]{2,}")


def clean_text(text: str) -> str:
    """Apply all cleaning rules to a string."""
    # Re-join hyphenated line breaks
    text = _HYPHEN_BREAK_RE.sub(r"\1\2", text)

    # OCR artefacts
    for old, new in _OCR_REPLACEMENTS:
        text = text.replace(old, new)

    # Collapse multiple spaces/tabs
    text = _MULTI_SPACE_RE.sub(" ", text)

    # Strip leading/trailing whitespace
    text = text.strip()
    return text


def _clean_node(node: dict) -> None:
    """Recursively clean the text field of an outline node."""
    if "text" in node:
        node["text"] = clean_text(node["text"])
    for child in node.get("children", []):
        _clean_node(child)


def clean_sections() -> None:
    """Walk output/sections/ and clean every section JSON in-place."""
    sections_dir = config.SECTIONS_DIR
    if not os.path.isdir(sections_dir):
        logger.error("sections directory not found — run 03_parse_structure.py first")
        sys.exit(1)

    files = sorted(f for f in os.listdir(sections_dir) if f.endswith(".json"))
    cleaned = 0

    for fname in files:
        path = os.path.join(sections_dir, fname)
        with open(path, "r", encoding="utf-8") as fh:
            data = json.load(fh)

        # Clean title
        if "title" in data:
            data["title"] = clean_text(data["title"])

        # Clean outline nodes
        for node in data.get("outline", []):
            _clean_node(node)

        with open(path, "w", encoding="utf-8") as fh:
            json.dump(data, fh, indent=2, ensure_ascii=False)

        cleaned += 1

    logger.info("Cleaned text in %d section files", cleaned)


if __name__ == "__main__":
    clean_sections()
