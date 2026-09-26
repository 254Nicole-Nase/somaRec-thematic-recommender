import os
import sys

import pandas as pd
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "pipeline"))

from build_catalog import CATALOG_COLUMNS, apply_corrections  # noqa: E402
from somarec.text import book_id  # noqa: E402


def _catalog():
    row = {c: "" for c in CATALOG_COLUMNS}
    row.update(id=book_id("Petals of Blood", "Ngũgĩ wa Thiong'o"), title="Petals of Blood",
               author="Ngũgĩ wa Thiong'o", language="Gikuyu", language_source="metadata")
    return pd.DataFrame([row], columns=CATALOG_COLUMNS)


def test_corrections_match_folded_title_and_mark_language_curated(tmp_path):
    path = tmp_path / "corrections.csv"
    path.write_text("title,author,field,value,note\npetals of blood,Ngugi wa Thiongʼo,language,English,\n",
                    encoding="utf-8")
    df, applied = apply_corrections(_catalog(), str(path))
    assert applied == 1
    assert df.loc[0, "language"] == "English"
    assert df.loc[0, "language_source"] == "curated"


def test_stale_correction_fails_loudly(tmp_path):
    path = tmp_path / "corrections.csv"
    path.write_text("title,author,field,value,note\nNo Such Book,Nobody,language,English,\n", encoding="utf-8")
    with pytest.raises(ValueError, match="no book"):
        apply_corrections(_catalog(), str(path))


def test_shipped_corrections_all_apply():
    catalog = pd.read_csv(os.path.join(os.path.dirname(__file__), "..", "data", "catalog.csv"), dtype=str).fillna("")
    corrections = os.path.join(os.path.dirname(__file__), "..", "data", "corrections.csv")
    df, applied = apply_corrections(catalog, corrections)
    assert applied > 0
