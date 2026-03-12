#!/usr/bin/env python3
"""
Step 09 — Validation of extracted Propaedia data.

Checks:
  * Exactly 10 parts extracted
  * Exactly 41 divisions extracted
  * Exactly 177 sections extracted
  * All section codes match the expected pattern
  * Cross-references point to existing sections
  * No missing or unexpected items

Reports a summary with PASS / FAIL status for each check.

Usage:
    python3 pipeline/09_validate.py
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


class ValidationResult:
    """Accumulates pass/fail checks and prints a summary."""

    def __init__(self):
        self.checks: list[tuple[str, bool, str]] = []

    def check(self, name: str, passed: bool, detail: str = "") -> None:
        status = "PASS" if passed else "FAIL"
        self.checks.append((name, passed, detail))
        level = logging.INFO if passed else logging.ERROR
        msg = f"[{status}] {name}"
        if detail:
            msg += f" — {detail}"
        logger.log(level, msg)

    @property
    def all_passed(self) -> bool:
        return all(passed for _, passed, _ in self.checks)

    def summary(self) -> str:
        total = len(self.checks)
        passed = sum(1 for _, p, _ in self.checks if p)
        failed = total - passed
        return f"{passed}/{total} checks passed, {failed} failed"


def validate() -> bool:
    """Run all validation checks. Returns True if everything passes."""
    vr = ValidationResult()

    # ------------------------------------------------------------------
    # Load boundaries
    # ------------------------------------------------------------------
    if not os.path.isfile(config.BOUNDARIES_PATH):
        logger.error("boundaries.json not found — run earlier steps first")
        sys.exit(1)

    with open(config.BOUNDARIES_PATH, "r", encoding="utf-8") as fh:
        boundaries = json.load(fh)

    parts = boundaries.get("parts", [])
    divisions = boundaries.get("divisions", [])
    sections = boundaries.get("sections", [])

    # ------------------------------------------------------------------
    # Count checks
    # ------------------------------------------------------------------
    vr.check(
        "Part count",
        len(parts) == config.EXPECTED_PARTS,
        f"expected {config.EXPECTED_PARTS}, found {len(parts)}",
    )

    vr.check(
        "Division count",
        len(divisions) == config.EXPECTED_DIVISIONS,
        f"expected {config.EXPECTED_DIVISIONS}, found {len(divisions)}",
    )

    vr.check(
        "Section count",
        len(sections) == config.EXPECTED_SECTIONS,
        f"expected {config.EXPECTED_SECTIONS}, found {len(sections)}",
    )

    # ------------------------------------------------------------------
    # Section code format
    # ------------------------------------------------------------------
    section_codes = {s["sectionCode"] for s in sections}
    bad_codes = []
    for code in section_codes:
        if not config.SECTION_CODE_RE.fullmatch(code):
            bad_codes.append(code)

    vr.check(
        "Section code format",
        len(bad_codes) == 0,
        f"{len(bad_codes)} invalid code(s): {bad_codes[:10]}" if bad_codes else "all codes valid",
    )

    # ------------------------------------------------------------------
    # Section JSON files exist
    # ------------------------------------------------------------------
    sections_dir = config.SECTIONS_DIR
    missing_files = []
    for code in section_codes:
        filename = config.section_code_to_filename(code) + ".json"
        if not os.path.isfile(os.path.join(sections_dir, filename)):
            missing_files.append(code)

    vr.check(
        "Section JSON files",
        len(missing_files) == 0,
        f"{len(missing_files)} missing: {missing_files[:10]}" if missing_files else "all present",
    )

    # ------------------------------------------------------------------
    # Cross-reference targets
    # ------------------------------------------------------------------
    xref_path = config.CROSS_REFERENCES_PATH
    dangling = []
    if os.path.isfile(xref_path):
        with open(xref_path, "r", encoding="utf-8") as fh:
            xref_data = json.load(fh)
        for ref in xref_data.get("references", []):
            target = ref.get("targetSection", "")
            if target and target not in section_codes:
                dangling.append(
                    f"{ref.get('sourceSection', '?')}->{target}"
                )
        vr.check(
            "Cross-reference targets exist",
            len(dangling) == 0,
            f"{len(dangling)} dangling: {dangling[:10]}" if dangling else "all targets valid",
        )
    else:
        vr.check(
            "Cross-reference file exists",
            False,
            "cross_references.json not found",
        )

    # ------------------------------------------------------------------
    # Part numbers are 1..10
    # ------------------------------------------------------------------
    part_nums = sorted(p["partNumber"] for p in parts)
    expected_parts = list(range(1, config.EXPECTED_PARTS + 1))
    vr.check(
        "Part numbers complete",
        part_nums == expected_parts,
        f"found {part_nums}" if part_nums != expected_parts else "1-10 present",
    )

    # ------------------------------------------------------------------
    # Outline non-empty for each section
    # ------------------------------------------------------------------
    empty_outlines = []
    if os.path.isdir(sections_dir):
        for code in section_codes:
            filename = config.section_code_to_filename(code) + ".json"
            fpath = os.path.join(sections_dir, filename)
            if os.path.isfile(fpath):
                with open(fpath, "r", encoding="utf-8") as fh:
                    data = json.load(fh)
                if not data.get("outline"):
                    empty_outlines.append(code)

    vr.check(
        "Non-empty outlines",
        len(empty_outlines) == 0,
        f"{len(empty_outlines)} empty: {sorted(empty_outlines)[:10]}"
        if empty_outlines
        else "all sections have outline data",
    )

    # ------------------------------------------------------------------
    # Summary
    # ------------------------------------------------------------------
    logger.info("=" * 60)
    logger.info("Validation %s", vr.summary())
    if not vr.all_passed:
        logger.warning("Some checks failed — review the output above")
    logger.info("=" * 60)

    return vr.all_passed


if __name__ == "__main__":
    success = validate()
    sys.exit(0 if success else 1)
