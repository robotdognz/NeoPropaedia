#!/usr/bin/env python3
"""
Step 01 — Page-by-page raw text extraction from the Propaedia PDF.

Uses pdfplumber to extract text from every page and writes:
  * output/raw/page_NNN.txt  — one file per page
  * output/raw/full_text.txt — all pages concatenated (with page markers)

Usage:
    python3 pipeline/01_extract_raw.py
"""

import logging
import os
import sys
import time

import pdfplumber

# Ensure the pipeline package is importable when run standalone
sys.path.insert(0, os.path.dirname(__file__))
import config

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
logger = logging.getLogger(__name__)


def extract_raw() -> None:
    """Extract text from every page of the Propaedia PDF."""
    pdf_path = config.PDF_PATH
    raw_dir = config.ensure_dir(config.RAW_DIR)

    if not os.path.isfile(pdf_path):
        logger.error("PDF not found at %s", pdf_path)
        sys.exit(1)

    logger.info("Opening PDF: %s", pdf_path)
    start = time.time()

    full_text_path = os.path.join(raw_dir, "full_text.txt")

    with pdfplumber.open(pdf_path) as pdf:
        total = len(pdf.pages)
        logger.info("Total pages: %d", total)

        with open(full_text_path, "w", encoding="utf-8") as full_fh:
            for idx, page in enumerate(pdf.pages):
                page_num = idx + 1
                text = page.extract_text() or ""

                # Write individual page file
                page_filename = f"page_{page_num:03d}.txt"
                page_path = os.path.join(raw_dir, page_filename)
                with open(page_path, "w", encoding="utf-8") as pfh:
                    pfh.write(text)

                # Append to full text with a page marker
                full_fh.write(f"\n\n===== PAGE {page_num} =====\n\n")
                full_fh.write(text)

                if page_num % 50 == 0 or page_num == total:
                    logger.info("Extracted page %d / %d", page_num, total)

    elapsed = time.time() - start
    logger.info(
        "Raw extraction complete — %d pages in %.1f seconds", total, elapsed
    )
    logger.info("Output: %s", raw_dir)


if __name__ == "__main__":
    extract_raw()
