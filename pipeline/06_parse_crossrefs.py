#!/usr/bin/env python3
"""
Step 06 — Cross-reference parser.

Scans every section JSON in output/sections/ for inline cross-reference
patterns such as:

    [see 423.B]
    see Section 723
    [see also 111.A.2]

Builds two data structures:
  * Forward index — for each section, a list of outgoing references
  * Reverse index — for each target section, a list of incoming references

Updates each section JSON's "crossReferences" field in-place and writes
a combined output/cross_references.json.

Usage:
    python3 pipeline/06_parse_crossrefs.py
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


def _extract_path_from_node(node: dict, current_path: str = "") -> list[dict]:
    """Recursively walk an outline node and find cross-references.

    Returns a list of dicts with keys: fromPath, targetSection, targetPath.
    """
    refs = []
    text = node.get("text", "")
    level = node.get("level", "")

    # Build the dot-separated path for this node
    this_path = f"{current_path}.{level}" if current_path else level

    for m in config.CROSSREF_INLINE_RE.finditer(text):
        target_section = m.group(1)
        target_path = m.group(2) or ""
        refs.append({
            "fromPath": this_path,
            "targetSection": target_section,
            "targetPath": target_path,
        })

    for child in node.get("children", []):
        refs.extend(_extract_path_from_node(child, this_path))

    return refs


def parse_crossrefs() -> None:
    """Parse cross-references from all section JSONs."""
    sections_dir = config.SECTIONS_DIR
    if not os.path.isdir(sections_dir):
        logger.error("sections directory not found — run 03_parse_structure.py first")
        sys.exit(1)

    files = sorted(f for f in os.listdir(sections_dir) if f.endswith(".json"))

    all_forward: list[dict] = []
    reverse_index: dict[str, list[dict]] = {}

    for fname in files:
        path = os.path.join(sections_dir, fname)
        with open(path, "r", encoding="utf-8") as fh:
            data = json.load(fh)

        source_code = data.get("sectionCode", "")
        refs = []
        for node in data.get("outline", []):
            refs.extend(_extract_path_from_node(node))

        # Update the section JSON in-place
        data["crossReferences"] = refs
        with open(path, "w", encoding="utf-8") as fh:
            json.dump(data, fh, indent=2, ensure_ascii=False)

        # Build forward list
        for ref in refs:
            entry = {
                "sourceSection": source_code,
                "sourcePath": ref["fromPath"],
                "targetSection": ref["targetSection"],
            }
            if ref.get("targetPath"):
                entry["targetPath"] = ref["targetPath"]
            all_forward.append(entry)

            # Reverse
            target = ref["targetSection"]
            reverse_entry = {
                "sourceSection": source_code,
                "sourcePath": ref["fromPath"],
            }
            if ref.get("targetPath"):
                reverse_entry["targetPath"] = ref["targetPath"]
            reverse_index.setdefault(target, []).append(reverse_entry)

        if refs:
            logger.info("Section %s: %d cross-references", source_code, len(refs))

    output = {
        "references": all_forward,
        "reverseIndex": reverse_index,
    }
    config.ensure_dir(config.OUTPUT_DIR)
    with open(config.CROSS_REFERENCES_PATH, "w", encoding="utf-8") as fh:
        json.dump(output, fh, indent=2, ensure_ascii=False)

    logger.info(
        "Cross-references: %d forward, %d target sections with reverse links",
        len(all_forward),
        len(reverse_index),
    )
    logger.info("Wrote %s", config.CROSS_REFERENCES_PATH)


if __name__ == "__main__":
    parse_crossrefs()
