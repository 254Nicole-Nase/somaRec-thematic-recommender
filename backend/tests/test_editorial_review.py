import csv
import json
from pathlib import Path

import numpy as np
import pytest

from review_catalog_v2 import gate_report, worksheets
from somarec.catalog_evaluation import LocalModel, evaluate, searchable
from somarec.editorial_review import build_review

ROOT = Path(__file__).resolve().parents[2] / "experiments" / "catalog_v2"
EVIDENCE = ["https://example.org/publisher"]


def load(path):
    return json.loads((ROOT / path).read_text())


@pytest.fixture
def inputs():
    return load("sample.json"), load("quality.json"), load("editorial/proposals.json")


@pytest.fixture
def review(inputs):
    return build_review(*inputs, [])


def item(rows, work_id):
    return next(row for row in rows if row["work_id"] == work_id)


def test_queue_keeps_multisource_matches_and_editions_unapproved(review):
    assert len(review["queue"]) == 30
    assert sum(len(row["edition_reviews"]) for row in review["queue"]) == 97
    assert all(not row["status_counts"].get("verified") for row in review["queue"])
    assert [row["priority"] for row in review["queue"]] == sorted(row["priority"] for row in review["queue"])
    dragonfly = item(review["queue"], "the-dragonfly-sea")
    assert len(dragonfly["legacy_candidates"]) == 2
    assert dragonfly["fields"]["legacy_mapping"]["status"] == "conflicting"
    assert dragonfly["edition_reviews"] == []
    assert review["quarantined_outside_scope"] == ["greedy-zebra", "tricky-tortoise"]
    assert any(row["isbn_conflicts"] for row in review["queue"])


def test_literary_fields_distinguish_proposals_unknown_and_conflict(review):
    dust = item(review["profiles"], "dust")["fields"]
    assert dust["themes"]["status"] == "needs_review"
    assert dust["themes"]["origin"] == "editorial_proposal"
    assert dust["themes"]["evidence"]
    assert dust["language"]["origin"] == "automated_candidate"
    assert dust["original_language"]["value"] is None
    juices = item(review["profiles"], "juices")["fields"]
    assert juices["synopsis"]["status"] == "unknown"
    assert juices["synopsis"]["note"]
    river = item(review["profiles"], "the-river-and-the-source")["fields"]
    assert river["synopsis"]["status"] == "conflicting"
    assert "synopsis" not in item(searchable(review), "the-river-and-the-source")["text_fields"]


def approval(work_id, field, fingerprint, status="verified"):
    return {
        "work_id": work_id, "field": field, "fingerprint": fingerprint, "status": status,
        "reviewer": "fixture-reviewer", "evidence": EVIDENCE, "note": "Reviewed against the source fixture.",
    }


def test_explicit_human_decision_is_bound_and_visible(inputs, review):
    theme = item(review["profiles"], "dust")["fields"]["themes"]
    decision = approval("dust", "themes", theme["fingerprint"])
    revised = build_review(*inputs, [decision])
    verified = item(revised["profiles"], "dust")["fields"]["themes"]
    assert verified["status"] == "verified"
    assert verified["human_decision"] == decision
    assert verified["origin"] == "editorial_proposal"
    assert build_review(*inputs, []) == review
    with pytest.raises(ValueError, match="Stale decision"):
        build_review(*inputs, [{**decision, "fingerprint": "0" * 64}])


@pytest.mark.parametrize("field,status,message", [
    ("synopsis", "verified", "Resolve the source conflict"),
    ("synopsis", "needs_review", "Resolve the source conflict"),
    ("original_language", "verified", "Provide a value"),
])
def test_decisions_cannot_silently_resolve_conflicts_or_unknowns(inputs, review, field, status, message):
    claim = item(review["profiles"], "the-river-and-the-source")["fields"][field]
    with pytest.raises(ValueError, match=message):
        build_review(*inputs, [approval("the-river-and-the-source", field, claim["fingerprint"], status)])


def test_evaluation_uses_objective_title_controls_and_leaves_judgments_blank(review, tmp_path):
    queries = load("editorial/queries.json")
    report, runtime = evaluate(review, queries)
    assert report == evaluate(review, queries)[0]
    assert len(queries) >= 20
    assert {"en", "sw", "mixed"} == {query["language"] for query in queries}
    assert report["human_judgments"] == "not_collected"
    assert report["systems"]["B_semantic"] == "not_run_no_local_model"
    summary = report["diagnostics"]["A_lexical"]
    assert summary["known_title_at_1"] == summary["known_title_controls"] == 6
    assert summary["irrelevant_controls_with_results"] == 0
    assert len(runtime["median_query_ms"]) == 1
    assert gate_report(review, report)["expansion_ready"] is False

    worksheets(report, tmp_path)
    with (tmp_path / "relevance_worksheet.csv").open() as stream:
        hits = list(csv.DictReader(stream))
    with (tmp_path / "list_worksheet.csv").open() as stream:
        lists = list(csv.DictReader(stream))
    assert hits and all(not row["relevance_0_to_3"] and not row["spoiler_risk"] for row in hits)
    assert len(lists) == len(queries) and any(row["results_count"] == "0" for row in lists)
    assert all(not row["diversity_1_to_3"] for row in lists)


def test_optional_semantic_and_hybrid_paths_with_fake_encoder(review):
    class Encoder:
        def encode_documents(self, texts):
            return np.array([[float(" Dust " in f" {text} "), 0.0] for text in texts])

        def encode_queries(self, texts):
            return np.array([[1.0, 0.0] for _ in texts])

    query = next(q for q in load("editorial/queries.json") if q["id"] == "q01")
    report, runtime = evaluate(review, [query], Encoder(), model_name="fixture-only")
    assert list(report["systems"].values()) == ["ran", "ran", "ran"]
    assert all(run["results"][0]["work_id"] == "dust" for run in report["runs"])
    assert report["runs"][2]["results"][0]["ranking_signals"] == ["lexical", "semantic"]
    assert runtime["dense_vector_bytes"] == 30 * 2 * 4


def test_model_path_must_exist_locally(tmp_path):
    with pytest.raises(ValueError, match="local Sentence Transformers directory"):
        LocalModel(tmp_path)


def test_inherited_literary_replacement_stays_pending_and_is_bound(inputs):
    catalog, quality, _ = inputs
    base = build_review(catalog, quality, {}, [])
    current = item(base["profiles"], "the-river-and-the-source")["fields"]["synopsis"]
    replacement = {"value": "Alternative fiction synopsis fixture.", "evidence": EVIDENCE,
                   "replaces": current["fingerprint"]}
    proposals = {"the-river-and-the-source": {"synopsis": replacement}}
    rebuilt = build_review(catalog, quality, proposals, [])
    field = item(rebuilt["profiles"], "the-river-and-the-source")["fields"]["synopsis"]
    assert field["value"] == replacement["value"]
    assert field["status"] == "needs_review"
    replacement["replaces"] = "1" * 64
    with pytest.raises(ValueError, match="Stale literary replacement"):
        build_review(catalog, quality, proposals, [])
