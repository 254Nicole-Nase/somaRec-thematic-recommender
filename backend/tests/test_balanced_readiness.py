"""Engineering fixtures only. Neither reader holdout is ever evaluated here."""

import csv
import hashlib
import json
from zipfile import ZipFile

import pytest

from catalog_v2 import load_json
from prepare_form_pilot import EDITORIAL, READINESS, prepare
from run_form_pilot import run
from seal_holdout_b import seal, validate
from somarec.field_search import Vocabulary
from somarec.taxonomy import validate_taxonomy


def test_seal_preserves_bytes_and_never_replaces(tmp_path):
    rows = load_json(READINESS / "holdout_b_author_input.json")
    assert all(not r["query"] and not r["expected_candidates"] for r in rows)
    with pytest.raises(ValueError):
        validate(rows)
    for i, row in enumerate(rows):
        row.update(query=f"synthetic validation fixture {i}", kind="theme", intent="fixture",
                   author_id="test", created_on="2000-01-01", potentially_multiple=i < 2)
    source = tmp_path / "input.json"
    source.write_text(json.dumps(rows))
    target = seal(source, tmp_path, 1)
    with ZipFile(target) as archive:
        assert archive.read("queries.json") == source.read_bytes()
        manifest = json.loads(archive.read("manifest.json"))
        assert manifest["sha256"] == hashlib.sha256(source.read_bytes()).hexdigest()
        assert len(manifest["git_revision"]) == 40
    assert seal(source, tmp_path / "rebuild", 1).read_bytes() == target.read_bytes()
    with pytest.raises(FileExistsError):
        seal(source, tmp_path, 1)
    for key, value in [("id", rows[1]["id"]), ("language", "sw"), ("potentially_multiple", False)]:
        with pytest.raises(ValueError):
            validate([{**rows[0], key: value}, *rows[1:]])


def test_taxonomy_is_additive_and_ballots_reproduce():
    original = load_json(EDITORIAL / "taxonomy.v1.json")
    new = load_json(READINESS / "taxonomy.v1.1.json")
    cats, labels = validate_taxonomy(new)
    assert all(cats[c["id"]] == c for c in original["categories"])
    assert set(cats) - {c["id"] for c in original["categories"]} == {"essay-collection"}
    assert labels["form", "en", "essay"] != labels["form", "en", "essay collection"]
    assert not any(lang == "sw" and key == "essay-collection" for (_, lang, _), key in labels.items())
    materials = prepare()
    assert materials["review_packet.json"] == load_json(READINESS / "review_packet.json")
    forms = [r["candidate"] for r in materials["form_audit.json"] if r["candidate"]["value"] == "essay collection"]
    assert len(forms) == 2
    for claim in forms:
        assert claim["status"] == "needs_review"
        assert Vocabulary(new).reconcile(claim)["normalized_form"] == "essay-collection"
    cats["essay-collection"]["aliases"]["sw"] = ["invalid fixture"]
    with pytest.raises(ValueError):
        validate_taxonomy(new)


def test_synthetic_pilot(tmp_path):
    blank = READINESS / "review_worksheet.csv"
    with pytest.raises(ValueError, match="at least one"):
        run(blank)
    with blank.open() as stream:
        rows = list(csv.DictReader(stream))
    for row, action in zip(rows[:3], ["approve", "reject", "request_more_evidence"]):
        row.update(decision=action, reviewer="test-fixture-only", notes="Synthetic ballot",
                   checked_urls=row["source_urls"].split()[0])
    worksheet = tmp_path / "synthetic.csv"

    def write():
        with worksheet.open("w", newline="") as stream:
            writer = csv.DictWriter(stream, fieldnames=rows[0])
            writer.writeheader()
            writer.writerows(rows)

    write()
    report = run(worksheet)
    assert report["accepted"] == [rows[0]["work_id"]]
    assert report["rejected"] == [rows[1]["work_id"]]
    assert len(report["pending"]) == 5
    assert not report["unsupported_explanations"]
    hits = [h for r in report["approved_only"]["runs"] for h in r["results"]]
    assert [h["work_id"] for h in hits] == report["accepted"]
    rows[0]["fingerprint"] = "0"*64
    write()
    with pytest.raises(ValueError, match="changed"):
        run(worksheet)
