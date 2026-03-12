#!/usr/bin/env python3
"""Extract Macropaedia references from raw page text and inject into content section JSONs."""

import json
import re
from pathlib import Path

RAW_DIR = Path('pipeline/output/raw')
SECTIONS_DIR = Path('src/content/sections')


def extract_from_raw_pages() -> dict[str, list[str]]:
    """Scan all raw pages, find macropaedia markers, extract article titles."""
    # Concatenate all pages in order
    pages = sorted(RAW_DIR.glob('page_*.txt'), key=lambda p: int(p.stem.split('_')[1]))
    full_text = ''
    for p in pages:
        full_text += p.read_text(encoding='utf-8') + '\n'

    # Find all macropaedia markers
    # Pattern: "macropaedia:" possibly preceded by "Suggested reading..." line
    # After the marker line, article titles follow until a blank line, "micropaedia:", or next section
    pattern = re.compile(
        r'macropaedia:\s*[^\n]*\n(.*?)(?=\nmicropaedia:|\nSuggested reading|\nSection \d|\n\d{3}\s|$)',
        re.IGNORECASE | re.DOTALL
    )

    # We need to associate each macropaedia block with its section.
    # Strategy: find section headers, then find macropaedia blocks between them.

    # Find all section starts: "Section 111." or "Section 10/31." patterns
    section_pattern = re.compile(r'^Section\s+(\d{3}|\d+/\d+)\.\s', re.MULTILINE)
    section_positions = [(m.group(1), m.start()) for m in section_pattern.finditer(full_text)]

    # Also try: lines that start with the section code pattern at the beginning of content
    # The raw text has "Section NNN. Title" headers

    results: dict[str, list[str]] = {}

    for i, (code, start) in enumerate(section_positions):
        end = section_positions[i + 1][1] if i + 1 < len(section_positions) else len(full_text)
        block = full_text[start:end]

        # Find macropaedia marker in this block
        macro_match = re.search(r'macropaedia:\s*[^\n]*\n', block, re.IGNORECASE)
        if not macro_match:
            continue

        after = block[macro_match.end():]
        titles = []
        for line in after.split('\n'):
            stripped = line.strip()
            if not stripped:
                if titles:
                    break
                continue
            # Stop at micropaedia marker or next section
            if re.match(r'micropaedia:', stripped, re.IGNORECASE):
                break
            if re.match(r'Section\s+\d', stripped):
                break
            if re.match(r'^\d+\s+Part\s+', stripped):
                break
            # Clean up
            cleaned = re.sub(r'^[-\u2022\u2013*]\s*', '', stripped)
            # Skip lines that look like page headers (e.g., "22 Part One. Matter and Energy")
            if re.match(r'^\d+\s+Part\s+', cleaned):
                continue
            if cleaned and len(cleaned) > 3:
                titles.append(cleaned)

        if titles:
            results[code] = titles

    return results


def main():
    refs = extract_from_raw_pages()
    print(f'Extracted macropaedia refs for {len(refs)} sections')

    # Inject into content section JSONs
    updated = 0
    for json_file in sorted(SECTIONS_DIR.glob('*.json')):
        data = json.loads(json_file.read_text())
        code = data['sectionCode']

        if code in refs:
            data['macropaediaReferences'] = refs[code]
            json_file.write_text(json.dumps(data, indent=2, ensure_ascii=False) + '\n')
            updated += 1

    print(f'Updated {updated} section files')

    # Show some examples
    for code in list(refs.keys())[:5]:
        print(f'  {code}: {refs[code][:3]}{"..." if len(refs[code]) > 3 else ""}')

    # Show sections without refs
    all_codes = set()
    for f in SECTIONS_DIR.glob('*.json'):
        d = json.loads(f.read_text())
        all_codes.add(d['sectionCode'])
    missing = all_codes - set(refs.keys())
    if missing:
        print(f'Sections without macropaedia refs: {sorted(missing)}')


if __name__ == '__main__':
    main()
