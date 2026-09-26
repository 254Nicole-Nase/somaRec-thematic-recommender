from somarec.engine import SearchEngine
from somarec.text import book_id, clean_space, fold_key, guess_language, is_wikidata_placeholder


def test_book_id_is_stable_across_spelling_variants():
    assert book_id("Weep Not, Child", "Ngũgĩ wa Thiong'o") == book_id("weep not child", "Ngugi wa Thiongʼo")
    assert book_id("Weep Not, Child", "Ngũgĩ wa Thiong'o") != book_id("Petals of Blood", "Ngũgĩ wa Thiong'o")


def test_text_helpers():
    assert fold_key("Ngũgĩ wa Thiongʼo") == "ngugi wa thiong o"
    assert is_wikidata_placeholder("Q24937606")
    assert not is_wikidata_placeholder("Q is for Quarry")
    assert guess_language("", title="Sauti ya dhiki") == "Kiswahili"
    assert guess_language("", title="Muthoni wa Kirima, Mau Mau woman field marshal") is None
    assert guess_language("An English description of the novel", title="Caitaani mũtharaba-inĩ") == "Gikuyu"


def test_keyword_search_finds_exact_title_and_folded_author(books):
    engine = SearchEngine(books, encoder=None)
    assert engine.mode == "keyword"
    assert engine.search("Petals of Blood", top_k=1)[0]["title"] == "Petals of Blood"
    hits = engine.search("ngugi wa thiongo", top_k=5)
    assert {h["title"] for h in hits} >= {"Weep Not, Child", "A Grain of Wheat", "Petals of Blood"}


def test_nonsense_query_returns_nothing(books, encoder, tmp_path):
    engine = SearchEngine(books, encoder=encoder, cache_dir=str(tmp_path), tag_themes=False)
    assert engine.search("xyz123", top_k=5) == []
    assert engine.search("   ", top_k=5) == []


def test_hybrid_search_and_filters(books, encoder, tmp_path):
    engine = SearchEngine(books, encoder=encoder, cache_dir=str(tmp_path), tag_themes=False)
    assert engine.mode == "hybrid"
    hits = engine.search("Mau Mau independence struggle", top_k=3)
    assert hits[0]["title"] in {"A Grain of Wheat", "Weep Not, Child"}
    assert "keyword" in hits[0]["match"]
    kiswahili = engine.search("mashairi serikali", top_k=5, language="Kiswahili")
    assert [h["title"] for h in kiswahili] == ["Sauti ya dhiki"]


def test_recommendations_use_catalog_uuid_and_cap_per_author(books, encoder, tmp_path):
    engine = SearchEngine(books, encoder=encoder, cache_dir=str(tmp_path), tag_themes=False)
    seed = book_id("Weep Not, Child", "Ngũgĩ wa Thiong'o")
    recs = engine.similar(seed, top_k=5, max_per_author=1)
    assert recs is not None
    assert seed not in {r["id"] for r in recs}
    authors = [r["author"] for r in recs]
    assert len(authors) == len(set(authors))
    assert engine.similar("not-a-real-id") is None


def test_embeddings_are_cached(books, encoder, tmp_path):
    SearchEngine(books, encoder=encoder, cache_dir=str(tmp_path), tag_themes=False)
    assert len(list(tmp_path.glob("emb-*.npy"))) == 1
    SearchEngine(books, encoder=encoder, cache_dir=str(tmp_path), tag_themes=False)
    assert len(list(tmp_path.glob("emb-*.npy"))) == 1


def test_theme_tagging_is_thresholded(books, encoder, tmp_path):
    engine = SearchEngine(books, encoder=encoder, cache_dir=str(tmp_path))
    for _, row in engine.books.iterrows():
        assert len(row["themes"]) <= 3
        if len(row["description"]) < 80:
            assert row["themes"] == []


def test_clean_space_normalises_unicode_and_repairs_mojibake():
    assert clean_space("Ngũgi  wa\nThiong'o") == "Ngũgi wa Thiong'o"
    assert clean_space("L\x8evi-Strauss and Aim\x8e C\x8esaire, ThiongÕo") == (
        "Lévi-Strauss and Aimé Césaire, Thiong’o"
    )
    assert clean_space("Ngũgĩ") == "Ngũgĩ"


def test_theme_tagging_does_not_let_a_broad_theme_win_everywhere():
    import numpy as np

    from somarec.themes import ThemeTagger

    class StubEncoder:
        def encode_queries(self, texts):
            # "broad" sits close to every book; "war" and "love" are specific.
            return np.array([[1, 0, 0], [0.6, 0.8, 0], [0.6, 0, 0.8]], dtype="float32")

    tagger = ThemeTagger(StubEncoder(), names=["broad", "war", "love"], glosses=["", "", ""], min_z=1.0)
    docs = np.array([[0.9, 0.44, 0], [0.9, 0, 0.44]] + [[1, 0, 0]] * 6, dtype="float32")
    tags = tagger.tag(docs, ["x" * 100] * len(docs))
    assert [t for t, _ in tags[0]] == ["war"]
    assert [t for t, _ in tags[1]] == ["love"]
    assert all("broad" not in [t for t, _ in row] for row in tags)
