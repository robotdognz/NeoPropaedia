#!/usr/bin/env python3
"""
Step 05 — Extract the 10 introductory essays (one per Part).

Each Part of the Propaedia opens with a scholarly essay before the
first Division.  This script locates the text between each Part header
and its first Division header, converts it to MDX with YAML frontmatter,
and writes the result to output/essays/part-NN-essay.mdx.

Usage:
    python3 pipeline/05_extract_essays.py
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

# Known essay authors (2005 edition, in Part order)
ESSAY_AUTHORS = {
    1: "Nigel Calder",
    2: "Peter J. Wyllie",
    3: "Rene Dubos",
    4: "Lord Ritchie-Calder",
    5: "Harold D. Lasswell",
    6: "Mark Van Doren",
    7: "Lord Ritchie-Calder",
    8: "Wilfred Cantwell Smith",
    9: "Jacques Barzun",
    10: "Mortimer J. Adler",
}

# Known essay titles (2005 edition)
ESSAY_TITLES = {
    1: "The Universe of the Physicist",
    2: "The Earth and Its Neighbours",
    3: "The Variety and Complexity of Living Things",
    4: "The Human Organism",
    5: "Human Society",
    6: "The World of Art",
    7: "The Technological Order",
    8: "Religion",
    9: "The History of Mankind",
    10: "The Branches of Knowledge",
}


def extract_essays() -> None:
    """Extract the 10 introductory essays from the raw text."""
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

    parts = sorted(boundaries.get("parts", []), key=lambda p: p["position"])
    divisions = sorted(boundaries.get("divisions", []), key=lambda d: d["position"])

    essays_dir = config.ensure_dir(config.ESSAYS_DIR)
    extracted = 0

    for part in parts:
        part_num = part["partNumber"]
        part_pos = part["position"]

        # Find the first division that comes after this part header
        first_div_pos = None
        for div in divisions:
            if div["position"] > part_pos:
                first_div_pos = div["position"]
                break

        if first_div_pos is None:
            # Last part — take text up to end
            essay_text = full_text[part_pos:]
        else:
            essay_text = full_text[part_pos:first_div_pos]

        # Strip the Part header line itself
        lines = essay_text.split("\n")
        body_lines = []
        header_skipped = False
        for line in lines:
            if not header_skipped and config.PART_HEADER_RE.search(line):
                header_skipped = True
                continue
            body_lines.append(line)

        body = "\n".join(body_lines).strip()

        # Remove page markers from the essay body
        body = re.sub(r"\n*===== PAGE \d+ =====\n*", "\n\n", body).strip()

        # Build MDX
        title = ESSAY_TITLES.get(part_num, f"Part {part_num} Essay")
        author = ESSAY_AUTHORS.get(part_num, "Unknown")

        mdx = f"""---
title: "{title}"
author: "{author}"
partNumber: {part_num}
---

{body}
"""

        out_path = os.path.join(essays_dir, f"part-{part_num:02d}-essay.mdx")
        with open(out_path, "w", encoding="utf-8") as fh:
            fh.write(mdx)
        logger.info("Essay for Part %d -> %s (%d chars)", part_num, out_path, len(body))
        extracted += 1

    logger.info("Extracted %d essays", extracted)


if __name__ == "__main__":
    extract_essays()
