"""Zero-shot theme tagging against the curated theme list in data/themes.csv.

Changes from the original notebook approach:
  * each theme is embedded with a short gloss ("Colonialism and resistance: British
    colonial rule in Kenya, Mau Mau ...") instead of the bare label
  * a theme is only assigned when its similarity clears a threshold, so a book is
    no longer forced into exactly three themes
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
    def __init__(self, encoder, names=None, glosses=None, min_score=None, max_themes=3, margin=0.08):
        if names is None:
            names, glosses = load_themes()
        self.names = list(names)
        self.min_score = float(min_score if min_score is not None else os.getenv("SOMAREC_THEME_MIN_SCORE", 0.30))
        self.max_themes = max_themes
        self.margin = margin
        texts = [f"{n}: {g}" if g else n for n, g in zip(self.names, glosses or [""] * len(self.names))]
        self.vectors = encoder.encode_queries(texts)

    def scores(self, doc_vectors: np.ndarray) -> np.ndarray:
        return doc_vectors @ self.vectors.T

    def tag(self, doc_vectors: np.ndarray, descriptions) -> list:
        """Return, per book, a list of (theme, score) pairs; empty when evidence is weak."""
        sims = self.scores(doc_vectors)
        tagged = []
        for row, description in zip(sims, descriptions):
            if len(description or "") < MIN_DESCRIPTION_CHARS:
                tagged.append([])
                continue
            order = np.argsort(-row)[: self.max_themes]
            best = row[order[0]]
            keep = [
                (self.names[i], round(float(row[i]), 3))
                for i in order
                if row[i] >= self.min_score and row[i] >= best - self.margin
            ]
            tagged.append(keep)
        return tagged
