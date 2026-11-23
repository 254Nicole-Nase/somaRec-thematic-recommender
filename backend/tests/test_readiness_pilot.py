"""Synthetic ballots only. No real decision file or held-out reader queries used."""

import hashlib

import pytest

from catalog_v2 import SAMPLE, load_json
from prepare_form_pilot import EDITORIAL, READINESS, prepare
from somarec.catalog_evaluation import evaluate
from somarec.editorial_review import build_review


@pytest.fixture
def pilot():
    outputs = prepare()
    packet = outputs["review_packet.json"]
    book = next(row for row in packet if row["work_id"] == "betrayal-in-the-city")
    claim = book["ballot_assertion"]
    synthetic = dict(work_id=book["work_id"], field="literary_form", fingerprint=claim["fingerprint"],
                     status="verified", reviewer="synthetic-unit-test-only",
                     evidence=claim["evidence"], note="Synthetic ballot, never persist.")
    return outputs, synthetic


def reviewed(outputs, decisions):
    return build_review(load_json(SAMPLE / "sample.json"), load_json(SAMPLE / "quality.json"),
                        load_json(EDITORIAL / "proposals.json"), decisions,
                        taxonomy=load_json(EDITORIAL / "taxonomy.v1.json"),
                        assignments=load_json(EDITORIAL / "assignments.json"),
                        corrections=outputs["pilot_corrections.json"])


@pytest.mark.parametrize("status,expected", [("verified", ["betrayal-in-the-city"]),
                                            ("conflicting", []), ("needs_review", [])])
def test_synthetic_form_ballot_in_isolation(pilot, status, expected):
    outputs, ballot = pilot
    result = reviewed(outputs, [{**ballot, "status": status}])
    runs = evaluate(result, load_json(READINESS / "pilot_smoke.json"), mode="approved_only")[0]["runs"]
    assert [[hit["work_id"] for hit in run["results"]] for run in runs] == [[], expected, []]


@pytest.mark.parametrize("overrides", [{"fingerprint": "0" * 64}, {"work_id": "dust"},
                                       {"field": "synopsis"}, {"work_id": "absent"}, {"field": "typo"}])
def test_synthetic_misdirected_ballots_fail_closed(pilot, overrides):
    outputs, ballot = pilot
    with pytest.raises(ValueError):
        reviewed(outputs, [{**ballot, **overrides}])


def test_synthetic_missing_edition_evidence(pilot):
    outputs, ballot = pilot
    edition = next(e for row in reviewed(outputs, [])["queue"] for e in row["edition_reviews"]
                   if e["fields"]["isbn13"]["value"] is None)
    claim = edition["fields"]["isbn13"]
    assert claim["evidence"] == []
    invalid = {**ballot, "work_id": edition["fields"]["work_id"]["value"],
               "field": f"edition/{edition['edition_id']}/isbn13", "fingerprint": claim["fingerprint"]}
    with pytest.raises(ValueError, match="Provide a value"):
        reviewed(outputs, [invalid])


def test_freeze_and_pilot_reproduction(pilot):
    outputs, _ = pilot
    # The freeze describes a Git revision. Later retrieval development may change
    # HEAD; compare the permanent archived ranking here, not future source code.
    archive = "baselines/fa10c736/evaluation.json"
    frozen = load_json(READINESS / "freeze.json")
    assert hashlib.sha256((EDITORIAL / archive).read_bytes()).hexdigest() == (
        frozen["sha256"][f"experiments/catalog_v2/editorial/{archive}"])
    manifest = load_json(READINESS / "holdout.manifest.json")
    assert hashlib.sha256((READINESS / manifest["file"]).read_bytes()).hexdigest() == manifest["sha256"]
    queries = load_json(READINESS / manifest["file"])
    assert len({q["id"] for q in queries}) == len(queries) == manifest["count"] == 15
    assert len({q["query"] for q in queries}) == 15
    for name in ("form_audit.json", "review_packet.json"):
        assert outputs[name] == load_json(READINESS / name)
    result = reviewed(outputs, [])
    old = load_json(EDITORIAL / "generated/review_queue.json")["queue"]
    assert len(result["queue"]) == 30 and sum(len(r["edition_reviews"]) for r in result["queue"]) == 97
    assert {r["work_id"]: r["legacy_candidates"] for r in old} == {
        r["work_id"]: r["legacy_candidates"] for r in result["queue"]}
    assert all(row["candidate"]["status"] == "needs_review" for row in outputs["form_audit.json"])
