"""Capture bounded bibliographic evidence or build an offline Catalog V2 sample."""

import argparse
import csv
from datetime import datetime, timezone
import json
from pathlib import Path
import time
from urllib.error import HTTPError
from urllib.parse import urlencode, urlsplit
from urllib.request import Request, urlopen

from somarec.catalog_v2 import WORK_KEY, build_catalog, compare_legacy, same_author, same_title
from somarec.import_preview import digest, json_text

OL = "https://openlibrary.org"
WD = "https://www.wikidata.org"
ROOT = Path(__file__).resolve().parents[1]
SAMPLE = ROOT / "experiments" / "catalog_v2"


def load_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


def save_json(path, value):
    path.write_text(json_text(value), encoding="utf-8", newline="\n")


class Capture:
    """Fetch strictly bibliographic endpoints and project public facts into a snapshot."""

    def __init__(self, user_agent, cache):
        self.user_agent = user_agent
        self.cache = cache
        self.requests = 0
        self.paused_hosts = set()

    def get(self, url, params, cache_key):
        if self.cache:
            path = self.cache / f"{cache_key}.json"
            if path.is_file():
                return load_json(path)
            return {"url": url, "error": "no recorded response"}
        query = url + ("?" + urlencode(params) if params else "")
        host = urlsplit(url).hostname
        if host in self.paused_hosts:
            return {"url": query, "error": "capture paused after a provider rate limit"}
        try:
            self.requests += 1
            req = Request(query, headers={"User-Agent": self.user_agent, "Accept": "application/json"})
            with urlopen(req, timeout=15) as response:
                if urlsplit(response.geturl()).hostname != host:
                    raise ValueError("Unexpected source redirect.")
                return {"url": query, "data": json.load(response)}
        except HTTPError as error:
            if error.code == 429:
                self.paused_hosts.add(host)
            return {"url": query, "error": f"HTTP {error.code}"}
        except (OSError, ValueError) as error:
            return {"url": query, "error": str(error)}
        finally:
            time.sleep(1.1)

    def wikidata(self, ids, key):
        if not ids:
            return {"data": {"entities": {}}}
        return self.get(f"{WD}/w/api.php", {
            "action": "wbgetentities", "ids": "|".join(ids), "props": "labels|claims",
            "languages": "en|sw", "format": "json",
        }, key)


def claim(entity, field):
    return [
        statement["mainsnak"]["datavalue"]["value"]
        for statement in entity.get("claims", {}).get(field, [])
        if statement["rank"] != "deprecated" and "datavalue" in statement["mainsnak"]
    ]


def label(entity):
    return next((entity["labels"][lang]["value"] for lang in ("en", "sw")
                 if lang in entity.get("labels", {})), "")


def search_record(row):
    key = row["key"].rsplit("/", 1)[-1]
    return {"key": key, "title": row.get("title") or "", "authors": row.get("author_name", []), "url": f"{OL}/works/{key}"}


def edition_record(row):
    key = row["key"].rsplit("/", 1)[-1]
    return {
        "key": key, "url": f"{OL}/books/{key}", "title": row.get("title") or "",
        "works": [item["key"].rsplit("/", 1)[-1] for item in row.get("works", [])],
        "languages": [item["key"].rsplit("/", 1)[-1] for item in row.get("languages", [])],
        "isbn10": row.get("isbn_10", []), "isbn13": row.get("isbn_13", []),
        "publish_date": row.get("publish_date"), "publishers": row.get("publishers", []),
    }


def capture_snapshot(seeds, source, captured_on):
    work_ids = sorted({qid for seed in seeds for qid in seed.get("wikidata_queries", [])})
    author_ids = sorted({seed["author_qid"] for seed in seeds if seed.get("author_qid")})
    wd_works = source.wikidata(work_ids, "wd-works")
    wd_authors = source.wikidata(author_ids, "wd-authors")
    people = wd_authors.get("data", {}).get("entities", {})
    wd_records = wd_works.get("data", {}).get("entities", {})
    records = {}
    edition_cache = {}
    for seed in seeds:
        search = source.get(f"{OL}/search.json", {
            "title": seed.get("search_title", seed["title"]), "author": seed.get("search_author", seed["author"]),
            "limit": 5, "fields": "key,title,subtitle,author_name,author_key,first_publish_year,language,edition_count",
        }, seed["search_cache_key"])
        errors = [{"url": result["url"], "error": result["error"]} for result in (search, wd_works, wd_authors)
                  if "error" in result]
        library = [search_record(row) for row in search.get("data", {}).get("docs", [])]
        books = {}
        for row in library:
            if not (
                WORK_KEY.fullmatch(row["key"]) and same_title(row["title"], seed)
                and any(same_author(author, seed) for author in row["authors"])
            ):
                continue
            key = row["key"]
            if key not in edition_cache:
                edition_cache[key] = source.get(f"{OL}/works/{key}/editions.json", {"limit": 12}, key)
            response = edition_cache[key]
            if "error" in response:
                errors.append({"url": response["url"], "error": response["error"]})
            books[key] = [edition_record(item) for item in response.get("data", {}).get("entries", [])]
        wikidata = []
        for qid in seed.get("wikidata_queries", []):
            entity = wd_records.get(qid, {})
            authors = [item["id"] for item in claim(entity, "P50")]
            wikidata.append({
                "id": qid, "url": f"{WD}/wiki/{qid}", "title": label(entity), "authors": authors,
                "author_labels": {author: label(people.get(author, {})) for author in authors},
                "open_library_ids": claim(entity, "P648"),
                "instance_of": [item["id"] for item in claim(entity, "P31")],
                "edition_of": [item["id"] for item in claim(entity, "P629")],
            })
        author_qid = seed.get("author_qid")
        author = people.get(author_qid, {})
        records[seed["work_id"]] = {
            "search_url": search["url"], "library": library, "wikidata": wikidata, "editions": books, "errors": errors,
            "author_claim": {
                "id": author_qid, "label": label(author),
                "citizenships": [item["id"] for item in claim(author, "P27")],
            } if author else None,
        }
    return {"version": 1, "captured_on": captured_on, "seed_fingerprint": digest(seeds), "records": records}


def export(catalog, quality, out):
    out.mkdir(parents=True, exist_ok=True)
    save_json(out / "sample.json", catalog)
    save_json(out / "quality.json", quality)
    with (out / "sample.csv").open("w", encoding="utf-8", newline="") as stream:
        fields = ("work_id", "title", "author", "form", "review_status", "edition_count", "languages", "source_urls")
        writer = csv.DictWriter(stream, fieldnames=fields, lineterminator="\n")
        writer.writeheader()
        quality_rows = {row["work_id"]: row for row in quality["work_comparison"]}
        for work in catalog["works"]:
            row = quality_rows[work["work_id"]]
            writer.writerow({
                "work_id": work["work_id"], "title": work["title"], "author": row["author"],
                "form": work["form"]["value"], "review_status": work["review_status"],
                "edition_count": row["v2_editions"], "languages": "|".join(row["v2_languages"]),
                "source_urls": "|".join(work["source_fields"]["title"]),
            })


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--seeds", type=Path, default=SAMPLE / "seeds.json")
    parser.add_argument("--snapshot", type=Path, default=SAMPLE / "evidence.json")
    capture = parser.add_mutually_exclusive_group(required=True)
    capture.add_argument("--build", type=Path, metavar="OUTPUT_DIR")
    capture.add_argument("--capture", type=Path, metavar="NEW_SNAPSHOT")
    parser.add_argument("--recorded-responses", type=Path, help="Replay raw captures in a local scratch directory")
    parser.add_argument("--captured-on", help="UTC capture date for replay")
    parser.add_argument("--contact", help="Public contact address for low-volume Open Library API requests")
    args = parser.parse_args()
    seeds = load_json(args.seeds)
    if args.capture:
        if args.capture.exists():
            parser.error("Choose a new snapshot output path.")
        if args.recorded_responses and not args.captured_on:
            parser.error("Supply the original acquisition date when replaying recorded responses.")
        if not args.recorded_responses and not args.contact:
            parser.error("Supply a public project contact for live capture.")
        source = Capture(f"SomaRec-Catalog-V2/0.1 ({args.contact})", args.recorded_responses)
        captured_on = args.captured_on or datetime.now(timezone.utc).date().isoformat()
        snapshot = capture_snapshot(seeds, source, captured_on)
        save_json(args.capture, snapshot)
        failures = sum(len(record["errors"]) for record in snapshot["records"].values())
        print(f"Saved evidence · {source.requests} attempted HTTP requests · {failures} request issues")
        return int(failures > 0)
    if args.build.resolve() == (ROOT / "backend" / "data").resolve():
        parser.error("Choose a prototype output directory separate from the legacy catalog.")
    snapshot = load_json(args.snapshot)
    catalog, findings = build_catalog(seeds, snapshot)
    with (ROOT / "backend" / "data" / "catalog.csv").open(encoding="utf-8", newline="") as legacy:
        quality = compare_legacy(catalog, findings, list(csv.DictReader(legacy)))
    export(catalog, quality, args.build)
    print(json.dumps(quality["counts"], sort_keys=True))
    return int(bool(quality["cross_work_identifier_collisions"]))


if __name__ == "__main__":
    raise SystemExit(main())
