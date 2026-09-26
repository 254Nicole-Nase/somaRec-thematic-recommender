"""Hybrid search and recommendation over the SomaRec catalog.

Ranking = Reciprocal Rank Fusion of
  * BM25 keyword scores (exact titles, author names, rare words), and
  * dense cosine similarity from a multilingual sentence encoder (meaning/themes).

Search is exact (FAISS IndexFlatIP, or plain numpy if FAISS isn't installed).
With a few hundred to a few hundred thousand books, exact search is fast enough
and never misses a match; an IVF index only pays off far beyond that size.
"""

import logging
import os
import time

import numpy as np

from .bm25 import BM25
from .catalog import book_to_api
from .encoders import cached_document_embeddings
from .themes import ThemeTagger

log = logging.getLogger(__name__)

RRF_K = 60
CANDIDATES = 100
CACHE_DIR = os.path.join(os.path.dirname(__file__), "..", ".cache")


def _dense_text(row) -> str:
    parts = [f"{row['title']} by {row['author']}".strip()]
    if row["description"]:
        parts.append(row["description"])
    return ". ".join(parts)


def _keyword_text(row) -> str:
    # Title and author repeated so they outweigh incidental words in long descriptions.
    return f"{row['title']} {row['title']} {row['author']} {row['author']} {row['description']}"


class _ExactIndex:
    def __init__(self, vectors: np.ndarray):
        self.vectors = vectors
        try:
            import faiss

            self._faiss = faiss.IndexFlatIP(vectors.shape[1])
            self._faiss.add(vectors)
        except ImportError:
            self._faiss = None

    def search(self, query_vector: np.ndarray, k: int):
        k = min(k, len(self.vectors))
        if self._faiss is not None:
            scores, idx = self._faiss.search(query_vector.reshape(1, -1).astype("float32"), k)
            return idx[0], scores[0]
        sims = self.vectors @ query_vector
        idx = np.argsort(-sims)[:k]
        return idx, sims[idx]


class SearchEngine:
    def __init__(self, books, encoder=None, cache_dir=CACHE_DIR, min_dense_score=None, tag_themes=True):
        started = time.time()
        self.books = books.reset_index(drop=True)
        self.encoder = encoder
        self.min_dense_score = float(
            min_dense_score if min_dense_score is not None else os.getenv("SOMAREC_MIN_DENSE_SCORE", 0.20)
        )
        self.id_to_index = {bid: i for i, bid in enumerate(self.books["id"])}
        self.bm25 = BM25([_keyword_text(r) for _, r in self.books.iterrows()])

        self.vectors = None
        self.index = None
        self.tagger = None
        if encoder is not None:
            texts = [_dense_text(r) for _, r in self.books.iterrows()]
            self.vectors = cached_document_embeddings(encoder, texts, cache_dir)
            self.index = _ExactIndex(self.vectors)
            if tag_themes:
                self.tagger = ThemeTagger(encoder)
                self._apply_theme_tags()
        log.info("Search engine ready: %d books, mode=%s, %.1fs", len(self.books), self.mode, time.time() - started)

    # ------------------------------------------------------------------ info
    @property
    def mode(self) -> str:
        return "hybrid" if self.encoder is not None else "keyword"

    def info(self) -> dict:
        return {
            "books": len(self.books),
            "mode": self.mode,
            "embedding_model": getattr(self.encoder, "name", None),
            "themes_tagged": int(sum(bool(t) for t in self.books["themes"])),
            "theme_source": "model" if self.tagger else "legacy_top3",
        }

    def _apply_theme_tags(self):
        tags = self.tagger.tag(self.vectors, self.books["description"].tolist())
        self.books["themes"] = [[name for name, _ in t] for t in tags]
        self.books["theme_scores"] = [dict(t) for t in tags]
        self.books["theme_source"] = ["model" if t else "insufficient_text" for t in tags]

    # --------------------------------------------------------------- ranking
    def _keyword_ranking(self, query: str):
        scores = self.bm25.scores(query)
        order = np.argsort(-scores)[:CANDIDATES]
        return [(int(i), float(scores[i])) for i in order if scores[i] > 0]

    def _dense_ranking(self, query_vector: np.ndarray, exclude=None):
        idx, sims = self.index.search(query_vector, CANDIDATES + 1)
        return [
            (int(i), float(s))
            for i, s in zip(idx, sims)
            if i >= 0 and i != exclude and s >= self.min_dense_score
        ]

    @staticmethod
    def _fuse(*rankings):
        fused, parts = {}, {}
        for name, ranking in rankings:
            for rank, (i, score) in enumerate(ranking):
                fused[i] = fused.get(i, 0.0) + 1.0 / (RRF_K + rank + 1)
                parts.setdefault(i, {})[name] = {"rank": rank + 1, "score": round(score, 4)}
        order = sorted(fused, key=lambda i: -fused[i])
        return [(i, fused[i], parts[i]) for i in order]

    def rank(self, query: str, mode: str = "hybrid"):
        """Return [(row_index, fused_score, component_scores)] best first."""
        query = (query or "").strip()
        if not query:
            return []
        if mode not in ("hybrid", "keyword", "dense"):
            raise ValueError(f"unknown mode {mode!r}")
        if self.encoder is None:
            mode = "keyword"
        rankings = []
        if mode in ("hybrid", "keyword"):
            rankings.append(("keyword", self._keyword_ranking(query)))
        if mode in ("hybrid", "dense"):
            qv = self.encoder.encode_queries([query])[0]
            rankings.append(("semantic", self._dense_ranking(qv)))
        return self._fuse(*rankings)

    # ---------------------------------------------------------------- public
    def search(self, query: str, top_k: int = 10, mode: str = "hybrid", language=None, theme=None):
        results = []
        for i, score, parts in self.rank(query, mode):
            row = self.books.iloc[i]
            if language and row["language"].lower() != language.lower():
                continue
            if theme and theme not in row["themes"]:
                continue
            book = self._to_api(row)
            book["similarity_score"] = round(score, 5)
            book["match"] = parts
            results.append(book)
            if len(results) >= top_k:
                break
        return results

    def get(self, book_id: str):
        i = self.id_to_index.get(book_id)
        return None if i is None else self._to_api(self.books.iloc[i])

    def similar(self, book_id: str, top_k: int = 6, max_per_author: int = 2, exclude_same_author: bool = False):
        """Books like this one. Caps books per author so results aren't one author's list.

        exclude_same_author drops the seed's own author, for pages that already show
        "More by this author" separately.
        """
        i = self.id_to_index.get(book_id)
        if i is None:
            return None
        seed_author = self.books.iloc[i]["author"]
        if self.vectors is not None:
            ranking = self._dense_ranking(self.vectors[i], exclude=i)
        else:
            ranking = [(j, s) for j, s in self._keyword_ranking(_keyword_text(self.books.iloc[i])) if j != i]
        per_author, results = {}, []
        for j, score in ranking:
            row = self.books.iloc[j]
            if exclude_same_author and row["author"] == seed_author:
                continue
            count = per_author.get(row["author"], 0)
            if count >= max_per_author:
                continue
            per_author[row["author"]] = count + 1
            book = self._to_api(row)
            book["similarity_score"] = round(score, 4)
            results.append(book)
            if len(results) >= top_k:
                break
        return results

    def by_author(self, book_id: str, top_k: int = 6):
        i = self.id_to_index.get(book_id)
        if i is None:
            return None
        author = self.books.iloc[i]["author"]
        same = self.books[(self.books["author"] == author) & (self.books.index != i)]
        return [self._to_api(r) for _, r in same.head(top_k).iterrows()]

    def all_books(self):
        return [self._to_api(r) for _, r in self.books.iterrows()]

    def themes(self):
        counts = {}
        for themes in self.books["themes"]:
            for t in themes:
                counts[t] = counts.get(t, 0) + 1
        return [{"name": k, "books": v} for k, v in sorted(counts.items())]

    def languages(self):
        return sorted({lang for lang in self.books["language"] if lang})

    def _to_api(self, row):
        book = book_to_api(row)
        if "theme_scores" in row and isinstance(row["theme_scores"], dict):
            book["theme_scores"] = row["theme_scores"]
        return book
