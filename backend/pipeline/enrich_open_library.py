"""Fill missing descriptions and covers from Open Library.

For every catalog book with a short/missing description or no cover, look the
work up on Open Library (by its stored work key, else by title + author search)
and keep the result only when the title and the author's surname both match.
Results go to backend/data/open_library_enrichment.csv, which build_catalog.py
merges, so rebuilding the catalog never needs the network.

Books Open Library has nothing for stay empty: descriptions are never made up.

Run:  python backend/pipeline/enrich_open_library.py [--limit N] [--refresh]
      python backend/pipeline/build_catalog.py
"""

import argparse
import json
import os
import sys
import time
import urllib.parse
import urllib.request

import pandas as pd

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from somarec.text import clean_space, fold_key  # noqa: E402

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data")
ENRICHMENT_CSV = os.path.join(DATA_DIR, "open_library_enrichment.csv")
ENRICHMENT_COLUMNS = ["id", "title", "author", "ol_work_key", "description", "cover_url", "checked_at"]
MIN_DESCRIPTION = 50
USER_AGENT = "SomaRec/1.0 (Kenyan literature discovery; catalog enrichment)"


def _get_json(url, retries=3):
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(req, timeout=60) as resp:
                return json.load(resp)
        except Exception:  # noqa: BLE001 - network hiccups: back off and retry
            if attempt == retries - 1:
                return None
            time.sleep(2 ** (attempt + 1))


def _main_title(title):
    return fold_key(str(title).split(":")[0].split("(")[0])


def _surname(author):
    parts = fold_key(author).split()
    return parts[-1] if parts else ""


def title_author_match(book_title, book_author, ol_title, ol_authors):
    if _main_title(book_title) != _main_title(ol_title):
        return False
    surname = _surname(book_author)
    return bool(surname) and any(surname in fold_key(a).split() for a in ol_authors or [])


def _description(work):
    desc = work.get("description")
    if isinstance(desc, dict):
        desc = desc.get("value")
    desc = clean_space(desc or "")
    # Open Library descriptions often end with a markdown source link block.
    for marker in ("----------", "([source]"):
        desc = desc.split(marker)[0].strip()
    return desc


def find_work(title, author, work_key=""):
    """Return (work_key, work_json) for a confident match, else (None, None)."""
    if work_key:
        work = _get_json(f"https://openlibrary.org{work_key}.json")
        if work:
            return work_key, work
    query = urllib.parse.urlencode({
        "title": str(title).split(":")[0], "author": _surname(author),
        "fields": "key,title,author_name", "limit": 5,
    })
    found = _get_json(f"https://openlibrary.org/search.json?{query}") or {}
    for doc in found.get("docs", []):
        if title_author_match(title, author, doc.get("title", ""), doc.get("author_name")):
            work = _get_json(f"https://openlibrary.org{doc['key']}.json")
            if work:
                return doc["key"], work
    return None, None


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--limit", type=int, default=None, help="look up at most N books (for testing)")
    parser.add_argument("--refresh", action="store_true", help="re-check books already in the enrichment file")
    parser.add_argument("--delay", type=float, default=0.5, help="seconds between books (be polite to OL)")
    args = parser.parse_args()

    catalog = pd.read_csv(os.path.join(DATA_DIR, "catalog.csv"), dtype=str).fillna("")
    done = pd.read_csv(ENRICHMENT_CSV, dtype=str).fillna("") if os.path.exists(ENRICHMENT_CSV) else \
        pd.DataFrame(columns=ENRICHMENT_COLUMNS)
    seen = set() if args.refresh else set(done["id"])

    todo = catalog[(catalog["description"].str.len() < MIN_DESCRIPTION) | (catalog["cover_url"] == "")]
    todo = todo[~todo["id"].isin(seen)]
    if args.limit:
        todo = todo.head(args.limit)
    print(f"Looking up {len(todo)} books on Open Library")

    rows = []
    for n, book in enumerate(todo.itertuples(), 1):
        key, work = find_work(book.title, book.author, book.ol_work_key)
        description = _description(work) if work else ""
        covers = [c for c in (work or {}).get("covers", []) if isinstance(c, int) and c > 0]
        rows.append({
            "id": book.id, "title": book.title, "author": book.author, "ol_work_key": key or "",
            "description": description if len(description) >= MIN_DESCRIPTION else "",
            "cover_url": f"https://covers.openlibrary.org/b/id/{covers[0]}-L.jpg" if covers else "",
            "checked_at": time.strftime("%Y-%m-%d"),
        })
        if n % 20 == 0:
            print(f"  {n}/{len(todo)}")
        time.sleep(args.delay)

    new = pd.DataFrame(rows, columns=ENRICHMENT_COLUMNS)
    out = pd.concat([done[~done["id"].isin(new["id"])], new], ignore_index=True).sort_values(["author", "title"])
    out.to_csv(ENRICHMENT_CSV, index=False)
    print(f"Matched {int((new['ol_work_key'] != '').sum())}, "
          f"descriptions {int((new['description'] != '').sum())}, covers {int((new['cover_url'] != '').sum())}")
    print(f"Wrote {os.path.normpath(ENRICHMENT_CSV)}")


if __name__ == "__main__":
    main()
