"""Sync backend/data/catalog.csv into the Supabase `books` table.

  * New books are inserted with the catalog's stable UUID, so the Flask API,
    reading lists and reviews all use the same id.
  * Books already in Supabase (matched by title + author, ignoring accents and
    punctuation) keep their existing id and have their metadata updated, so
    existing reading lists keep working.

Apply supabase/migrations/20260926000000_catalog_reviews_cbc.sql first.

Usage:
  python backend/pipeline/build_catalog.py
  python backend/upload_books_to_supabase.py            # dry run: shows what would change
  python backend/upload_books_to_supabase.py --apply

If your database already had books before this change, also set
SOMAREC_CATALOG_SOURCE=supabase for the Flask API so it serves Supabase ids.
"""

import argparse
import os
import sys

from dotenv import load_dotenv

sys.path.insert(0, os.path.dirname(__file__))

from somarec.catalog import load_csv  # noqa: E402
from somarec.text import fold_key  # noqa: E402

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))


def to_row(book, book_id):
    year = book["year"]
    row = {
        "id": book_id,
        "title": book["title"],
        "author": book["author"] or None,
        "description": book["description"] or None,
        "cover_url": book["cover_url"] or None,
        "published_year": int(year) if year is not None and str(year) != "<NA>" else None,
        "isbn10": book["isbn10"] or None,
        "isbn13": book["isbn13"] or None,
        "language": book["language"] or None,
        "language_source": book["language_source"] or None,
        "themes": list(book["themes"]),
        "theme_source": book["theme_source"] or None,
        "publisher": book["publisher"] or None,
        "ol_work_key": book["ol_work_key"] or None,
        "source": book["source"] or None,
        "curation_status": book["curation_status"] or "unreviewed",
        "access_type": book["access_type"] or "find",
        "access_url": book["access_url"] or None,
        "license": book["license"] or None,
    }
    return row


def fetch_existing(client):
    rows, start, page = [], 0, 1000
    while True:
        batch = client.table("books").select("id,title,author").range(start, start + page - 1).execute().data
        rows.extend(batch)
        if len(batch) < page:
            return rows
        start += page


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--apply", action="store_true", help="write to Supabase (default is a dry run)")
    parser.add_argument("--batch-size", type=int, default=100)
    args = parser.parse_args()

    url = os.getenv("SUPABASE_URL") or os.getenv("VITE_SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        sys.exit("Set SUPABASE_URL (or VITE_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY in .env")

    from supabase import create_client

    client = create_client(url, key)
    catalog = load_csv()
    existing = {(fold_key(r["title"]), fold_key(r["author"] or "")): r["id"] for r in fetch_existing(client)}

    rows, updated, inserted = [], 0, 0
    for _, book in catalog.iterrows():
        match = existing.get((fold_key(book["title"]), fold_key(book["author"])))
        rows.append(to_row(book, match or book["id"]))
        updated += bool(match)
        inserted += not match

    print(f"Catalog: {len(catalog)} books -> {updated} update existing rows, {inserted} new inserts")
    if not args.apply:
        print("Dry run only. Re-run with --apply to write.")
        return

    for start in range(0, len(rows), args.batch_size):
        client.table("books").upsert(rows[start:start + args.batch_size], on_conflict="id").execute()
        print(f"  upserted {min(start + args.batch_size, len(rows))}/{len(rows)}")
    print("Done.")


if __name__ == "__main__":
    main()
