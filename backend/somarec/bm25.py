"""Okapi BM25 keyword ranking.

Tokens are ASCII-folded, so "Ngugi" matches "Ngũgĩ" and "Thiongo" matches
"Thiong'o". This is what makes exact title/author searches reliable; the
dense model alone often ranks the right book below thematically similar ones.
"""

import math
from collections import Counter

import numpy as np

from .text import tokenize


class BM25:
    def __init__(self, documents, k1: float = 1.5, b: float = 0.75):
        self.k1, self.b = k1, b
        self.doc_tokens = [tokenize(d) for d in documents]
        self.doc_len = np.array([len(t) for t in self.doc_tokens], dtype="float32")
        self.avg_len = float(self.doc_len.mean()) if len(self.doc_len) else 0.0
        self.term_freqs = [Counter(t) for t in self.doc_tokens]
        df = Counter()
        for tokens in self.doc_tokens:
            df.update(set(tokens))
        n = len(self.doc_tokens)
        self.idf = {term: math.log(1 + (n - freq + 0.5) / (freq + 0.5)) for term, freq in df.items()}

    def scores(self, query: str) -> np.ndarray:
        terms = [t for t in tokenize(query) if t in self.idf]
        out = np.zeros(len(self.doc_tokens), dtype="float32")
        if not terms or self.avg_len == 0:
            return out
        norm = self.k1 * (1 - self.b + self.b * self.doc_len / self.avg_len)
        for term in terms:
            tf = np.array([freqs.get(term, 0) for freqs in self.term_freqs], dtype="float32")
            out += self.idf[term] * tf * (self.k1 + 1) / (tf + norm)
        return out
