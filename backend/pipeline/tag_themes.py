"""Re-tag catalog themes with the multilingual model and write them into catalog.csv.

The Flask API tags themes at startup anyway; this script persists the tags so
they can be uploaded to Supabase (and reviewed/corrected there).

Books whose description is too short are left untagged instead of guessed.

Run:  python backend/pipeline/tag_themes.py [--min-score 0.30]
"""

import argparse
import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from somarec.catalog import CATALOG_CSV, load_csv  # noqa: E402
from somarec.encoders import SentenceEncoder  # noqa: E402
from somarec.engine import SearchEngine  # noqa: E402


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--min-score", type=float, default=None, help="similarity threshold (default 0.30)")
    parser.add_argument("--model", default=None, help="sentence-transformers model name")
    args = parser.parse_args()
    if args.min_score is not None:
        os.environ["SOMAREC_THEME_MIN_SCORE"] = str(args.min_score)

    catalog = load_csv()
    engine = SearchEngine(catalog, encoder=SentenceEncoder(args.model))
    out = engine.books.drop(columns=["theme_scores"])
    # Keep hand-curated themes; replace only machine-generated ones.
    curated = catalog["theme_source"] == "curated"
    out.loc[curated, "themes"] = catalog.loc[curated, "themes"]
    out.loc[curated, "theme_source"] = "curated"
    out["themes"] = out["themes"].apply(lambda t: json.dumps(list(t), ensure_ascii=False))
    out.to_csv(CATALOG_CSV, index=False)

    tagged = (out["theme_source"] == "model").sum()
    print(f"Tagged {tagged} of {len(out)} books; {(out['theme_source'] == 'insufficient_text').sum()} lack enough text.")


if __name__ == "__main__":
    main()
