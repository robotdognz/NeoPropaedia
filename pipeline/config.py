"""
Shared configuration for the OxfordPropaedia PDF extraction pipeline.

Defines paths, known structural constants, and regex patterns used
across all pipeline stages.
"""

import os
import re

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------

# Root of the repository (one level up from pipeline/)
REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))

# Source PDF
PDF_PATH = os.path.join(REPO_ROOT, "Propaedia_2005.pdf")

# Intermediate output produced by pipeline stages
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "output")

# Final export targets consumed by the Astro front-end
FINAL_CONTENT_DIR = os.path.join(REPO_ROOT, "src", "content")
FINAL_DATA_DIR = os.path.join(REPO_ROOT, "src", "data")

# Convenience sub-paths inside OUTPUT_DIR
RAW_DIR = os.path.join(OUTPUT_DIR, "raw")
SECTIONS_DIR = os.path.join(OUTPUT_DIR, "sections")
ESSAYS_DIR = os.path.join(OUTPUT_DIR, "essays")

BOUNDARIES_PATH = os.path.join(OUTPUT_DIR, "boundaries.json")
CROSS_REFERENCES_PATH = os.path.join(OUTPUT_DIR, "cross_references.json")

# ---------------------------------------------------------------------------
# Known structural constants (2005 edition)
# ---------------------------------------------------------------------------

EXPECTED_PARTS = 10
EXPECTED_DIVISIONS = 41
EXPECTED_SECTIONS = 177
TOTAL_PAGES = 778

# Part names in order (used for validation and export)
PART_NAMES = {
    1: "Matter and Energy",
    2: "The Earth",
    3: "Life on Earth",
    4: "Human Life",
    5: "Human Society",
    6: "Art",
    7: "Technology",
    8: "Religion",
    9: "The History of Mankind",
    10: "The Branches of Knowledge",
}

# Number-word mapping used in Part headers
PART_NUMBER_WORDS = {
    "One": 1,
    "Two": 2,
    "Three": 3,
    "Four": 4,
    "Five": 5,
    "Six": 6,
    "Seven": 7,
    "Eight": 8,
    "Nine": 9,
    "Ten": 10,
}

# ---------------------------------------------------------------------------
# Regex patterns for boundary detection
# ---------------------------------------------------------------------------

# Part headers, e.g. "Part One  Matter and Energy"
PART_HEADER_RE = re.compile(
    r"Part\s+(One|Two|Three|Four|Five|Six|Seven|Eight|Nine|Ten)\b",
    re.IGNORECASE,
)

# Division headers, e.g. "Division I.  Atoms: ..."
DIVISION_HEADER_RE = re.compile(
    r"Division\s+(X{0,3}(?:IX|IV|V?I{0,3}))\s*\.\s*(.+)",
    re.IGNORECASE,
)

# Section headers, e.g. "Section 111.  The Structure and Properties of Atoms"
SECTION_HEADER_RE = re.compile(
    r"Section\s+(\d{1,3}(?:/\d{1,2})?)\s*\.\s*(.+)",
    re.IGNORECASE,
)

# Section code only (used for cross-reference parsing and validation)
# Handles plain codes like "111", slash-codes like "96/10", "10/34"
SECTION_CODE_RE = re.compile(
    r"\b(\d{1,3}(?:/\d{1,2})?)\b"
)

# ---------------------------------------------------------------------------
# Regex patterns for outline parsing (within a section)
# ---------------------------------------------------------------------------

# Major letter heading: A., B., C., …
OUTLINE_MAJOR_RE = re.compile(r"^([A-Z])\.\s+(.+)")

# Numeric sub-item: 1., 2., 3., …
OUTLINE_NUMERIC_RE = re.compile(r"^(\d+)\.\s+(.+)")

# Lowercase letter sub-item: a., b., c., …
OUTLINE_LOWERCASE_RE = re.compile(r"^([a-z])\.\s+(.+)")

# Roman numeral sub-item: i., ii., iii., iv., …
OUTLINE_ROMAN_RE = re.compile(r"^(i{1,3}|iv|v|vi{0,3}|ix|x)\.\s+(.+)", re.IGNORECASE)

# ---------------------------------------------------------------------------
# Regex patterns for cross-reference extraction
# ---------------------------------------------------------------------------

# Inline cross-references: "[see 423.B]", "see Section 723", "[see also 111]"
CROSSREF_INLINE_RE = re.compile(
    r"\[?\bsee\s+(?:also\s+)?(?:Section\s+)?(\d{1,3}(?:/\d{1,2})?)(?:\.([A-Z](?:\.\d+(?:\.[a-z])?)?))?",
    re.IGNORECASE,
)

# ---------------------------------------------------------------------------
# Regex patterns for Macropaedia / Micropaedia markers
# ---------------------------------------------------------------------------

MACROPAEDIA_MARKER_RE = re.compile(
    r"Suggested\s+reading\s+in\s+the\s+Macrop[ae]+dia\s*:",
    re.IGNORECASE,
)

MICROPAEDIA_MARKER_RE = re.compile(
    r"\bMicrop[ae]+dia\s*:",
    re.IGNORECASE,
)

# ---------------------------------------------------------------------------
# Helper utilities
# ---------------------------------------------------------------------------


def ensure_dir(path: str) -> str:
    """Create a directory (and parents) if it does not exist. Returns the path."""
    os.makedirs(path, exist_ok=True)
    return path


def section_code_to_filename(code: str) -> str:
    """Convert a section code to a safe filename component.

    Slash codes like '96/10' become '96-10'.
    """
    return code.replace("/", "-")


def filename_to_section_code(filename: str) -> str:
    """Reverse of section_code_to_filename.

    Filenames like '96-10.json' are mapped back to '96/10'.
    Only applies the transformation when the pattern matches a slash-code.
    """
    stem = filename.replace(".json", "")
    # If the stem looks like it was a slash code (digits-digits), restore
    parts = stem.split("-")
    if len(parts) == 2 and all(p.isdigit() for p in parts):
        return f"{parts[0]}/{parts[1]}"
    return stem
