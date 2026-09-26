import pandas as pd
import pytest

from app import create_app
from somarec import cbc
from somarec.engine import SearchEngine
from somarec.text import book_id


@pytest.fixture
def client(books, encoder, tmp_path):
    engine = SearchEngine(books, encoder=encoder, cache_dir=str(tmp_path), tag_themes=False)
    seed = book_id("Going Down River Road", "Meja Mwangi")
    alignments = pd.DataFrame([{
        "book_id": seed, "level": "Senior School (Grade 10-12)", "learning_area": "English",
        "focus": "Citizenship", "notes": "", "status": "reviewed", "source": "teacher",
        "reviewed_by": "T. Teacher", "reviewed_on": "2026-01-10",
    }])
    return create_app(engine=engine, alignments=alignments).test_client()


def test_health(client):
    body = client.get("/api/health").get_json()
    assert body["status"] == "ok" and body["mode"] == "hybrid" and body["books"] == 6


def test_search_validation(client):
    assert client.get("/api/search").status_code == 400
    assert client.get("/api/search?q=x&mode=bogus").status_code == 400
    assert client.get("/api/search?q=Petals of Blood&top_k=1").get_json()[0]["title"] == "Petals of Blood"


def test_book_detail_similar_and_404(client):
    bid = book_id("Weep Not, Child", "Ngũgĩ wa Thiong'o")
    book = client.get(f"/api/books/{bid}").get_json()
    assert book["id"] == bid and book["where_to_find"]
    assert client.get(f"/api/books/{bid}/similar").status_code == 200
    assert client.get(f"/api/recommend?book_id={bid}").status_code == 200
    assert client.get("/api/books/unknown").status_code == 404
    assert client.get("/api/books/unknown/similar").status_code == 404


def test_cbc_returns_reviewed_and_labelled_suggestions(client):
    body = client.get("/api/cbc?learning_area=English&focus=Citizenship").get_json()
    assert [b["title"] for b in body["reviewed"]] == ["Going Down River Road"]
    assert body["reviewed"][0]["cbc"]["status"] == "reviewed"
    for book in body["suggested"]:
        assert book["cbc"]["status"] == "suggested"
        assert book["cbc"]["level"] == ""  # suggestions never claim a grade level
        assert book["language"] == "English"
        assert book["title"] != "Going Down River Road"
    options = client.get("/api/cbc/options").get_json()
    assert "Junior School (Grade 7-9)" in options["levels"]
    assert not any(level.startswith("Form") for level in options["levels"])


def test_load_alignments_ignores_unreviewed_rows(tmp_path):
    path = tmp_path / "cbc.csv"
    path.write_text(
        "book_id,level,learning_area,focus,notes,status,source,reviewed_by,reviewed_on\n"
        "a,Junior School (Grade 7-9),English,Citizenship,,reviewed,KICD list,X,2026-01-01\n"
        "b,Junior School (Grade 7-9),English,Citizenship,,draft,,,\n"
    )
    assert cbc.load_alignments(str(path))["book_id"].tolist() == ["a"]


def test_reindex_requires_token(client, monkeypatch):
    monkeypatch.delenv("SOMAREC_ADMIN_TOKEN", raising=False)
    assert client.post("/api/admin/reindex").status_code == 403
    monkeypatch.setenv("SOMAREC_ADMIN_TOKEN", "secret")
    assert client.post("/api/admin/reindex", headers={"Authorization": "Bearer wrong"}).status_code == 401
