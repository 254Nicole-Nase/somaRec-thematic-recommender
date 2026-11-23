import copy
import csv
import json
from pathlib import Path

import pytest

from catalog_v2 import export
from somarec.catalog_v2 import build_catalog, choose_library, compare_legacy, linked_editions
from somarec.import_preview import digest

REPO = Path(__file__).resolve().parents[2]
SAMPLE = REPO / "experiments" / "catalog_v2"


@pytest.fixture
def real_inputs():
    return tuple(json.loads((SAMPLE / name).read_text()) for name in ("seeds.json", "evidence.json"))


def test_frozen_real_sample_reproduces_and_stays_outside_legacy(real_inputs, tmp_path):
    catalog, findings = build_catalog(*real_inputs)
    with (REPO / "backend/data/catalog.csv").open() as handle:
        quality = compare_legacy(catalog, findings, list(csv.DictReader(handle)))
    export(catalog, quality, tmp_path)
    for name in ("sample.json", "sample.csv", "quality.json"):
        assert (tmp_path / name).read_bytes() == (SAMPLE / name).read_bytes()

    assert 20 <= len(catalog["works"]) <= 30
    assert {"fiction", "poetry", "children", "memoir", "nonfiction"} <= quality["counts"]["forms"].keys()
    assert any("swa" in row["languages"] for row in catalog["editions"])
    assert len({row["work_id"] for row in catalog["works"]}) == len(catalog["works"])
    assert all(row["scope"]["source_url"] and row["source_fields"]["title"] for row in catalog["works"])
    assert all(row["original_language"] is None and not row["text_assets"] and row["cover"] is None
               for row in catalog["works"])
    assert not quality["cross_work_identifier_collisions"]


def test_named_regressions_do_not_reuse_legacy_enrichment_or_merge(real_inputs):
    catalog, findings = build_catalog(*real_inputs)
    works = {row["work_id"]: row for row in catalog["works"]}
    by_id = {row["work_id"]: row for row in findings}

    assert works["juices"]["synopsis"] is None
    assert "https://iucat.iu.edu/iuk/1905138" in works["juices"]["source_fields"]["title"]
    assert "olduvai-gorge" not in works
    assert sum(row["title"] == "The Dragonfly Sea" for row in catalog["works"]) == 1
    assert by_id["greedy-zebra"]["status"] == "quarantined"
    assert by_id["greedy-zebra"]["open_library_title_author_candidates"]
    assert not works["the-dragonfly-sea"]["edition_ids"]
    challenge = works["the-challenge-for-africa"]
    assert challenge["identifiers"] == {"open_library": "OL4436879W", "wikidata": None}
    assert by_id["the-challenge-for-africa"]["wikidata_edition_candidates"] == ["Q134430393"]
    assert "Q90900593" in by_id["maua-kwenye-jua-la-asubuhi"]["wikidata_edition_candidates"]


def test_seed_snapshot_fingerprint_is_checked(real_inputs):
    seeds, snapshot = real_inputs
    changed = copy.deepcopy(seeds)
    changed[0]["title"] = "Other title"
    with pytest.raises(ValueError, match="different seed manifest"):
        build_catalog(changed, snapshot)


def test_wrong_source_cannot_be_first_match_and_conflicting_citizenship_is_quarantined(real_inputs):
    seeds, snapshot = real_inputs
    seed = seeds[0]
    small = {
        **snapshot, "seed_fingerprint": digest([seed]),
        "records": {seed["work_id"]: copy.deepcopy(snapshot["records"][seed["work_id"]])},
    }
    record = small["records"][seed["work_id"]]
    record["library"].insert(0, {
        "key": "OL123W", "title": seed["title"], "authors": ["Unrelated fixture author"],
        "url": "https://openlibrary.org/works/OL123W",
    })
    catalog, findings = build_catalog([seed], small)
    assert catalog["works"][0]["identifiers"]["open_library"] == "OL10243W"
    assert findings[0]["rejected_open_library_search_hits"] == ["OL123W"]

    record["author_claim"]["citizenships"] = []
    catalog, findings = build_catalog([seed], small)
    assert not catalog["works"]
    assert "kenyan_author_scope_unverified" in findings[0]["issues"]


def test_work_key_ties_require_explicit_cross_link():
    matches = [{"key": "OL1W"}, {"key": "OL2W"}]
    assert choose_library(matches, [], {}) is None
    assert choose_library(matches[:1], [{"open_library_ids": ["OL9W"]}], {}) is None
    assert choose_library(matches, [{"open_library_ids": ["OL2W"]}], {}) == matches[1]
    edition = {"key": "OL1M", "works": ["OL1W"]}
    assert choose_library(matches, [{"open_library_ids": ["OL1M"]}], {"OL1W": [edition]}) == matches[0]
    assert choose_library(matches, [{"open_library_ids": ["OL1M"]}], {"OL1W": [
        {**edition, "works": ["OL2W"]}
    ]}) is None


def test_editions_keep_parent_language_and_isbn_separate():
    seed = {"work_id": "fixture", "title": "Verified title"}
    item = {
        "key": "OL1M", "works": ["OL1W"], "title": seed["title"], "isbn10": ["0306406152"],
        "isbn13": ["9780306406157"], "languages": ["swa"], "publish_date": "2001",
        "publishers": ["Fixture publisher"], "url": "https://openlibrary.org/books/OL1M",
    }
    works, rejected = linked_editions([
        item,
        {**item, "key": "OL2M", "works": ["OL2W"]},
        {**item, "key": "OL3M", "isbn13": ["9780345802545"]},
        {**item, "key": "OL4M", "title": "Another title"},
        {**item, "key": "OL5M", "languages": [], "isbn10": [], "isbn13": ["not-an-isbn"]},
        {**item, "key": "OL6M", "works": ["OL1W", "OL2W"]},
    ], "OL1W", seed)
    assert rejected == ["OL2M", "OL3M", "OL4M", "OL6M"]
    assert works[0]["isbn13"] == "9780306406157"
    assert works[0]["languages"] == ["swa"]
    assert works[0]["translation_of"] is None
    assert works[1]["languages"] == []
    assert works[1]["isbn13"] is None
