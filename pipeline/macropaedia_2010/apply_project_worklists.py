#!/usr/bin/env python3
"""Apply edited Macropaedia 2010 project worklists back into the project database."""

from __future__ import annotations

import argparse
import csv
import sqlite3

from paths import PROJECT_DATA_DIR


DEFAULT_DB_PATH = PROJECT_DATA_DIR / "macropaedia_2010_project.sqlite"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--db", type=Path, default=DEFAULT_DB_PATH)
    return parser.parse_args()


def read_csv(path: Path) -> list[dict[str, str]]:
    with path.open(newline="", encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


def article_id_lookup(connection: sqlite3.Connection) -> dict[tuple[int, str], int]:
    rows = connection.execute(
        "SELECT article_id, volume_number, start_page_label FROM articles"
    ).fetchall()
    return {(int(row[1]), row[2]): int(row[0]) for row in rows}


def clean(value: str) -> str:
    return " ".join(value.split()).strip()


def apply_identity_worklist(connection: sqlite3.Connection, lookup: dict[tuple[int, str], int]) -> None:
    rows = read_csv(PROJECT_DATA_DIR / "article_identity_worklist.csv")
    for row in rows:
        key = (int(row["volume_number"]), row["start_page_label"])
        article_id = lookup[key]
        propaedia_name = clean(row.get("propaedia_name", ""))
        source_path = clean(row.get("propaedia_name_source_image_path", ""))
        notes = clean(row.get("notes", ""))
        page_length_raw = clean(row.get("page_length", ""))
        page_length = int(page_length_raw) if page_length_raw else None
        status = "confirmed" if propaedia_name else "missing"

        connection.execute(
            """
            UPDATE articles
            SET page_length = ?,
                propaedia_name = ?,
                propaedia_name_status = ?,
                propaedia_name_source_image_path = ?,
                notes = ?
            WHERE article_id = ?
            """,
            (page_length, propaedia_name or None, status, source_path or None, notes or None, article_id),
        )


def apply_article_contents_worklist(connection: sqlite3.Connection, lookup: dict[tuple[int, str], int]) -> None:
    rows = read_csv(PROJECT_DATA_DIR / "article_contents_capture_worklist.csv")
    connection.execute("DELETE FROM images WHERE image_kind = 'article_contents'")
    connection.execute("UPDATE articles SET article_contents_image_status = 'missing'")

    status_by_article: dict[int, str] = {}
    notes_by_article: dict[int, str] = {}

    for row in rows:
        key = (int(row["volume_number"]), row["start_page_label"])
        article_id = lookup[key]
        path = clean(row.get("article_contents_image_relative_path", ""))
        status = clean(row.get("capture_status", "")) or "missing"
        notes = clean(row.get("notes", ""))

        if path:
            connection.execute(
                """
                INSERT INTO images(
                    image_kind,
                    relative_path,
                    volume_number,
                    article_id,
                    linked_start_page_label,
                    page_reference,
                    capture_status,
                    notes
                ) VALUES('article_contents', ?, ?, ?, ?, ?, ?, ?)
                """,
                (path, key[0], article_id, key[1], key[1], status, notes or None),
            )
        status_by_article[article_id] = status
        if notes:
            notes_by_article[article_id] = notes

    for article_id, status in status_by_article.items():
        connection.execute(
            "UPDATE articles SET article_contents_image_status = ? WHERE article_id = ?",
            (status, article_id),
        )


def apply_propaedia_mapping_worklist(connection: sqlite3.Connection, lookup: dict[tuple[int, str], int]) -> None:
    rows = read_csv(PROJECT_DATA_DIR / "propaedia_mapping_worklist.csv")
    connection.execute("DELETE FROM propaedia_mappings")
    connection.execute("UPDATE articles SET propaedia_mapping_status = 'missing'")

    counts: dict[int, int] = {}
    max_confidence: dict[int, str] = {}
    confidence_rank = {"draft": 1, "probable": 2, "confirmed": 3}

    for row in rows:
        key = (int(row["volume_number"]), row["start_page_label"])
        article_id = lookup[key]
        fields = {
            "part_number": clean(row.get("part_number", "")),
            "division_id": clean(row.get("division_id", "")),
            "section_code": clean(row.get("section_code", "")),
            "subsection_path": clean(row.get("subsection_path", "")),
            "source_image_relative_path": clean(row.get("source_image_relative_path", "")),
            "notes": clean(row.get("notes", "")),
        }
        if not any(fields.values()):
            continue

        confidence = clean(row.get("confidence", "")) or "draft"
        connection.execute(
            """
            INSERT INTO propaedia_mappings(
                article_id,
                mapping_order,
                part_number,
                division_id,
                section_code,
                subsection_path,
                confidence,
                source_image_relative_path,
                notes
            ) VALUES(
                ?,
                COALESCE((SELECT COUNT(*) + 1 FROM propaedia_mappings WHERE article_id = ?), 1),
                ?, ?, ?, ?, ?, ?, ?
            )
            """,
            (
                article_id,
                article_id,
                int(fields["part_number"]) if fields["part_number"] else None,
                fields["division_id"] or None,
                fields["section_code"] or None,
                fields["subsection_path"] or None,
                confidence,
                fields["source_image_relative_path"] or None,
                fields["notes"] or None,
            ),
        )
        counts[article_id] = counts.get(article_id, 0) + 1
        existing = max_confidence.get(article_id, "draft")
        if confidence_rank.get(confidence, 0) > confidence_rank.get(existing, 0):
            max_confidence[article_id] = confidence

    for article_id, count in counts.items():
        status = "confirmed" if max_confidence.get(article_id) == "confirmed" else "partial"
        connection.execute(
            "UPDATE articles SET propaedia_mapping_status = ? WHERE article_id = ?",
            (status, article_id),
        )


def apply_britannica_worklist(connection: sqlite3.Connection, lookup: dict[tuple[int, str], int]) -> None:
    rows = read_csv(PROJECT_DATA_DIR / "britannica_breakdown_worklist.csv")
    connection.execute("DELETE FROM britannica_targets")
    connection.execute("UPDATE articles SET britannica_mapping_status = 'missing'")

    counts: dict[int, int] = {}
    max_confidence: dict[int, str] = {}
    confidence_rank = {"draft": 1, "probable": 2, "confirmed": 3}

    for row in rows:
        key = (int(row["volume_number"]), row["start_page_label"])
        article_id = lookup[key]
        title = clean(row.get("britannica_title", ""))
        url = clean(row.get("britannica_url", ""))
        source_image_path = clean(row.get("source_image_relative_path", ""))
        notes = clean(row.get("notes", ""))
        if not any([title, url, source_image_path, notes]):
            continue

        confidence = clean(row.get("confidence", "")) or "draft"
        connection.execute(
            """
            INSERT INTO britannica_targets(
                article_id,
                target_title,
                target_url,
                confidence,
                source_image_relative_path,
                notes
            ) VALUES(?, ?, ?, ?, ?, ?)
            """,
            (article_id, title or "(untitled)", url or None, confidence, source_image_path or None, notes or None),
        )
        counts[article_id] = counts.get(article_id, 0) + 1
        existing = max_confidence.get(article_id, "draft")
        if confidence_rank.get(confidence, 0) > confidence_rank.get(existing, 0):
            max_confidence[article_id] = confidence

    for article_id, count in counts.items():
        status = "confirmed" if max_confidence.get(article_id) == "confirmed" else "partial"
        connection.execute(
            "UPDATE articles SET britannica_mapping_status = ? WHERE article_id = ?",
            (status, article_id),
        )


def main() -> None:
    args = parse_args()
    connection = sqlite3.connect(args.db)
    lookup = article_id_lookup(connection)
    apply_identity_worklist(connection, lookup)
    apply_article_contents_worklist(connection, lookup)
    apply_propaedia_mapping_worklist(connection, lookup)
    apply_britannica_worklist(connection, lookup)
    connection.commit()
    connection.close()
    print(f"Applied worklists into {args.db}")


if __name__ == "__main__":
    main()
