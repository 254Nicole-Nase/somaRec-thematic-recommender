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


def test_enrichment_fills_only_missing_fields(tmp_path):
    from build_catalog import apply_enrichment

    df = _catalog()
    df.loc[0, "cover_url"] = "https://example.org/existing.jpg"
    path = tmp_path / "enrichment.csv"
    long_desc = "A novel of post-independence Kenya following four lives in the village of Ilmorog."
    pd.DataFrame([{"id": df.loc[0, "id"], "title": "", "author": "", "ol_work_key": "/works/OL1W",
                   "description": long_desc, "cover_url": "https://covers.openlibrary.org/b/id/1-L.jpg",
                   "checked_at": ""}]).to_csv(path, index=False)
    out, counts = apply_enrichment(df, str(path))
    assert out.loc[0, "description"] == long_desc
    assert out.loc[0, "cover_url"] == "https://example.org/existing.jpg"
    assert out.loc[0, "ol_work_key"] == "/works/OL1W"
    assert counts["descriptions_from_open_library"] == 1 and counts["covers_from_open_library"] == 0


def test_enrichment_skips_description_in_another_language(tmp_path):
    from build_catalog import apply_enrichment

    df = _catalog()
    df.loc[0, "language"] = "English"
    path = tmp_path / "enrichment.csv"
    spanish = ">Descolonizar la mente es una referencia ineludible en el debate lingüístico de los estudios poscoloniales."
    pd.DataFrame([{"id": df.loc[0, "id"], "title": "", "author": "", "ol_work_key": "", "description": spanish,
                   "cover_url": "", "checked_at": ""}]).to_csv(path, index=False)
    out, counts = apply_enrichment(df, str(path))
    assert out.loc[0, "description"] == ""
    assert counts["descriptions_skipped_wrong_language"] == 1
