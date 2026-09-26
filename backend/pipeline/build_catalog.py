"""Build the cleaned SomaRec catalog from the harvested CSVs.

Input:  backend/data/kenyan_works_augmented.csv   (harvest output from part5.ipynb)
        backend/data/kenyan_works_with_themes.csv  (older top-3 theme labels, optional)
Output: backend/data/catalog.csv

What it fixes:
  * every book gets a stable UUID derived from (title, author), so the Flask API,
    Supabase and reading lists all refer to the same book with the same id
  * author spellings that differ only by apostrophe/diacritics are merged
    ("Ngũgĩ wa Thiong'o" / "Ngũgĩ wa Thiongʼo", "Nducu wa Ngugi" / "Ndũcũ wa Ngũgĩ")
  * unresolved Wikidata placeholders ("Q24937606") are dropped
  * duplicate works are merged, keeping the richest record
  * languages are normalised; missing ones are guessed and labelled as guesses
  * missing descriptions/covers are filled from backend/data/open_library_enrichment.csv
    (written by enrich_open_library.py; nothing is fetched here)
  * hand-checked fixes in backend/data/corrections.csv are applied last
    ("language" means the language of the listed edition, not the original)

Run:  python backend/pipeline/build_catalog.py
"""

import argparse
import ast
import json
import os
import sys
from collections import Counter

import pandas as pd

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from somarec.text import (  # noqa: E402
    book_id,
    clean_space,
    fix_apostrophes,
    fold_key,
    guess_language,
    is_wikidata_placeholder,
    normalize_language,
)

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data")

CATALOG_COLUMNS = [
    "id", "title", "author", "year", "language", "language_source", "description",
    "cover_url", "publisher", "isbn13", "isbn10", "ol_work_key", "source",
    "themes", "theme_source", "curation_status", "access_type", "access_url", "license",
]


def _year(value):
    text = clean_space(value)
    if len(text) >= 4 and text[:4].isdigit():
        return int(text[:4])
    return None


def _cover(row):
    url = clean_space(row.get("image_url"))
    if url and url.lower() != "nan":
        return url.replace("http://", "https://", 1)
    cover_i = row.get("cover_i")
    if pd.notna(cover_i) and str(cover_i).strip():
        return f"https://covers.openlibrary.org/b/id/{int(float(cover_i))}-L.jpg"
    return ""


def _isbn(value):
    text = clean_space(value)
    if not text or text.lower() == "nan":
        return ""
    return text.split(".")[0]


def canonical_authors(authors):
    """Map every spelling to the most common spelling sharing the same folded key."""
    groups = {}
    for name in authors:
        name = fix_apostrophes(clean_space(name)).rstrip(".")
        groups.setdefault(fold_key(name), Counter())[name] += 1
    mapping = {}
    for counter in groups.values():
        # Most frequent first; on ties prefer the spelling that keeps diacritics.
        best = max(counter.items(), key=lambda kv: (kv[1], sum(ord(c) > 127 for c in kv[0])))[0]
        for name in counter:
            mapping[name] = best
    return mapping


def load_legacy_themes(path):
    if not os.path.exists(path):
        return {}
    df = pd.read_csv(path)
    themes = {}
    for _, row in df.iterrows():
        try:
            parsed = ast.literal_eval(row["themes"]) if isinstance(row["themes"], str) else []
        except (ValueError, SyntaxError):
            parsed = []
        themes[(fold_key(row["title"]), fold_key(row["author"]))] = parsed
    return themes


def build(raw: pd.DataFrame, legacy_themes: dict):
    stats = Counter(input_rows=len(raw))
    author_map = canonical_authors(raw["author"].fillna(""))

    records = []
    for _, row in raw.iterrows():
        title = fix_apostrophes(clean_space(row.get("title")))
        author = author_map.get(fix_apostrophes(clean_space(row.get("author"))).rstrip("."), "")
        if not title or is_wikidata_placeholder(title):
            stats["dropped_placeholder_title"] += 1
            continue
        description = clean_space(row.get("description"))
        if description.lower() == "nan":
            description = ""

        language = normalize_language(row.get("language"))
        language_source = "metadata" if language else ""
        if not language:
            language = guess_language(description, title=title)
            language_source = "guessed" if language else ""

        themes = legacy_themes.get((fold_key(title), fold_key(author)), [])
        records.append({
            "id": book_id(title, author),
            "title": title,
            "author": author,
            "year": _year(row.get("pubdate")),
            "language": language or "",
            "language_source": language_source,
            "description": description,
            "cover_url": _cover(row),
            "publisher": clean_space(row.get("publisher")).replace("nan", ""),
            "isbn13": _isbn(row.get("isbn13")),
            "isbn10": _isbn(row.get("isbn10")),
            "ol_work_key": clean_space(row.get("ol_work_key")).replace("nan", ""),
            "source": clean_space(row.get("source")),
            "themes": json.dumps(themes, ensure_ascii=False),
            "theme_source": "legacy_top3" if themes else "",
            "curation_status": "unreviewed",
            # 'find' = metadata only, link out to where the book can be obtained.
            # 'read' = full text is openly licensed and can be read in-app.
            "access_type": "find",
            "access_url": "",
            "license": "",
        })

    df = pd.DataFrame.from_records(records, columns=CATALOG_COLUMNS)
    df["year"] = df["year"].astype("Int64")
    before = len(df)
    # Keep the richest record per id: longest description, then has a cover.
    df["_rank"] = df["description"].str.len() + df["cover_url"].astype(bool) * 1
    # "Decolonising the Mind" and "Decolonising the Mind: The Politics of Language..."
    # by the same author are one work; compare titles without their subtitle.
    df["_work"] = df["title"].str.split(r"[:;(]", n=1).str[0].map(fold_key) + "|" + df["author"].map(fold_key)
    df = df.sort_values("_rank", ascending=False).drop_duplicates("id").drop_duplicates("_work")
    df = df.drop(columns=["_rank", "_work"])
    stats["merged_duplicates"] = before - len(df)
    df = df.sort_values(["author", "title"]).reset_index(drop=True)

    stats["output_rows"] = len(df)
    stats["authors_before"] = raw["author"].nunique()
    stats["authors_after"] = df["author"].nunique()
    stats["missing_description"] = int((df["description"].str.len() < 50).sum())
    stats["missing_language"] = int((df["language"] == "").sum())
    stats["guessed_language"] = int((df["language_source"] == "guessed").sum())
    stats["missing_cover"] = int((df["cover_url"] == "").sum())
    return df, stats


def apply_enrichment(df: pd.DataFrame, path: str):
    """Fill only what is missing: a short description, an empty cover or work key."""
    counts = Counter()
    if not os.path.exists(path):
        return df, counts
    extra = pd.read_csv(path, dtype=str).fillna("").set_index("id")
    for i, book_id_ in df["id"].items():
        if book_id_ not in extra.index:
            continue
        found = extra.loc[book_id_]
        description = clean_space(found["description"]).lstrip(">").strip()
        if len(df.at[i, "description"]) < 50 and len(description) >= 50:
            # Open Library sometimes only has a translation's blurb (e.g. Spanish for
            # "Decolonising the Mind"); skip text that isn't in the book's language.
            book_language = df.at[i, "language"]
            if book_language in ("English", "Kiswahili") and guess_language(description) != book_language:
                counts["descriptions_skipped_wrong_language"] += 1
            else:
                df.at[i, "description"] = description
                counts["descriptions_from_open_library"] += 1
        if not df.at[i, "cover_url"] and found["cover_url"]:
            df.at[i, "cover_url"] = found["cover_url"]
            counts["covers_from_open_library"] += 1
        if not df.at[i, "ol_work_key"] and found["ol_work_key"]:
            df.at[i, "ol_work_key"] = found["ol_work_key"]
    return df, counts


def apply_corrections(df: pd.DataFrame, path: str):
    """Apply hand-checked field fixes. A correction that no longer matches a book fails
    loudly, so stale entries get noticed when the harvest changes."""
    if not os.path.exists(path):
        return df, 0
    fixes = pd.read_csv(path, dtype=str).fillna("")
    editable = set(CATALOG_COLUMNS) - {"id"}
    for _, fix in fixes.iterrows():
        target = book_id(fix["title"], fix["author"])
        if fix["field"] not in editable:
            raise ValueError(f"corrections.csv: cannot edit field {fix['field']!r}")
        mask = df["id"] == target
        if not mask.any():
            raise ValueError(f"corrections.csv: no book {fix['title']!r} by {fix['author']!r}")
        df.loc[mask, fix["field"]] = fix["value"]
        if fix["field"] == "language":
            df.loc[mask, "language_source"] = "curated"
    return df, len(fixes)


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--input", default=os.path.join(DATA_DIR, "kenyan_works_augmented.csv"))
    parser.add_argument("--themes", default=os.path.join(DATA_DIR, "kenyan_works_with_themes.csv"))
    parser.add_argument("--enrichment", default=os.path.join(DATA_DIR, "open_library_enrichment.csv"))
    parser.add_argument("--corrections", default=os.path.join(DATA_DIR, "corrections.csv"))
    parser.add_argument("--output", default=os.path.join(DATA_DIR, "catalog.csv"))
    args = parser.parse_args()

    raw = pd.read_csv(args.input)
    df, stats = build(raw, load_legacy_themes(args.themes))
    df, enriched = apply_enrichment(df, args.enrichment)
    stats.update(enriched)
    df, stats["corrections_applied"] = apply_corrections(df, args.corrections)
    stats["missing_description"] = int((df["description"].str.len() < 50).sum())
    stats["missing_cover"] = int((df["cover_url"] == "").sum())
    df.to_csv(args.output, index=False)

    print(f"Wrote {len(df)} books to {os.path.normpath(args.output)}")
    for key, value in stats.items():
        print(f"  {key:28s} {value}")


if __name__ == "__main__":
    main()
