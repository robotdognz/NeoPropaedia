#!/usr/bin/env python3
"""
Pipeline orchestrator — runs all extraction steps in order.

Usage:
    python3 pipeline/run_all.py              # run all steps
    python3 pipeline/run_all.py --from 3     # resume from step 03
    python3 pipeline/run_all.py --only 5     # run only step 05
    python3 pipeline/run_all.py --list       # list available steps

Each step is a module in the pipeline/ directory following the naming
convention NN_name.py.  The orchestrator imports and calls the module's
main entry-point function, logging progress and elapsed time.
"""

import argparse
import importlib
import logging
import os
import sys
import time

sys.path.insert(0, os.path.dirname(__file__))

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
logger = logging.getLogger(__name__)

# Ordered list of (step_number, module_name, entry_function_name, description)
STEPS = [
    (1, "01_extract_raw", "extract_raw", "Page-by-page PDF text extraction"),
    (2, "02_identify_boundaries", "identify_boundaries", "Part/Division/Section boundary detection"),
    (3, "03_parse_structure", "parse_structure", "Recursive outline parsing"),
    (4, "04_clean_text", "clean_sections", "Text cleaning and normalization"),
    (5, "05_extract_essays", "extract_essays", "Introductory essay extraction"),
    (6, "06_parse_crossrefs", "parse_crossrefs", "Cross-reference parsing"),
    (7, "07_parse_macropaedia", "parse_macropaedia", "Macropaedia reference extraction"),
    (8, "08_strip_micropaedia", "strip_micropaedia", "Micropaedia block removal"),
    (9, "09_validate", "validate", "Validation checks"),
    (10, "10_export_json", "export_all", "Final JSON/MDX export"),
]


def list_steps() -> None:
    """Print available pipeline steps."""
    print("\nAvailable pipeline steps:\n")
    for num, module, _, desc in STEPS:
        print(f"  {num:2d}. {module}.py — {desc}")
    print()


def run_step(num: int, module_name: str, func_name: str, desc: str) -> bool:
    """Import a step module and call its entry function. Returns True on success."""
    logger.info("=" * 60)
    logger.info("STEP %d: %s", num, desc)
    logger.info("=" * 60)

    start = time.time()
    try:
        mod = importlib.import_module(module_name)
        func = getattr(mod, func_name)
        result = func()
        elapsed = time.time() - start
        logger.info("Step %d completed in %.1f seconds", num, elapsed)

        # Step 09 (validate) returns a bool
        if num == 9 and result is False:
            logger.warning("Validation reported failures — continuing anyway")
        return True

    except SystemExit as exc:
        elapsed = time.time() - start
        logger.error("Step %d exited with code %s after %.1f seconds", num, exc.code, elapsed)
        return False
    except Exception:
        elapsed = time.time() - start
        logger.exception("Step %d failed after %.1f seconds", num, elapsed)
        return False


def main() -> None:
    parser = argparse.ArgumentParser(
        description="OxfordPropaedia PDF extraction pipeline orchestrator"
    )
    parser.add_argument(
        "--from",
        dest="start_from",
        type=int,
        default=1,
        help="Start from this step number (default: 1)",
    )
    parser.add_argument(
        "--only",
        type=int,
        default=None,
        help="Run only this step number",
    )
    parser.add_argument(
        "--list",
        action="store_true",
        help="List available steps and exit",
    )
    args = parser.parse_args()

    if args.list:
        list_steps()
        return

    pipeline_start = time.time()

    if args.only is not None:
        # Run a single step
        matched = [s for s in STEPS if s[0] == args.only]
        if not matched:
            logger.error("No step %d found. Use --list to see available steps.", args.only)
            sys.exit(1)
        num, mod, func, desc = matched[0]
        success = run_step(num, mod, func, desc)
        if not success:
            sys.exit(1)
    else:
        # Run all steps from the given starting point
        steps_to_run = [s for s in STEPS if s[0] >= args.start_from]
        if not steps_to_run:
            logger.error("No steps to run from step %d", args.start_from)
            sys.exit(1)

        logger.info("Running %d pipeline steps (from step %d)", len(steps_to_run), args.start_from)
        for num, mod, func, desc in steps_to_run:
            success = run_step(num, mod, func, desc)
            if not success:
                logger.error("Pipeline halted at step %d", num)
                sys.exit(1)

    total_elapsed = time.time() - pipeline_start
    logger.info("=" * 60)
    logger.info("Pipeline finished in %.1f seconds", total_elapsed)
    logger.info("=" * 60)


if __name__ == "__main__":
    main()
