"""Zero-shot theme tagging against the curated theme list in data/themes.csv.

Changes from the original notebook approach:
  * each theme is embedded with a short gloss ("Colonialism and resistance: British
    colonial rule in Kenya, Mau Mau ...") instead of the bare label
  * a theme is only assigned when it stands out for this book, so a book is no
    longer forced into exactly three themes
  * each theme's scores are standardised across the catalog (z-scores). Raw cosine
    similarity let a few broad themes ("Ethnic diversity", "Wealth and materialism")
    sit close to almost every Kenyan book and win everywhere
  * books with too little text (no real description) are left untagged rather
    than tagged from their title alone
The threshold should be calibrated against human labels (see evaluation/).
"""

import os

import numpy as np
import pandas as pd

THEMES_CSV = os.path.join(os.path.dirname(__file__), "..", "data", "themes.csv")
MIN_DESCRIPTION_CHARS = 80


def load_themes(path: str = THEMES_CSV):
    df = pd.read_csv(path).fillna("")
    return df["name"].tolist(), df["description"].tolist()


class ThemeTagger:
    def __init__(self, encoder, names=None, glosses=None, min_z=None, max_themes=3, margin=0.75):
        if names is None:
            names, glosses = load_themes()
        self.names = list(names)
        self.min_z = float(min_z if min_z is not None else os.getenv("SOMAREC_THEME_MIN_Z", 1.5))
        self.max_themes = max_themes
        self.margin = margin
        texts = [f"{n}: {g}" if g else n for n, g in zip(self.names, glosses or [""] * len(self.names))]
        self.vectors = encoder.encode_queries(texts)

    def scores(self, doc_vectors: np.ndarray) -> np.ndarray:
        return doc_vectors @ self.vectors.T

    def tag(self, doc_vectors: np.ndarray, descriptions) -> list:
        """Return, per book, a list of (theme, z-score) pairs; empty when evidence is weak.

        Tags the whole catalog at once: a theme's z-score says how much more this book
        matches it than the typical book with a description does.
        """
        sims = self.scores(doc_vectors)
        has_text = np.array([len(d or "") >= MIN_DESCRIPTION_CHARS for d in descriptions])
        if has_text.sum() < 2:
            return [[] for _ in descriptions]
        mean, std = sims[has_text].mean(axis=0), sims[has_text].std(axis=0) + 1e-6
        z = (sims - mean) / std
        tagged = []
        for row, ok in zip(z, has_text):
            if not ok:
                tagged.append([])
                continue
            order = np.argsort(-row)[: self.max_themes]
            best = row[order[0]]
            keep = [
                (self.names[i], round(float(row[i]), 3))
                for i in order
                if row[i] >= self.min_z and row[i] >= best - self.margin
            ]
            tagged.append(keep)
        return tagged
