import json
from pathlib import Path

import pytest

from somarec.catalog_evaluation import searchable
from somarec.editorial_review import build_review
from somarec.taxonomy import label_key, validate_taxonomy

ROOT = Path(__file__).resolve().parents[2] / "experiments/catalog_v2"


def read(name):
    return json.loads((ROOT / name).read_text())


@pytest.fixture
def taxonomy():
    return read("editorial/taxonomy.v1.json")


def test_multilingual_hierarchy(taxonomy):
    cats, labels = validate_taxonomy(taxonomy)
    assert set(cats["detective-fiction"]["parents"]) == {"crime-fiction", "mystery"}
    assert labels["form", "en", "poetry"] == labels["form", "sw", label_key(" USHAIRI ")]
    assert labels["genre", "sw", "mashairi ya gerezani"] == "prison-poetry"
    assert ("form", "sw", "mashairi ya gerezani") not in labels
    assert cats["children"]["dimension"] == "audience"


@pytest.mark.parametrize("change", ["duplicate", "cycle", "alias", "reference", "dimension",
                                     "cross_dimension", "external", "relation", "deprecation"])
def test_rejects_invalid_vocabulary(taxonomy, change):
    root, child = taxonomy["categories"][:2]
    if change == "duplicate":
        child["id"] = root["id"]
    elif change == "cycle":
        root["parents"] = [child["id"]]
    elif change == "alias":
        child["aliases"]["sw"] = [root["labels"]["sw"].upper()]
    elif change == "reference":
        child["parents"] = ["absent"]
    elif change == "dimension":
        child["dimension"] = "trope-and-theme"
    elif change == "cross_dimension":
        child["parents"] = ["poetry"]
    elif change == "deprecation":
        child["replaced_by"] = "mystery"
    else:
        mapping = next(row["mappings"][0] for row in taxonomy["categories"] if row["mappings"])
        mapping.update({"uri": "https://example.com/wiki/Q482"} if change == "external" else {"relation": "same-ish"})
    with pytest.raises(ValueError):
        validate_taxonomy(taxonomy)


@pytest.fixture
def inputs(taxonomy):
    base = [read("sample.json"), read("quality.json"), read("editorial/proposals.json")]
    extra = dict(taxonomy=taxonomy, assignments=read("editorial/assignments.json"),
                 corrections=read("editorial/corrections.json"))
    return base, extra


def test_extensions_preserve_identity_fingerprints_and_search_contract(inputs):
    base, extra = inputs
    old = build_review(*base, [])
    new = build_review(*base, [], **extra)
    assert new == build_review(*base, [], **extra)
    assert len(new["queue"]) == 30
    assert sum(len(row["edition_reviews"]) for row in new["queue"]) == 97
    assert len(read("editorial/queries.json")) == 24
    by_id = {row["work_id"]: row for row in old["queue"]}
    for row in new["queue"]:
        for key in ("fields", "edition_reviews", "legacy_candidates"):
            assert row[key] == by_id[row["work_id"]][key]
    for before, after in zip(old["profiles"], new["profiles"], strict=True):
        for field, value in before["fields"].items():
            changed = field in extra["corrections"].get(before["work_id"], {})
            assert (value["fingerprint"] != after["fields"][field]["fingerprint"]) == changed
    docs = {row["work_id"]: row["text_fields"] for row in searchable(new)}
    assert "synopsis" not in docs["the-river-and-the-source"]
    assert "synopsis" not in docs["juices"]
    assert all("genres" not in fields and "audiences" not in fields for fields in docs.values())


def test_individual_evidence_bound_genre_decision(inputs):
    base, extra = inputs
    wid = "the-house-of-rust"

    def genres(decisions):
        result = build_review(*base, decisions, **extra)
        return next(row["genres"] for row in result["profiles"] if row["work_id"] == wid)

    secondary, primary = genres([])
    assert [secondary["value"]["display"], primary["value"]["display"]] == ["secondary", "primary"]
    decision = dict(work_id=wid, field="genres/magical-realism", fingerprint=primary["fingerprint"],
                    status="verified", reviewer="test fixture", evidence=primary["evidence"], note="Fixture only")
    other, reviewed = genres([decision])
    assert reviewed["human_decision"] == decision and reviewed["status"] == "verified"
    assert other == secondary and other["status"] == "needs_review"
    extra["assignments"][wid][0]["reason"] += " Changed rationale."
    with pytest.raises(ValueError, match="Stale decision"):
        genres([decision])


@pytest.mark.parametrize("error", ["empty_evidence", "private_url", "two_primary", "unknown", "retired",
                                    "duplicate", "stale_replacement"])
def test_rejects_unsafe_changes(inputs, error):
    base, extra = inputs
    rows = extra["assignments"]["the-house-of-rust"]
    if error in {"empty_evidence", "private_url"}:
        rows[0]["evidence"] = [] if error == "empty_evidence" else ["file:///secret"]
    elif error == "two_primary":
        rows[1]["display"] = "primary"
    elif error == "unknown":
        rows[0]["category_id"] = "missing"
    elif error == "duplicate":
        rows.append(rows[0])
    elif error == "retired":
        next(c for c in extra["taxonomy"]["categories"] if c["id"] == rows[0]["category_id"])["status"] = "deprecated"
    else:
        extra["corrections"]["petals-of-blood"]["themes"]["replaces"] = "0" * 64
    with pytest.raises(ValueError):
        build_review(*base, [], **extra)


def test_model_free_cli_reproduces_committed_artifacts(tmp_path, monkeypatch):
    import sys
    from review_catalog_v2 import main

    monkeypatch.setattr(sys, "argv", ["review_catalog_v2.py", "--output-dir", str(tmp_path)])
    assert main() == 0
    expected = ROOT / "editorial/generated"
    assert {p.name for p in tmp_path.iterdir()} == {p.name for p in expected.iterdir()}
    for artifact in expected.iterdir():
        assert (tmp_path / artifact.name).read_bytes() == artifact.read_bytes()
