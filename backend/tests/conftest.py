import os
import sys
import zlib

import numpy as np
import pandas as pd
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from somarec.catalog import _normalise  # noqa: E402
from somarec.text import book_id, tokenize  # noqa: E402


class FakeEncoder:
    """Deterministic bag-of-words hashing encoder: no model download, but texts that
    share words get similar vectors, which is enough to exercise the dense path."""

    name = "fake-hashing-encoder"
    dim = 64

    def _encode(self, texts):
        out = np.zeros((len(texts), self.dim), dtype="float32")
        for row, text in enumerate(texts):
            for token in tokenize(text):
                out[row, zlib.crc32(token.encode()) % self.dim] += 1.0
        norms = np.linalg.norm(out, axis=1, keepdims=True)
        norms[norms == 0] = 1.0
        return out / norms

    encode_documents = _encode
    encode_queries = _encode


BOOKS = [
    ("Weep Not, Child", "Ngũgĩ wa Thiong'o", "English",
     "A boy dreams of education while the Mau Mau uprising and colonial land seizures tear his family apart."),
    ("A Grain of Wheat", "Ngũgĩ wa Thiongʼo", "English",
     "Villagers remember betrayal and heroism in the Mau Mau struggle on the eve of Kenyan independence."),
    ("Petals of Blood", "Ngũgĩ wa Thiong'o", "English",
     "Four people are suspected of murder in Ilmorog, a story of corruption and greed in post-independence Kenya."),
    ("Going Down River Road", "Meja Mwangi", "English",
     "Construction workers survive poverty, drink and unemployment in the slums of Nairobi city."),
    ("Sauti ya dhiki", "Abdilatif Abdalla", "Kiswahili",
     "Mashairi yaliyoandikwa gerezani na mshairi aliyefungwa kwa kupinga serikali."),
    ("The River and the Source", "Marjorie Oludhe Macgoye", "English",
     "Four generations of Luo women from the village to Nairobi, family, marriage and the role of women."),
]


@pytest.fixture
def books():
    df = pd.DataFrame(
        [{"id": book_id(t, a), "title": t, "author": a, "language": lang, "description": d, "year": 1970}
         for t, a, lang, d in BOOKS]
    )
    return _normalise(df)


@pytest.fixture
def encoder():
    return FakeEncoder()
