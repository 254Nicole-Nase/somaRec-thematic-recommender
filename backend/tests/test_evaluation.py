import os
import sys

import pandas as pd
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "evaluation"))

import evaluate  # noqa: E402
from somarec.engine import SearchEngine  # noqa: E402


def test_dcg_and_kappa():
    assert evaluate.dcg([2, 0, 1]) == pytest.approx(2 + 0 + 1 / 2)
    assert evaluate.cohen_kappa([1, 0, 1, 0], [1, 0, 1, 0]) == pytest.approx(1.0)
    assert evaluate.cohen_kappa([1, 1, 0, 0], [1, 0, 1, 0]) == pytest.approx(0.0)


def test_known_item_pool_and_score(books, encoder, tmp_path):
    engine = SearchEngine(books, encoder=encoder, cache_dir=str(tmp_path), tag_themes=False)
    systems = {
        "keyword": evaluate.engine_system(engine, "keyword"),
        "hybrid": evaluate.engine_system(engine, "hybrid"),
    }
    table, n = evaluate.known_item(books, systems, sample=5, seed=1)
    assert n == 5
    exact = table[(table["query type"] == "exact title") & (table["system"] == "keyword")].iloc[0]
    assert exact["Hit@10"] == 1.0

    queries = pd.DataFrame([{"query_id": "Q1", "query": "Mau Mau independence"}])
    sheet = evaluate.pool(books, systems, queries, str(tmp_path / "pool.csv"), seed=1)
    assert set(sheet.columns) >= {"query_id", "book_id", "relevance"}

    # One rater marks the Mau Mau novels relevant, everything else not.
    sheet["relevance"] = sheet["title"].isin(["A Grain of Wheat", "Weep Not, Child"]).astype(int) * 2
    judged = tmp_path / "rater1.csv"
    sheet.to_csv(judged, index=False)
    scores, kappa, _ = evaluate.score(books, systems, queries, [str(judged)])
    assert kappa is None
    assert (scores["nDCG@10"] > 0.5).all()
