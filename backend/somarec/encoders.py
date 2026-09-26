"""Sentence encoders.

The default model is multilingual so Kiswahili titles, descriptions and queries
land in the same vector space as English ones. all-MiniLM-L6-v2 (the original
choice) was trained on English only. Override with SOMAREC_EMBED_MODEL.
"""

import hashlib
import logging
import os

import numpy as np

log = logging.getLogger(__name__)

DEFAULT_MODEL = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"

# Some model families expect a prefix on queries vs documents.
_PREFIXES = {
    "intfloat/multilingual-e5": ("query: ", "passage: "),
}


class SentenceEncoder:
    """Thin wrapper around sentence-transformers returning unit-length float32 vectors."""

    def __init__(self, model_name: str = None):
        from sentence_transformers import SentenceTransformer  # heavy import, keep lazy

        self.name = model_name or os.getenv("SOMAREC_EMBED_MODEL", DEFAULT_MODEL)
        self._model = SentenceTransformer(self.name)
        self._query_prefix, self._doc_prefix = "", ""
        for family, prefixes in _PREFIXES.items():
            if self.name.startswith(family):
                self._query_prefix, self._doc_prefix = prefixes

    def encode_documents(self, texts):
        return self._encode([self._doc_prefix + t for t in texts])

    def encode_queries(self, texts):
        return self._encode([self._query_prefix + t for t in texts])

    def _encode(self, texts):
        vectors = self._model.encode(
            list(texts), convert_to_numpy=True, normalize_embeddings=True, show_progress_bar=False
        )
        return np.asarray(vectors, dtype="float32")


def try_load_encoder(model_name: str = None):
    """Return a SentenceEncoder, or None if the model can't be loaded (offline, not installed).

    The engine falls back to keyword (BM25) search when this returns None, and
    /api/health reports which mode is active.
    """
    if os.getenv("SOMAREC_DISABLE_EMBEDDINGS") == "1":
        return None
    try:
        return SentenceEncoder(model_name)
    except Exception as exc:  # noqa: BLE001 - any failure means "no dense search"
        log.warning("Embedding model unavailable (%s); using keyword search only.", exc)
        return None


def cached_document_embeddings(encoder, texts, cache_dir):
    """Encode documents, reusing a cached .npy when the model and texts are unchanged."""
    digest = hashlib.sha256()
    digest.update(encoder.name.encode())
    for text in texts:
        digest.update(b"\0" + text.encode("utf-8"))
    path = None
    if cache_dir:
        os.makedirs(cache_dir, exist_ok=True)
        path = os.path.join(cache_dir, f"emb-{digest.hexdigest()[:16]}.npy")
        if os.path.exists(path):
            vectors = np.load(path)
            if vectors.shape[0] == len(texts):
                return vectors
    vectors = encoder.encode_documents(texts)
    if path:
        np.save(path, vectors)
    return vectors
