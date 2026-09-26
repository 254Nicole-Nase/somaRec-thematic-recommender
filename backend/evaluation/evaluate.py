"""Measure how well SomaRec's search works, and compare it with simpler baselines.

Three steps:

1. known-item   Fully automatic. For a sample of books, search for the book using
                (a) its exact title, (b) the first two title words plus the author's
                surname and (c) a phrase from its description, and
                check where the right book ranks. Reports Hit@1, Hit@10 and MRR.

2. pool         For the realistic queries in queries.csv, collect the top 10 from
                every system into one shuffled sheet (judgments_template.csv).
                Raters (ideally 2-3 teachers/readers) mark each book 0/1/2 without
                knowing which system found it:
                  0 = not relevant, 1 = somewhat relevant, 2 = very relevant

3. score        Read the filled-in sheets and report nDCG@10, Precision@5 and MRR
                per system, plus agreement between raters (Cohen's kappa).

Systems compared:
  tfidf                  classic TF-IDF cosine similarity (baseline)
  keyword                BM25 over title/author/description
  dense:<model>          sentence embeddings only
  hybrid:<model>         BM25 + embeddings (what the app uses)
  original-ivf:<model>   the original setup: embeddings + FAISS IVF (nlist~n/39, nprobe=nlist//2)

Examples:
  python backend/evaluation/evaluate.py known-item
  python backend/evaluation/evaluate.py known-item --models all-MiniLM-L6-v2 \\
        sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2 --original all-MiniLM-L6-v2
  python backend/evaluation/evaluate.py pool --models sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2
  python backend/evaluation/evaluate.py score judgments_rater1.csv judgments_rater2.csv
"""

import argparse
import math
import os
import random
import sys

import numpy as np
import pandas as pd

HERE = os.path.dirname(__file__)
sys.path.insert(0, os.path.join(HERE, ".."))

from somarec.catalog import load_csv  # noqa: E402
from somarec.engine import SearchEngine, _dense_text  # noqa: E402
from somarec.text import fold_key  # noqa: E402

TOP_K = 10


# ------------------------------------------------------------------ systems
def tfidf_system(books):
    from sklearn.feature_extraction.text import TfidfVectorizer

    texts = [_dense_text(r) for _, r in books.iterrows()]
    vectorizer = TfidfVectorizer(preprocessor=fold_key, sublinear_tf=True)
    matrix = vectorizer.fit_transform(texts)

    def run(query):
        sims = (matrix @ vectorizer.transform([query]).T).toarray().ravel()
        order = np.argsort(-sims)[:TOP_K]
        return [int(i) for i in order if sims[i] > 0]

    return run


def engine_system(engine, mode):
    def run(query):
        return [i for i, _, _ in engine.rank(query, mode)][:TOP_K]

    return run


def original_ivf_system(books, encoder):
    """Re-creates the original recommender: plain title/author/description embeddings in an IVF index."""
    import faiss

    texts = [f"{r['title']} by {r['author']}. {r['description']}" for _, r in books.iterrows()]
    vectors = encoder.encode_documents(texts)
    n, d = vectors.shape
    nlist = max(1, min(25, n // 39))
    quantizer = faiss.IndexFlatIP(d)
    index = faiss.IndexIVFFlat(quantizer, d, nlist, faiss.METRIC_INNER_PRODUCT)
    index.train(vectors)
    index.add(vectors)
    index.nprobe = max(1, min(8, nlist // 2))

    def run(query):
        _, idx = index.search(encoder.encode_queries([query]), TOP_K)
        return [int(i) for i in idx[0] if i >= 0]

    return run


def build_systems(books, models, original):
    from somarec.encoders import SentenceEncoder

    systems = {"tfidf": tfidf_system(books), "keyword": engine_system(SearchEngine(books), "keyword")}
    encoders = {}
    for name in models:
        encoders[name] = SentenceEncoder(name)
        engine = SearchEngine(books, encoder=encoders[name], tag_themes=False)
        short = name.split("/")[-1]
        systems[f"dense:{short}"] = engine_system(engine, "dense")
        systems[f"hybrid:{short}"] = engine_system(engine, "hybrid")
    for name in original or []:
        encoder = encoders.get(name) or SentenceEncoder(name)
        systems[f"original-ivf:{name.split('/')[-1]}"] = original_ivf_system(books, encoder)
    return systems


# ------------------------------------------------------------------ known item
def description_snippet(description, rng, words=12):
    tokens = description.split()
    if len(tokens) <= words:
        return description
    start = rng.randint(0, len(tokens) - words)
    return " ".join(tokens[start:start + words])


def known_item(books, systems, sample, seed):
    rng = random.Random(seed)
    candidates = [i for i in range(len(books)) if len(books.iloc[i]["description"]) >= 80]
    picked = rng.sample(candidates, min(sample, len(candidates)))
    variants = {
        "exact title": lambda r: r["title"],
        "partial title + surname": lambda r: " ".join(r["title"].split()[:2] + r["author"].split()[-1:]),
        "description phrase": lambda r: description_snippet(r["description"], rng),
    }
    rows = []
    for variant, make_query in variants.items():
        queries = [(i, make_query(books.iloc[i])) for i in picked]
        for name, run in systems.items():
            ranks = []
            for target, query in queries:
                results = run(query)
                ranks.append(results.index(target) + 1 if target in results else None)
            rows.append({
                "query type": variant,
                "system": name,
                "Hit@1": np.mean([r == 1 for r in ranks]),
                "Hit@10": np.mean([r is not None for r in ranks]),
                "MRR": np.mean([1 / r if r else 0 for r in ranks]),
            })
    return pd.DataFrame(rows), len(picked)


# ------------------------------------------------------------------ pooling
def pool(books, systems, queries, out_path, seed):
    rows = []
    for _, q in queries.iterrows():
        found = {}
        for run in systems.values():
            for i in run(q["query"]):
                found.setdefault(i, True)
        for i in found:
            b = books.iloc[i]
            rows.append({
                "query_id": q["query_id"], "query": q["query"], "book_id": b["id"],
                "title": b["title"], "author": b["author"],
                "description": b["description"][:400], "relevance": "",
            })
    df = pd.DataFrame(rows)
    # Shuffle within each query so raters can't tell which system ranked what.
    order = {qid: n for n, qid in enumerate(queries["query_id"])}
    df["_q"] = df["query_id"].map(order)
    df["_r"] = np.random.default_rng(seed).random(len(df))
    df = df.sort_values(["_q", "_r"]).drop(columns=["_q", "_r"])
    df.to_csv(out_path, index=False)
    return df


# ------------------------------------------------------------------ scoring
def dcg(gains):
    return sum(g / math.log2(i + 2) for i, g in enumerate(gains))


def cohen_kappa(a, b):
    a, b = np.asarray(a), np.asarray(b)
    observed = np.mean(a == b)
    labels = np.union1d(a, b)
    expected = sum(np.mean(a == lab) * np.mean(b == lab) for lab in labels)
    return (observed - expected) / (1 - expected) if expected < 1 else 1.0


def score(books, systems, queries, judgment_files):
    sheets = [pd.read_csv(f, dtype={"relevance": float}) for f in judgment_files]
    merged = pd.concat(sheets).dropna(subset=["relevance"])
    grades = merged.groupby(["query_id", "book_id"])["relevance"].mean().to_dict()

    agreement = None
    if len(sheets) >= 2:
        a, b = sheets[0], sheets[1]
        joined = a.merge(b, on=["query_id", "book_id"], suffixes=("_1", "_2")).dropna(
            subset=["relevance_1", "relevance_2"])
        if len(joined):
            agreement = cohen_kappa(joined["relevance_1"] >= 1, joined["relevance_2"] >= 1)

    ids = books["id"].tolist()
    rows, unjudged = [], 0
    for name, run in systems.items():
        ndcgs, p5s, rrs = [], [], []
        for _, q in queries.iterrows():
            judged = {bid: g for (qid, bid), g in grades.items() if qid == q["query_id"]}
            if not judged:
                continue
            results = [ids[i] for i in run(q["query"])]
            unjudged += sum(r not in judged for r in results)
            gains = [judged.get(r, 0.0) for r in results]
            ideal = dcg(sorted(judged.values(), reverse=True)[:TOP_K])
            ndcgs.append(dcg(gains) / ideal if ideal else 0.0)
            p5s.append(np.mean([g >= 1 for g in (gains + [0] * 5)[:5]]))
            first = next((k for k, g in enumerate(gains) if g >= 1), None)
            rrs.append(1 / (first + 1) if first is not None else 0.0)
        rows.append({"system": name, "queries": len(ndcgs), "nDCG@10": np.mean(ndcgs),
                     "P@5": np.mean(p5s), "MRR": np.mean(rrs)})
    return pd.DataFrame(rows), agreement, unjudged


# ------------------------------------------------------------------ cli
def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("command", choices=["known-item", "pool", "score"])
    parser.add_argument("judgments", nargs="*", help="filled-in judgment CSVs (score only)")
    parser.add_argument("--models", nargs="*", default=[], help="sentence-transformers models to compare")
    parser.add_argument("--original", nargs="*", default=[], help="models to also run in the original IVF setup")
    parser.add_argument("--queries", default=os.path.join(HERE, "queries.csv"))
    parser.add_argument("--sample", type=int, default=100)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--out", default=None, help="write the results table (markdown) here")
    args = parser.parse_args()

    books = load_csv()
    systems = build_systems(books, args.models, args.original)
    queries = pd.read_csv(args.queries)
    fmt = {"floatfmt": ".3f", "index": False}

    if args.command == "known-item":
        table, n = known_item(books, systems, args.sample, args.seed)
        text = f"Known-item search, {n} books (seed {args.seed})\n\n" + table.to_markdown(**fmt)
    elif args.command == "pool":
        out = os.path.join(HERE, "judgments_template.csv")
        df = pool(books, systems, queries, out, args.seed)
        text = f"Wrote {len(df)} (query, book) pairs for {df['query_id'].nunique()} queries to {out}"
    else:
        if not args.judgments:
            parser.error("score needs at least one judgments CSV")
        table, kappa, unjudged = score(books, systems, queries, args.judgments)
        text = table.to_markdown(**fmt)
        if kappa is not None:
            text += f"\n\nRater agreement (Cohen's kappa, relevant vs not): {kappa:.2f}"
        if unjudged:
            text += f"\n\n{unjudged} results were never judged (counted as not relevant); re-run pool if systems changed."
    print(text)
    if args.out:
        with open(args.out, "w") as fh:
            fh.write(text + "\n")


if __name__ == "__main__":
    main()
