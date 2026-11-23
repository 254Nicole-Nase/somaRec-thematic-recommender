import csv
import json
import subprocess
import sys
from pathlib import Path

import pytest

from somarec.import_preview import build_preview, identity_values, json_text

BACKEND = Path(__file__).resolve().parents[1]
BOOK = "10000000-0000-0000-0000-000000000001"
OTHER = "10000000-0000-0000-0000-000000000002"
EVIDENCE = {"url": "https://example.org/catalog", "reason": "Fixture for an editorial decision"}
BOOK_ROW = {"id": BOOK, "title": "Fixture title", "author": "Fixture author"}


@pytest.fixture
def catalog():
    with (BACKEND / "data" / "catalog.csv").open() as handle:
        return {row["title"]: row for row in csv.DictReader(handle)}


def proposed_source(row, field, *, title, author, url):
    return {
        **EVIDENCE, "id": row["id"], "field": field, "proposed": row[field],
        "title": title, "author": author, "url": url,
    }


def override(field, expected, proposed):
    return {**EVIDENCE, "id": BOOK, "field": field, "expected": expected, "proposed": proposed}


def test_juices_mismatched_description(catalog):
    row = catalog["Juices"]
    assert row["author"] == "Jared Angira"
    assert row["description"].startswith("The Columbia Guide to East African Literature")
    source = proposed_source(
        row, "description", title="The Columbia Guide to East African Literature in English Since 1945",
        author="Simon Gikandi and Evan Mwangi",
        url="https://books.google.com/books?id=ywEKyvOO_S0C",
    )
    candidate = {"id": row["id"], "description": row["description"]}
    plan = build_preview([candidate], [{**row, "description": None}], {"provenance": [source]})
    change = plan["records"][0]["changes"]["description"]
    assert plan["counts"]["blocked"] == 1
    assert change["before"] is None
    assert change["proposed"] == row["description"]
    assert change["issues"] == ["provenance_conflict"]


def test_olduvai_gorge_unrelated_source_for_cover_and_description(catalog):
    row = next(row for title, row in catalog.items() if title.startswith("Olduvai Gorge;"))
    assert row["author"] == "Louis Leakey"
    assert "440TmWXToLAC" in row["cover_url"]
    fields = ("description", "cover_url")
    sources = [
        proposed_source(
            row, field, title="Wiley-Blackwell Encyclopedia of Human Evolution",
            author="Bernard Wood", url="https://books.google.com/books?id=440TmWXToLAC",
        )
        for field in fields
    ]
    baseline = {**row, **dict.fromkeys(fields)}
    plan = build_preview([row], [baseline], {"provenance": sources})
    assert plan["counts"]["blocked"] == 1
    assert all(plan["records"][0]["changes"][field]["issues"] == ["provenance_conflict"] for field in fields)


def test_dragonfly_sea_duplicate_is_flagged_not_merged(catalog):
    old = catalog["The Dragonfly Sea"]
    candidate = catalog["Dragonfly Sea"]
    plan = build_preview([candidate], [old], dependencies={old["id"]: {"reviews": 2}})
    record = plan["records"][0]
    assert record["action"] == "blocked"
    assert record["existing_id"] is None
    assert record["possible_matches"] == [{"id": old["id"], "matched_on": ["title_author"]}]
    assert record["dependency_counts"] == {old["id"]: {"reviews": 2}}
    assert plan["baseline_only_ids"] == [old["id"]]


def test_existing_duplicates_are_visible_in_unchanged_preview(catalog):
    books = [catalog["The Dragonfly Sea"], catalog["Dragonfly Sea"]]
    plan = build_preview(books, books)
    assert plan["counts"]["unchanged"] == 2
    assert all(record["possible_matches"] for record in plan["records"])


def test_legacy_theme_regression_blocks_record():
    old = {**BOOK_ROW, "themes": ["Political violence"], "theme_source": "model"}
    candidate = {**old, "theme_source": "legacy_top3", "themes": ["Generosity"]}
    result = build_preview([candidate], [old])["records"][0]
    assert result["action"] == "blocked"
    assert result["issues"] == ["legacy_top3_regression"]
    assert result["changes"]["theme_source"]["before"] == "model"
    assert result["changes"]["themes"]["proposed"] == ["Generosity"]


@pytest.mark.parametrize("field, before, proposed", [
    ("description", "Verified fixture value", "Proposed fixture value"),
    ("cover_url", "https://example.org/old.jpg", "https://example.org/new.jpg"),
    ("themes", ["Family"], ["Diaspora"]),
    ("language", "Kiswahili", "English"),
    ("license", "CC BY 4.0", "CC BY-SA 4.0"),
    ("access_url", "https://example.org/book", "https://example.org/edition"),
])
def test_reviewed_fields_need_bound_override(field, before, proposed):
    old = {**BOOK_ROW, "curation_status": "reviewed", "theme_source": "curated",
           "language_source": "curated", field: before}
    candidate = {**BOOK_ROW, field: proposed}
    manifest = {}
    if field in {"description", "cover_url"}:
        manifest["provenance"] = [proposed_source(
            candidate, field, title=old["title"], author=old["author"], url=EVIDENCE["url"],
        )]
    record = build_preview([candidate], [old], manifest)["records"][0]
    assert record["action"] == "blocked"
    assert record["changes"][field]["issues"] == ["protected_metadata"]
    manifest["overrides"] = [override(field, before, proposed)]
    assert build_preview([candidate], [old], manifest)["counts"]["update"] == 1


def test_unreviewed_book_still_preserves_field_level_curation():
    old = {**BOOK_ROW, "language": "Kiswahili", "language_source": "curated", "license": "CC BY 4.0"}
    candidate = {**BOOK_ROW, "language": "English", "license": "CC0"}
    record = build_preview([candidate], [old], curated_fields={BOOK: ["license"]})["records"][0]
    assert record["action"] == "blocked"
    assert all(record["changes"][field]["issues"] == ["protected_metadata"] for field in ("language", "license"))


def test_cover_and_description_need_evidence_even_when_unreviewed():
    candidate = {**BOOK_ROW, "description": "Proposed fixture value", "cover_url": "https://example.org/cover"}
    result = build_preview([candidate], [BOOK_ROW])["records"][0]
    assert result["action"] == "blocked"
    assert result["issues"] == ["missing_provenance"]


def test_omitted_blank_and_explicit_clear_have_distinct_intent():
    old = {**BOOK_ROW, "description": "Public fixture description", "publisher": "Fixture publisher"}
    candidate = {"id": BOOK, "description": ""}
    result = build_preview([candidate], [old])["records"][0]
    assert result["action"] == "unchanged"
    assert "description" in result["blank_fields"]
    assert "publisher" in result["omitted_fields"]
    result = build_preview([candidate], [old], {"overrides": [
        override("description", old["description"], None)
    ]})["records"][0]
    assert result["action"] == "update"
    assert result["changes"]["description"]["before"] == old["description"]
    assert result["changes"]["description"]["proposed"] is None
    assert result["changes"]["description"]["intent"] == "clear"
    assert build_preview([candidate], [old], {"overrides": [
        override("description", "Stale fixture value", None)
    ]})["counts"]["blocked"] == 1


def test_identity_correction_keeps_existing_uuid_only_with_matching_evidence():
    old = {**BOOK_ROW, "author": "Earlier fixture spelling"}
    candidate = {**BOOK_ROW, "id": OTHER}
    assert build_preview([BOOK_ROW], [old])["records"][0]["issues"] == ["identity_review_required"]
    approval = {
        **EVIDENCE, "incoming_id": OTHER, "existing_id": BOOK,
        "expected": identity_values(old), "proposed": identity_values(candidate),
    }
    record = build_preview([candidate], [old], {"identity": [approval]})["records"][0]
    assert record["action"] == "update"
    assert record["existing_id"] == BOOK
    assert record["changes"]["author"]["proposed"] == candidate["author"]
    assert build_preview([candidate], [{**old, "author": "Different spelling"}], {
        "identity": [approval]
    })["records"][0]["issues"] == ["identity_evidence_conflict"]


def test_isbn_equivalence_detects_duplicate_without_merging():
    old = {**BOOK_ROW, "isbn10": "0-306-40615-2"}
    candidate = {"id": OTHER, "title": "Different fixture title", "author": old["author"], "isbn13": "9780306406157"}
    result = build_preview([candidate], [old])["records"][0]
    assert result["issues"] == ["ambiguous_identity"]
    assert result["possible_matches"] == [{"id": BOOK, "matched_on": ["isbn"]}]


def test_two_rows_claiming_same_existing_uuid_are_blocked():
    old = BOOK_ROW
    other = {**old, "id": OTHER}
    approval = {
        **EVIDENCE, "incoming_id": OTHER, "existing_id": BOOK,
        "expected": identity_values(old), "proposed": identity_values(other),
    }
    plan = build_preview([old, other], [old], {"identity": [approval]})
    assert plan["counts"]["blocked"] == 2
    assert all("multiple_rows_claim_uuid" in row["issues"] for row in plan["records"])


def test_repeatable_plan_and_no_deletions():
    other = {"id": OTHER, "title": "Another fixture", "author": BOOK_ROW["author"]}
    candidate = [BOOK_ROW, other]
    baseline = [{**BOOK_ROW, "publisher": "Baseline publisher"}]
    first = build_preview(candidate, baseline)
    assert json_text(first) == json_text(build_preview(candidate[::-1], baseline))
    assert first["counts"] == {"insert": 1, "update": 0, "unchanged": 1, "blocked": 0}
    assert first["records"][1]["changes"]["status"]["proposed"] == "draft"
    assert build_preview([], baseline)["baseline_only_ids"] == [BOOK]


def test_invalid_access_combination_and_private_url_are_rejected():
    result = build_preview([{**BOOK_ROW, "access_type": "read"}], [BOOK_ROW])["records"][0]
    assert result["issues"] == ["invalid_access_metadata"]
    with pytest.raises(ValueError, match="public HTTP"):
        build_preview([{**BOOK_ROW, "cover_url": "https://example.org/image?token=secret"}], [])


def test_cli_writes_reports_when_blocked_without_touching_inputs(tmp_path):
    baseline = tmp_path / "baseline.json"
    candidate = tmp_path / "candidate.json"
    baseline.write_text(json.dumps([BOOK_ROW]))
    candidate.write_text(json.dumps([{**BOOK_ROW, "description": "Fixture without provenance"}]))
    output = tmp_path / "reports"
    command = [
        sys.executable, str(BACKEND / "preview_catalog_import.py"), "--candidate", str(candidate),
        "--baseline", str(baseline), "--output-dir", str(output),
    ]
    result = subprocess.run(command, capture_output=True, text=True, check=False)
    assert result.returncode == 1, result.stderr
    assert json.loads((output / "preview.json").read_text())["counts"]["blocked"] == 1
    assert "| `description` | null |" in (output / "preview.md").read_text()
    assert json.loads(baseline.read_text()) == [BOOK_ROW]
    first = (output / "preview.json").read_bytes()
    assert subprocess.run(command, capture_output=True, check=False).returncode == 1
    assert (output / "preview.json").read_bytes() == first


def test_attached_provenance_does_not_resolve_known_competing_book():
    other = {**BOOK_ROW, "id": OTHER, "title": "The Fixture title"}
    candidate = {**BOOK_ROW, "description": "Description fixture"}
    evidence = proposed_source(
        candidate, "description", title=BOOK_ROW["title"], author=BOOK_ROW["author"],
        url=EVIDENCE["url"],
    )
    record = build_preview([candidate], [BOOK_ROW, other], {"provenance": [evidence]})["records"][0]
    assert record["action"] == "blocked"
    assert record["changes"]["description"]["issues"] == ["ambiguous_source_identity"]


def test_verified_mapping_cannot_move_an_existing_uuid_to_another_book():
    other = {**BOOK_ROW, "id": OTHER, "title": "Different fixture title"}
    approval = {
        **EVIDENCE, "incoming_id": OTHER, "existing_id": BOOK,
        "expected": identity_values(BOOK_ROW), "proposed": identity_values(other),
    }
    record = build_preview([other], [BOOK_ROW, other], {"identity": [approval]})["records"][0]
    assert record["action"] == "blocked"
    assert "identity_evidence_conflict" in record["issues"]
