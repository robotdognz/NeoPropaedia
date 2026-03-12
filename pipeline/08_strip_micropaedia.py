#!/usr/bin/env python3
"""
Step 08 — Micropaedia reference removal.

The Propaedia sections sometimes include a "Micropaedia:" block listing
short article titles.  These are not needed in the structured outline
and can interfere with downstream processing.  This script:

  1. Finds "Micropaedia:" markers in each section's raw text block.
  2. Removes everything from that marker to the end of the reference
     list (or end of section).
  3. Re-parses the outline (if needed) without the Micropaedia block.
  4. Logs every removal for manual verification.

In practice the removal is done on the *raw text level*; the section
JSON files are then updated by re-reading the cleaned blocks.

Usage:
    python3 pipeline/08_strip_micropaedia.py
"""

import json
import logging
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
import config

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
logger = logging.getLogger(__name__)


def strip_micropaedia() -> None:
    """Remove Micropaedia blocks from section outline text."""
    sections_dir = config.SECTIONS_DIR
    if not os.path.isdir(sections_dir):
        logger.error("sections directory not found — run 03_parse_structure.py first")
        sys.exit(1)

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

    sections = sorted(boundaries.get("sections", []), key=lambda s: s["position"])
    removed_count = 0

    for i, sec in enumerate(sections):
        code = sec["sectionCode"]
        start = sec["position"]
        end = sections[i + 1]["position"] if i + 1 < len(sections) else len(full_text)
        block = full_text[start:end]

        m = config.MICROPAEDIA_MARKER_RE.search(block)
        if m is None:
            continue

        # Determine the extent of the Micropaedia block.
        # It runs from the marker to the end of the section text block
        # (since it appears after Macropaedia refs and before the next section).
        micro_start = m.start()
        removed_text = block[micro_start:]
        removed_lines = removed_text.strip().split("\n")

        logger.info(
            "Section %s: removing Micropaedia block (%d lines, %d chars) starting at offset %d",
            code,
            len(removed_lines),
            len(removed_text),
            micro_start,
        )

        # Log a preview of what was removed (first 5 lines)
        for line in removed_lines[:5]:
            logger.debug("  | %s", line.strip())
        if len(removed_lines) > 5:
            logger.debug("  | ... (%d more lines)", len(removed_lines) - 5)

        # Remove the Micropaedia block from the outline by scanning
        # the section JSON's outline nodes for any text that contains
        # Micropaedia content.  In most cases the Micropaedia block
        # is *not* parsed into outline nodes (it sits after the outline
        # in the raw text), but we clean defensively.
        filename = config.section_code_to_filename(code) + ".json"
        json_path = os.path.join(sections_dir, filename)
        if not os.path.isfile(json_path):
            continue

        with open(json_path, "r", encoding="utf-8") as fh:
            data = json.load(fh)

        # Filter outline nodes whose text matches the Micropaedia marker
        def _filter_micro(nodes: list[dict]) -> list[dict]:
            clean = []
            for node in nodes:
                if config.MICROPAEDIA_MARKER_RE.search(node.get("text", "")):
                    continue
                node["children"] = _filter_micro(node.get("children", []))
                clean.append(node)
            return clean

        original_count = len(data.get("outline", []))
        data["outline"] = _filter_micro(data.get("outline", []))
        new_count = len(data["outline"])

        with open(json_path, "w", encoding="utf-8") as fh:
            json.dump(data, fh, indent=2, ensure_ascii=False)

        if new_count < original_count:
            logger.info(
                "  Removed %d Micropaedia outline node(s) from section %s",
                original_count - new_count,
                code,
            )

        removed_count += 1

    logger.info("Processed Micropaedia blocks in %d sections", removed_count)


if __name__ == "__main__":
    strip_micropaedia()
