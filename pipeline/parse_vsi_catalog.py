#!/usr/bin/env python3
"""Parse VSI catalog from Wikipedia wikitext into catalog.json."""

import json
import re
import sys
from pathlib import Path


def strip_wiki_markup(text: str) -> str:
    """Remove wiki markup from text, keeping display text."""
    text = text.strip()
    # Remove ref tags and their content
    text = re.sub(r'<ref[^>]*>.*?</ref>', '', text, flags=re.DOTALL)
    text = re.sub(r'<ref[^>]*/>', '', text)
    # Remove '' (italic markers)
    text = text.replace("''", "")
    # Handle [[Link|Display]] → Display
    text = re.sub(r'\[\[[^\]]*\|([^\]]*)\]\]', r'\1', text)
    # Handle [[Link]] → Link
    text = re.sub(r'\[\[([^\]]*)\]\]', r'\1', text)
    # Remove {{ISBN|...}}
    text = re.sub(r'\{\{ISBN\|[^}]*\}\}', '', text)
    return text.strip()


def parse_date(date_str: str) -> tuple[str, int | None, int | None]:
    """Parse a publication date cell, returning (full_date_str, year, edition).

    Handles:
    - Single date: "{{dts|24 February 2000}}"
    - Multiple editions: "{{dts|24 Feb 2000}} <br /> {{dts|25 Feb 2021}} (2nd ed.)"
    - Plain dates: "28 November 2024"
    """
    date_str = date_str.strip()
    if not date_str:
        return ('', None, None)

    # Split on <br /> or <br/> to find multiple editions
    parts = re.split(r'<\s*br\s*/?\s*>', date_str)

    latest_year = None
    latest_edition = None

    for part in parts:
        part = part.strip()
        if not part:
            continue

        # Extract year from {{dts|...}} or plain date
        dts_match = re.search(r'\{\{dts\|[^}]*?(\d{4})\}\}', part)
        plain_match = re.search(r'(\d{4})', part)

        year = None
        if dts_match:
            year = int(dts_match.group(1))
        elif plain_match:
            year = int(plain_match.group(1))

        # Check for edition marker
        ed_match = re.search(r'\((\d+)\w+\s+ed\.?\)', part)
        edition = int(ed_match.group(1)) if ed_match else 1

        if year and (latest_year is None or year > latest_year):
            latest_year = year
            latest_edition = edition

    return (date_str, latest_year, latest_edition)


def parse_row(cells: list[str]) -> dict | None:
    """Parse a table row into a VSI entry dict."""
    if len(cells) < 4:
        return None

    # cells: [number, title, author(s), uk_pub_date, original_pub, category]
    number_str = cells[0].strip()
    # Handle rowspan prefix
    number_str = re.sub(r'rowspan\s*=\s*"?\d+"?\s*\|\s*', '', number_str).strip()

    try:
        number = int(number_str)
    except ValueError:
        return None

    title = strip_wiki_markup(cells[1])
    # Handle rowspan in title cell
    title = re.sub(r'rowspan\s*=\s*"?\d+"?\s*\|\s*', '', title).strip()

    author = strip_wiki_markup(cells[2])
    # Clean up author - remove illustrator notes
    author = re.sub(r'\(illustrator:.*?\)', '', author).strip()
    # Remove trailing commas
    author = author.rstrip(',').strip()

    pub_date_str = cells[3] if len(cells) > 3 else ''
    _, pub_year, edition = parse_date(pub_date_str)

    # If no year from UK pub date, try original pub column
    if pub_year is None and len(cells) > 4:
        orig = cells[4].strip()
        year_match = re.search(r'(\d{4})', orig)
        if year_match:
            pub_year = int(year_match.group(1))

    subject = strip_wiki_markup(cells[5]) if len(cells) > 5 else ''

    if not title:
        return None

    entry = {
        'title': title,
        'author': author,
        'number': number,
    }
    if subject:
        entry['subject'] = subject
    if pub_year:
        entry['publicationYear'] = pub_year
    if edition and edition > 1:
        entry['edition'] = edition

    return entry


def main():
    wikitext_path = Path('/tmp/vsi_wikitext.txt')
    if not wikitext_path.exists():
        print("Error: /tmp/vsi_wikitext.txt not found", file=sys.stderr)
        sys.exit(1)

    text = wikitext_path.read_text(encoding='utf-8')

    # Find the table
    table_start = text.find('{| class="wikitable')
    table_end = text.find('|}', table_start)
    if table_start < 0 or table_end < 0:
        print("Error: Could not find wikitable", file=sys.stderr)
        sys.exit(1)

    table_text = text[table_start:table_end]

    # Split into rows by |- (handle optional leading whitespace)
    raw_rows = re.split(r'\n\s*\|-\s*\n', table_text)

    entries: dict[int, dict] = {}  # number -> entry (keeps latest author for rowspan)
    pending_rowspan_number: int | None = None
    pending_rowspan_title: str | None = None

    for raw_row in raw_rows[1:]:  # Skip header
        lines = raw_row.strip().split('\n')

        # Detect format: if lines use || separators (inline) vs one-cell-per-line
        joined = ' '.join(lines)
        if '||' in joined:
            # Inline format: | 001 || ''Title'' || Author || Date || Orig || Cat
            cells = re.split(r'\|\|', joined)
            if cells and cells[0].strip().startswith('|'):
                cells[0] = cells[0].strip().lstrip('|')
        else:
            # Newline-per-cell format:
            # |766
            # |''[[Symbiosis]]''
            # |Author
            # |Date
            # |
            # |Category
            cells = []
            for line in lines:
                line = line.strip()
                if line.startswith('|'):
                    cells.append(line[1:])
                elif cells:
                    cells[-1] += ' ' + line

        cells = [c.strip() for c in cells]

        # Check if this is a rowspan continuation row (no number, just author/date)
        rowspan_match = re.search(r'rowspan\s*=\s*"?(\d+)"?', cells[0] if cells else '')

        if rowspan_match:
            # This is the first row of a rowspan group
            entry = parse_row(cells)
            if entry:
                pending_rowspan_number = entry['number']
                pending_rowspan_title = entry['title']
                entries[entry['number']] = entry
        elif pending_rowspan_number is not None and cells:
            # Continuation row - this is the newer author (possibly with a renamed title)
            # cells: [author, date, orig, category] or [title, author, date, orig, category]
            if len(cells) >= 3:
                # Figure out if first cell is a title or an author
                # A title cell has '' (italic) markers — authors use [[ ]] but not italics
                first_raw = cells[0].strip()
                has_title_markup = first_raw.startswith("''")
                first = strip_wiki_markup(first_raw)

                if has_title_markup and len(cells) >= 4:
                    # First cell is a (possibly renamed) title
                    new_title = first
                    author = strip_wiki_markup(cells[1])
                    pub_date_str = cells[2] if len(cells) > 2 else ''
                else:
                    new_title = None
                    author = strip_wiki_markup(cells[0])
                    pub_date_str = cells[1] if len(cells) > 1 else ''

                _, pub_year, edition = parse_date(pub_date_str)

                # Update entry with newer author (and possibly renamed title)
                old = entries.get(pending_rowspan_number, {})
                old_year = old.get('publicationYear', 0)
                if pub_year and (old_year is None or pub_year > (old_year or 0)):
                    old['author'] = author.rstrip(',').strip()
                    old['publicationYear'] = pub_year
                    if new_title:
                        old['title'] = new_title
                    if edition and edition > 1:
                        old['edition'] = edition

            pending_rowspan_number = None
            pending_rowspan_title = None
        else:
            pending_rowspan_number = None
            pending_rowspan_title = None
            entry = parse_row(cells)
            if entry:
                num = entry['number']
                if num in entries:
                    # Keep the one with the later year (latest edition)
                    existing_year = entries[num].get('publicationYear', 0) or 0
                    new_year = entry.get('publicationYear', 0) or 0
                    if new_year >= existing_year:
                        entries[num] = entry
                else:
                    entries[num] = entry

    # Sort by number
    catalog = sorted(entries.values(), key=lambda x: x['number'])

    print(f"Parsed {len(catalog)} VSI titles")

    # Validate
    numbers = [e['number'] for e in catalog]
    expected = set(range(1, max(numbers) + 1))
    missing = expected - set(numbers)
    if missing:
        print(f"Warning: missing numbers: {sorted(missing)}")

    # Check for entries without authors
    no_author = [e for e in catalog if not e.get('author')]
    if no_author:
        print(f"Warning: {len(no_author)} entries without authors")

    # Write output
    output_path = Path(__file__).parent.parent / 'src' / 'content' / 'vsi' / 'catalog.json'
    output = {'titles': catalog}
    output_path.write_text(json.dumps(output, indent=2, ensure_ascii=False) + '\n')
    print(f"Wrote {len(catalog)} entries to {output_path}")

    # Print some stats
    editions = [e for e in catalog if e.get('edition', 1) > 1]
    print(f"  - {len(editions)} titles with 2nd+ editions")
    with_year = [e for e in catalog if e.get('publicationYear')]
    print(f"  - {len(with_year)} titles with publication years")


if __name__ == '__main__':
    main()
