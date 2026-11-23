"""Build the isolated Catalog V2 dataset from recorded bibliographic evidence."""

from collections import Counter, defaultdict
import re

from .import_preview import digest, edition_isbn
from .text import fold_key

WORK_KEY = re.compile(r"OL[0-9]+W")
EDITION_KEY = re.compile(r"OL[0-9]+M")
WIKIDATA_WORK_TYPES = {"Q7725634", "Q47461344"}
WIKIDATA_EDITION_TYPE = "Q3331189"
FORMS = {"fiction", "poetry", "children", "memoir", "nonfiction", "drama"}


def same_title(value, seed):
    return fold_key(value) in {fold_key(title) for title in [seed["title"], *seed.get("title_aliases", [])]}


def same_author(value, seed):
    return fold_key(value) in {fold_key(name) for name in [seed["author"], *seed.get("author_aliases", [])]}


def linked_editions(records, parent, seed):
    """Use explicit parent links and the edition's own title, language and ISBNs."""
    editions, rejected = [], []
    for edition in records:
        key = edition["key"]
        if not EDITION_KEY.fullmatch(key) or set(edition["works"]) != {parent} or not same_title(edition["title"], seed):
            rejected.append(key)
            continue
        isbn13 = {isbn for value in edition["isbn13"] if (isbn := edition_isbn(value, "isbn13"))}
        isbn10 = {isbn for value in edition["isbn10"] if (isbn := edition_isbn(value, "isbn10"))}
        canonical_isbns = isbn10 | isbn13
        if len(canonical_isbns) > 1:
            rejected.append(key)
            continue
        # A multi-language edition is retained as such. A missing language stays unknown.
        editions.append({
            "edition_id": f"ol:{key}", "work_id": seed["work_id"], "title": edition["title"],
            "languages": sorted(set(edition["languages"])), "publish_date": edition["publish_date"],
            "publishers": edition["publishers"], "isbn13": next(iter(canonical_isbns), None),
            "source_fields": {field: edition["url"] for field in (
                "title", "languages", "publish_date", "publishers", "isbn13", "work_id"
            ) if field == "work_id" or (
                bool(canonical_isbns) if field == "isbn13" else bool(edition[field])
            )},
            "access_links": [{"kind": "catalog", "url": edition["url"]}],
            "translation_of": None, "review_status": "source_linked_candidate",
        })
    return editions, sorted(rejected)


def verified_wikidata(seed, records):
    results = []
    expected = seed.get("author_qid")
    for record in records:
        if (
            expected and same_title(record["title"], seed)
            and record["authors"] == [expected]
            and same_author(record["author_labels"].get(expected), seed)
        ):
            results.append(record)
    return results


def choose_library(matches, wikidata, edition_records, seed=None):
    """Only a corroborating cross-link or checked edition ISBN can resolve parallel work records."""
    provider_ids = {key for row in wikidata for key in row["open_library_ids"]}
    linked_works = {
        work for work, entries in edition_records.items()
        if any(entry["key"] in provider_ids and set(entry["works"]) == {work} for entry in entries)
    }
    linked_works.update(key for key in provider_ids if WORK_KEY.fullmatch(key))
    anchor = (seed or {}).get("edition_anchor")
    if anchor:
        isbn = edition_isbn(anchor["isbn13"], "isbn13")
        if not isbn or not anchor["source_url"].startswith("https://"):
            raise ValueError(f"Invalid publisher edition anchor for {seed['work_id']}.")
        for work, entries in edition_records.items():
            editions, _ = linked_editions(entries, work, seed)
            if any(edition["isbn13"] == isbn for edition in editions):
                linked_works.add(work)
    linked_matches = [row for row in matches if row["key"] in linked_works]
    if len(linked_matches) == 1 and len(linked_works) == 1:
        return linked_matches[0]
    if not provider_ids and not anchor and len(matches) == 1:
        return matches[0]
    return None


def build_catalog(seeds, snapshot):
    if snapshot["version"] != 1 or digest(seeds) != snapshot["seed_fingerprint"]:
        raise ValueError("Evidence was captured for a different seed manifest or schema version.")
    if len({seed["work_id"] for seed in seeds}) != len(seeds):
        raise ValueError("Duplicate seed work IDs.")
    if set(snapshot["records"]) != {seed["work_id"] for seed in seeds}:
        raise ValueError("Evidence snapshot must cover exactly the requests in the seed manifest.")

    works, editions, people, findings = [], [], {}, []
    for seed in seeds:
        work_id = seed["work_id"]
        if seed["form"] not in FORMS or not seed["scope"]["source_url"].startswith("https://"):
            raise ValueError(f"Invalid scope or form for {work_id}.")
        evidence = snapshot["records"][work_id]
        matches = [
            row for row in evidence["library"] if WORK_KEY.fullmatch(row["key"])
            and same_title(row["title"], seed)
            and any(same_author(name, seed) for name in row["authors"])
        ]
        author_matches = verified_wikidata(seed, evidence["wikidata"])
        linked = [row for row in author_matches if not row["edition_of"]
                  and WIKIDATA_EDITION_TYPE not in row["instance_of"]
                  and WIKIDATA_WORK_TYPES.intersection(row["instance_of"])]
        wikidata_editions = [row for row in author_matches
                             if row["edition_of"] or WIKIDATA_EDITION_TYPE in row["instance_of"]]
        library = choose_library(matches, linked, evidence["editions"], seed)
        # Multiple Wikidata works can share the same name and author. Keep them in the audit.
        wikidata = linked[0] if len(linked) == 1 else None
        issues = []
        if len(matches) > 1:
            issues.append("open_library_work_candidates")
        if len(linked) > 1:
            issues.append("wikidata_work_candidates")
        if wikidata_editions:
            issues.append("wikidata_edition_not_work")
        if matches and not library:
            issues.append("open_library_identity_unresolved")
        if evidence["errors"]:
            issues.append("source_request_incomplete")
        crosscheck = seed.get("bibliography_url")
        proof = ([library["url"]] if library else []) + ([wikidata["url"]] if wikidata else [])
        if crosscheck:
            proof.append(crosscheck)
        if library and seed.get("edition_anchor"):
            proof.append(seed["edition_anchor"]["source_url"])
        if library:
            proof.extend(row["url"] for row in wikidata_editions)
        if library and any(not same_author(name, seed) for name in library["authors"]):
            issues.append("provider_contributor_roles_unresolved")
            if not (wikidata or crosscheck):
                library = None
        scope = seed["scope"]
        if scope["basis"] == "kenyan_author" and scope["source_url"].startswith("https://www.wikidata.org/"):
            author = evidence["author_claim"]
            if not author or not same_author(author["label"], seed) or "Q114" not in author["citizenships"]:
                issues.append("kenyan_author_scope_unverified")
        if not (library or wikidata):
            issues.append("no_unambiguous_provider_match")
        row_editions, rejected = linked_editions(
            evidence["editions"].get(library["key"], []), library["key"], seed
        ) if library else ([], [])
        if rejected:
            issues.append("edition_identity_or_isbn_needs_review")
        admitted = bool(library or wikidata) and "kenyan_author_scope_unverified" not in issues
        findings.append({
            "work_id": work_id, "status": "included" if admitted else "quarantined", "issues": issues,
            "open_library_title_author_candidates": [row["key"] for row in matches],
            "rejected_open_library_search_hits": [row["key"] for row in evidence["library"] if row not in matches],
            "wikidata_title_author_candidates": [row["id"] for row in linked],
            "wikidata_edition_candidates": [row["id"] for row in wikidata_editions],
            "rejected_wikidata_candidates": [
                row["id"] for row in evidence["wikidata"] if row not in linked and row not in wikidata_editions
            ],
            "rejected_editions": rejected, "request_errors": evidence["errors"],
        })
        if not admitted:
            continue
        person_id = seed["person_id"]
        person = {
            "person_id": person_id, "name": seed["author"],
            "aliases": seed.get("author_aliases", []), "wikidata_id": seed.get("author_qid"),
            "identity_evidence": seed["person_evidence"],
        }
        if people.setdefault(person_id, person) != person:
            raise ValueError(f"Inconsistent contributor record for {person_id}.")
        works.append({
            "work_id": work_id, "title": seed["title"], "title_aliases": seed.get("title_aliases", []),
            "contributors": [{"person_id": person_id, "role": "author"}],
            "form": {"value": seed["form"], "status": "editorial_candidate", "source_url": seed["form_source"]},
            "scope": seed["scope"],
            "review_status": "corroborated" if len(proof) > 1 else "single_source_match",
            "source_fields": {"title": proof, "author": proof},
            "identifiers": {
                "open_library": library["key"] if library else None,
                "wikidata": wikidata["id"] if wikidata else None,
            },
            "edition_ids": [edition["edition_id"] for edition in row_editions],
            "original_language": None, "synopsis": seed.get("editorial_synopsis"), "themes": [], "cover": None,
            "text_assets": [],
            "access_links": [{"kind": "catalog", "url": library["url"]}] if library else [],
        })
        editions.extend(row_editions)

    for kind, items, key in (("work", works, "work_id"), ("edition", editions, "edition_id")):
        if len({item[key] for item in items}) != len(items):
            raise ValueError(f"Duplicate {kind} IDs in the generated catalog.")
    catalog = {
        "version": 1, "as_of": snapshot["captured_on"], "seed_fingerprint": digest(seeds),
        "evidence_fingerprint": digest(snapshot), "people": sorted(people.values(), key=lambda row: row["person_id"]),
        "works": works, "editions": editions,
    }
    return catalog, findings


def compare_legacy(catalog, findings, legacy):
    people = {person["person_id"]: person for person in catalog["people"]}
    editions = {edition["edition_id"]: edition for edition in catalog["editions"]}
    comparison, isbn_claims, provider_claims = [], defaultdict(set), defaultdict(set)
    isbn_edition_claims = defaultdict(set)
    title_claims = defaultdict(set)
    for work in catalog["works"]:
        person = people[work["contributors"][0]["person_id"]]
        names = {fold_key(name) for name in [person["name"], *person["aliases"]]}
        titles = {re.sub(r"^the ", "", fold_key(title))
                  for title in [work["title"], *work["title_aliases"]]}
        for title in titles:
            title_claims[(person["person_id"], title)].add(work["work_id"])
        matches = [
            row for row in legacy
            if re.sub(r"^the ", "", fold_key(row["title"])) in titles and fold_key(row["author"]) in names
        ]
        row_editions = [editions[edition] for edition in work["edition_ids"]]
        for edition in row_editions:
            if edition["isbn13"]:
                isbn_claims[edition["isbn13"]].add(work["work_id"])
                isbn_edition_claims[edition["isbn13"]].add(edition["edition_id"])
        for provider, identifier in work["identifiers"].items():
            if identifier:
                provider_claims[f"{provider}:{identifier}"].add(work["work_id"])
        comparison.append({
            "work_id": work["work_id"], "title": work["title"], "author": person["name"],
            "v2_editions": len(row_editions), "v2_has_isbn": any(row["isbn13"] for row in row_editions),
            "v2_has_synopsis": work["synopsis"] is not None,
            "v2_languages": sorted({language for row in row_editions for language in row["languages"]}),
            "legacy_candidates": [{
                "id": row["id"], "title": row["title"], "author": row["author"],
                "has_synopsis": bool(row["description"]), "language": row["language"] or None,
                "language_source": row["language_source"] or None, "genre": row.get("genre") or None,
                "has_isbn": any(edition_isbn(row.get(field), field) for field in ("isbn10", "isbn13")),
            } for row in matches],
            "mapping_status": "manual_review" if matches else "no_title_author_candidate",
        })
    return {
        "counts": {
            "works": len(catalog["works"]), "people": len(catalog["people"]), "editions": len(editions),
            "quarantined": sum(row["status"] == "quarantined" for row in findings),
            "corroborated": sum(work["review_status"] == "corroborated" for work in catalog["works"]),
            "legacy_overlap_works": sum(bool(row["legacy_candidates"]) for row in comparison),
            "multiple_legacy_candidates": sum(len(row["legacy_candidates"]) > 1 for row in comparison),
            "with_editions": sum(bool(row["v2_editions"]) for row in comparison),
            "with_isbn": sum(row["v2_has_isbn"] for row in comparison),
            "with_edition_languages": sum(bool(row["v2_languages"]) for row in comparison),
            "forms": dict(Counter(work["form"]["value"] for work in catalog["works"])),
        },
        "findings": findings, "work_comparison": comparison,
        "cross_work_identifier_collisions": {
            key: sorted(ids) for key, ids in {**isbn_claims, **provider_claims}.items() if len(ids) > 1
        },
        "cross_work_title_candidates": [
            {"person_id": person_id, "normalized_title": title, "work_ids": sorted(ids)}
            for (person_id, title), ids in sorted(title_claims.items()) if len(ids) > 1
        ],
        "duplicate_edition_candidates": {
            key: sorted(ids) for key, ids in isbn_edition_claims.items() if len(ids) > 1
        },
        "confirmed_legacy_bad_enrichment": [
            {"title": "Juices", "legacy_id": "2e82404b-146f-5806-84cc-45ff33b3809e",
             "source": "https://books.google.com/books?id=ywEKyvOO_S0C"},
            {"title": "Olduvai Gorge", "legacy_id": "32f01a5b-6786-56cc-9d74-7c3182193b2d",
             "source": "https://books.google.com/books?id=440TmWXToLAC"},
        ],
    }
