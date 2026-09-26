"""Loading the book catalog and shaping books for the API.

The catalog comes from backend/data/catalog.csv (built by pipeline/build_catalog.py)
or, when SOMAREC_CATALOG_SOURCE=supabase, from the Supabase `books` table. Either
way every book is keyed by the same UUID the frontend and reading lists use.
"""

import json
import logging
import os
from urllib.parse import quote_plus

import pandas as pd

from .text import book_id, clean_space

log = logging.getLogger(__name__)

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data")
CATALOG_CSV = os.path.join(DATA_DIR, "catalog.csv")

COLUMNS = [
    "id", "title", "author", "year", "language", "language_source", "description",
    "cover_url", "publisher", "isbn13", "isbn10", "ol_work_key", "source",
    "themes", "theme_source", "curation_status", "access_type", "access_url", "license",
]


def _parse_list(value):
    if isinstance(value, list):
        return value
    text = clean_space(value)
    if not text or text.lower() == "nan":
        return []
    try:
        parsed = json.loads(text)
        return parsed if isinstance(parsed, list) else []
    except json.JSONDecodeError:
        return [t.strip() for t in text.strip("{}[]").split(",") if t.strip()]


def _normalise(df: pd.DataFrame) -> pd.DataFrame:
    for col in COLUMNS:
        if col not in df.columns:
            df[col] = ""
    df = df[COLUMNS].copy()
    text_cols = [c for c in COLUMNS if c not in ("year", "themes")]
    df[text_cols] = df[text_cols].fillna("").astype(str).replace("nan", "")
    df["year"] = pd.to_numeric(df["year"], errors="coerce").astype("Int64")
    df["themes"] = df["themes"].apply(_parse_list)
    missing_ids = df["id"] == ""
    df.loc[missing_ids, "id"] = df[missing_ids].apply(lambda r: book_id(r["title"], r["author"]), axis=1)
    return df.reset_index(drop=True)


def load_csv(path: str = CATALOG_CSV) -> pd.DataFrame:
    return _normalise(pd.read_csv(path, dtype={"isbn13": str, "isbn10": str}))


def load_supabase() -> pd.DataFrame:
    from supabase import create_client

    url = os.getenv("SUPABASE_URL") or os.getenv("VITE_SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("VITE_SUPABASE_ANON_KEY")
    if not url or not key:
        raise RuntimeError("SOMAREC_CATALOG_SOURCE=supabase needs SUPABASE_URL and a key")
    client = create_client(url, key)
    rows, start, page = [], 0, 1000
    while True:
        batch = client.table("books").select("*").range(start, start + page - 1).execute().data
        rows.extend(batch)
        if len(batch) < page:
            break
        start += page
    df = pd.DataFrame(rows)
    if "published_year" in df.columns and "year" not in df.columns:
        df["year"] = df["published_year"]
    return _normalise(df)


def load_catalog() -> pd.DataFrame:
    source = os.getenv("SOMAREC_CATALOG_SOURCE", "csv").lower()
    if source == "supabase":
        try:
            df = load_supabase()
            log.info("Loaded %d books from Supabase", len(df))
            return df
        except Exception as exc:  # noqa: BLE001
            log.error("Could not load catalog from Supabase (%s); falling back to CSV", exc)
    df = load_csv()
    log.info("Loaded %d books from %s", len(df), CATALOG_CSV)
    return df


def where_to_find(row) -> list:
    """Links a reader can follow to actually get the book.

    'read' links only exist for openly licensed texts (access_type == 'read').
    Everything else points to catalogues and shops rather than hosting copies.
    """
    links = []
    if row["access_url"]:
        label = "Read free" if row["access_type"] == "read" else "Get this book"
        if row["license"]:
            label += f" ({row['license']})"
        links.append({"label": label, "url": row["access_url"], "kind": row["access_type"] or "find"})
    query = quote_plus(f"{row['title']} {row['author']}".strip())
    if row["ol_work_key"]:
        links.append({"label": "Open Library", "url": f"https://openlibrary.org/works/{row['ol_work_key']}", "kind": "find"})
    else:
        links.append({"label": "Open Library", "url": f"https://openlibrary.org/search?q={query}", "kind": "find"})
    isbn = row["isbn13"] or row["isbn10"]
    gb = f"https://books.google.com/books?vid=ISBN{isbn}" if isbn else f"https://www.google.com/search?tbm=bks&q={query}"
    links.append({"label": "Google Books", "url": gb, "kind": "find"})
    links.append({"label": "Find in a library (WorldCat)", "url": f"https://search.worldcat.org/search?q={query}", "kind": "find"})
    return links


def book_to_api(row) -> dict:
    """Serialise one catalog row in the shape the React components expect."""
    year = row["year"]
    year = int(year) if pd.notna(year) else None
    return {
        "id": row["id"],
        "title": row["title"],
        "author": row["author"],
        "year": year,
        "published_year": year,
        "language": row["language"] or "Unknown",
        "language_source": row["language_source"],
        "genre": "",
        "description": row["description"],
        "coverImage": row["cover_url"],
        "cover_url": row["cover_url"],
        "publisher": row["publisher"],
        "isbn13": row["isbn13"],
        "themes": list(row["themes"]),
        "theme_source": row["theme_source"],
        "curation_status": row["curation_status"],
        "access_type": row["access_type"] or "find",
        "access_url": row["access_url"],
        "license": row["license"],
        "where_to_find": where_to_find(row),
    }
