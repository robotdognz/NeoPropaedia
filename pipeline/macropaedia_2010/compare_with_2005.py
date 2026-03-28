#!/usr/bin/env python3
"""Compare parsed 2010 Macropaedia article candidates against the 2005 baseline."""

from __future__ import annotations

import argparse
import json
import re
import unicodedata
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
OUTPUT_DIR = REPO_ROOT / "pipeline" / "output" / "macropaedia_2010"
BASELINE_PATH = OUTPUT_DIR / "2005_baseline_titles.json"
CANDIDATES_PATH = OUTPUT_DIR / "2010_article_candidates.json"
OUTPUT_PATH = OUTPUT_DIR / "2010_vs_2005_comparison.json"


PARENTHETICAL_RE = re.compile(r"\s*\([^)]*\)")
WHITESPACE_RE = re.compile(r"\s+")
PUNCTUATION_RE = re.compile(r"[^a-z0-9 ]+")


def normalize_key(value: str) -> str:
    ascii_value = (
        unicodedata.normalize("NFKD", value)
        .encode("ascii", "ignore")
        .decode("ascii")
        .lower()
    )
    ascii_value = ascii_value.replace("&", " and ")
    ascii_value = ascii_value.replace("-", " ")
    ascii_value = ascii_value.replace(",", " ")
    ascii_value = PUNCTUATION_RE.sub(" ", ascii_value)
    return WHITESPACE_RE.sub(" ", ascii_value).strip()


def lookup_variants(title: str) -> set[str]:
    variants = {normalize_key(title)}

    without_parenthetical = PARENTHETICAL_RE.sub("", title).strip()
    if without_parenthetical and without_parenthetical != title:
        variants.add(normalize_key(without_parenthetical))

    if "," in title:
        head, tail = [part.strip() for part in title.split(",", 1)]
        if head and tail:
            variants.add(normalize_key(f"{tail} {head}"))
            if " " not in tail:
                variants.add(normalize_key(head))

    compact_variants = {variant.replace(" ", "") for variant in variants if variant}
    return {variant for variant in variants.union(compact_variants) if variant}


def build_comparison_payload(baseline: dict, candidates: dict) -> dict:
    baseline_titles = {entry["lookupKey"]: entry for entry in baseline["titles"]}
    baseline_variants: dict[str, dict] = {}
    baseline_matched_keys: set[str] = set()
    candidate_titles: dict[str, dict] = {}
    candidate_variant_hits: dict[str, str] = {}

    for entry in baseline["titles"]:
        for variant in lookup_variants(entry["title"]):
            baseline_variants.setdefault(variant, entry)

    for volume in candidates["volumes"]:
        for article in volume["articles"]:
            existing = candidate_titles.get(article["lookupKey"])
            if existing is None:
                candidate_titles[article["lookupKey"]] = {
                    "title": article["title"],
                    "lookupKey": article["lookupKey"],
                    "volumes": [volume["volumeNumber"]],
                    "startPages": [article["startPage"]],
                    "pageCountEstimates": [article["pageCountEstimate"]],
                }
            else:
                if volume["volumeNumber"] not in existing["volumes"]:
                    existing["volumes"].append(volume["volumeNumber"])
                existing["startPages"].append(article["startPage"])
                existing["pageCountEstimates"].append(article["pageCountEstimate"])

    for key, entry in candidate_titles.items():
        matched_baseline = None
        for variant in lookup_variants(entry["title"]):
            if variant in baseline_variants:
                matched_baseline = baseline_variants[variant]
                break
        if matched_baseline is not None:
            candidate_variant_hits[key] = matched_baseline["lookupKey"]
            baseline_matched_keys.add(matched_baseline["lookupKey"])

    added = sorted(
        [entry for key, entry in candidate_titles.items() if key not in candidate_variant_hits],
        key=lambda item: item["title"].lower(),
    )
    unchanged = sorted(
        [
            {
                **entry,
                "matchedBaselineTitle": baseline_titles[candidate_variant_hits[key]]["title"],
                "matchedBaselineLookupKey": candidate_variant_hits[key],
            }
            for key, entry in candidate_titles.items()
            if key in candidate_variant_hits
        ],
        key=lambda item: item["title"].lower(),
    )
    missing = sorted(
        [entry for key, entry in baseline_titles.items() if key not in baseline_matched_keys],
        key=lambda item: item["title"].lower(),
    )

    return {
        "baselineUniqueCount": len(baseline_titles),
        "candidateUniqueCount": len(candidate_titles),
        "matchedCount": len(unchanged),
        "newIn2010Count": len(added),
        "missingFrom2010Count": len(missing),
        "newIn2010": added,
        "matched": unchanged,
        "missingFrom2010": missing,
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline", type=Path, default=BASELINE_PATH)
    parser.add_argument("--candidates", type=Path, default=CANDIDATES_PATH)
    parser.add_argument("--output", type=Path, default=OUTPUT_PATH)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    baseline = json.loads(args.baseline.read_text())
    candidates = json.loads(args.candidates.read_text())
    payload = build_comparison_payload(baseline, candidates)

    args.output.write_text(json.dumps(payload, indent=2, ensure_ascii=True) + "\n")
    print(f"Wrote comparison report to {args.output}")


if __name__ == "__main__":
    main()
