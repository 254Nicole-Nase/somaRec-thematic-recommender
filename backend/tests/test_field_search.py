import copy
import hashlib
import json
from pathlib import Path

import pytest

from somarec.catalog_evaluation import evaluate, searchable
from somarec.editorial_review import build_review
from somarec.field_search import Vocabulary

ROOT = Path(__file__).resolve().parents[2] / "experiments/catalog_v2"


def load(name):
    return json.loads((ROOT / name).read_text())


@pytest.fixture
def taxonomy():
    return load("editorial/taxonomy.v1.json")


def review(taxonomy, decisions=()):
    return build_review(load("sample.json"), load("quality.json"), load("editorial/proposals.json"),
                        list(decisions), taxonomy=taxonomy, assignments=load("editorial/assignments.json"),
                        corrections=load("editorial/corrections.json"))


def search(data, query, **kwargs):
    run = evaluate(data, [dict(id="x", query=query, language="mixed", kind="literary_interest")], **kwargs)[0]
    return run["runs"][0]


def ids(run):
    return [r["work_id"] for r in run["results"]]


@pytest.mark.parametrize("original, normalized", [("fiction", None), ("nonfiction", None),
                         ("memoir", None), ("drama", None), ("play", "play"), ("novel", "novel"),
                         ("riwaya", "novel"), ("ushairi", "poetry"), ("picture book", "picture-book")])
def test_form_reconciliation(taxonomy, original, normalized):
    claim = {"value": original, "evidence": ["source fixture"], "status": "needs_review"}
    result = Vocabulary(taxonomy).reconcile(claim)
    assert result["source_assertion"] == claim and result["normalized_form"] == normalized


def test_forms_languages_audience_and_unknowns(taxonomy):
    data = review(taxonomy)
    poetry = search(data, "mashairi ya Kiswahili")
    assert poetry["interpretation"]["required"] == [["form", "poetry"], ["language", "swa"]]
    assert ids(poetry) == ["sauti-ya-dhiki"]
    children = search(data, "hadithi za watoto")
    assert set(ids(children)) == {"hot-hippo", "laughing-giraffe", "jua-na-upepo"}
    assert all(x["match_status"] == "needs_review" for x in children["results"])
    assert ids(search(data, "English riwaya")) and "siku-njema" not in ids(search(data, "English riwaya"))
    assert "betrayal-in-the-city" not in ids(search(data, "tamthilia"))
    assert "betrayal-in-the-city" in ids(search(data, "drama"))
    assert not ids(search(data, "orbital mechanics"))


def test_aliases_resolve_once_and_use_assignment_evidence(taxonomy):
    data = review(taxonomy)
    one = search(data, "ushairi wa gerezani")
    repeated = search(data, "prison poetry na mashairi ya gerezani")
    assert one["results"] == repeated["results"]
    matches = one["results"][0]["literal_evidence_matches"]
    assert [m["field"] for m in matches] == ["genres/prison-poetry"]
    assert matches[0]["evidence"] and "Provisional" in one["results"][0]["explanation"]
    assert not ids(search(data, "speculative fiction"))  # no implied ancestor claim


def test_verified_mode_isolates_assertions_and_rejects_stale_content(taxonomy):
    data = review(taxonomy)
    row = next(row for row in data["queue"] if row["work_id"] == "dust")
    claim = row["fields"]["title"]
    decision = dict(work_id="dust", field="title", fingerprint=claim["fingerprint"], status="verified",
                    reviewer="test-fixture", evidence=claim["evidence"], note="Synthetic decision")
    approved = review(taxonomy, [decision])
    assert ids(search(approved, "Dust", mode="approved_only")) == ["dust"]
    assert not ids(search(approved, "political violence", mode="approved_only"))
    hit = search(approved, "Dust", mode="approved_only")["results"][0]
    assert hit["match_status"] == "verified" and hit["author"] is None and hit["form"] is None
    row = next(row for row in approved["queue"] if row["work_id"] == "dust")
    row["fields"]["title"]["value"] = "Tampered"
    assert not ids(search(approved, "Tampered", mode="approved_only"))
    assert not ids(search(data, "Dust", mode="approved_only"))


def test_verified_edition_language_requires_approved_work_link(taxonomy):
    data = review(taxonomy)
    row = next(r for r in data["queue"] if r["work_id"] == "jua-na-upepo")
    ed = row["edition_reviews"][0]
    decisions = [dict(work_id=row["work_id"], field=f"edition/{ed['edition_id']}/{field}",
                      fingerprint=ed["fields"][field]["fingerprint"], status="verified",
                      reviewer="fixture", evidence=ed["fields"][field]["evidence"], note="Test only")
                 for field in ("languages", "work_id")]
    assert not ids(search(review(taxonomy, decisions[:1]), "Kiswahili", mode="approved_only"))
    assert ids(search(review(taxonomy, decisions), "Kiswahili", mode="approved_only")) == ["jua-na-upepo"]


def test_regression_outputs_and_frozen_sample(taxonomy):
    data = review(taxonomy)
    original = copy.deepcopy(data)
    queries = load("editorial/queries.json")
    report = evaluate(data, queries)[0]
    assert report == evaluate(data, queries)[0]
    results = {run["query_id"]: ids(run) for run in report["runs"]}
    assert report["diagnostics"]["A_lexical"]["known_title_at_1"] == 6
    assert results["q13"] == ["jua-na-upepo"]
    assert results["q17"][0] == "petals-of-blood"
    assert results["q20"] == ["unbowed"]
    assert "the-river-and-the-source" not in results["q11"]
    assert not results["q18"]
    assert data == original
    assert len(searchable(data)) == 30 and sum(len(r["edition_reviews"]) for r in data["queue"]) == 97
    assert hashlib.sha256((ROOT / "editorial/baselines/fa10c736/evaluation.json").read_bytes()).hexdigest() == (
        "e90a047794c62f26b475de484bbb3b053c0f684b4d1e2373292723f0276005e3")
    assert all(not r["results"] for r in evaluate(data, queries, mode="approved_only")[0]["runs"])


def test_explanations_do_not_promote_incidental_overlap(taxonomy):
    data = review(taxonomy)
    hits = search(data, "colonial language and African literary identity")["results"]
    weak = next(row for row in hits if row["work_id"] == "one-day-i-will-write-about-this-place")
    assert [(m["field"], m["kind"]) for m in weak["literal_evidence_matches"]] == [("synopsis", "lexical overlap")]
    assert weak["explanation"].startswith("Provisional lexical overlap in synopsis")
    queue = next(r for r in data["profiles"] if r["work_id"] == "jua-na-upepo")
    queue["audiences"][0]["status"] = "conflicting"
    assert "jua-na-upepo" not in ids(search(data, "hadithi za watoto"))


def test_exact_title_respects_explicit_edition_language(taxonomy):
    data = review(taxonomy)
    query = dict(id="x", query="Dust", kind="literary_interest", language="en", work_language="swa")
    assert not evaluate(data, [query])[0]["runs"][0]["results"]
