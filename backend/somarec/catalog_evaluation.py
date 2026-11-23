"""Offline, work-level recommendation diagnostics without human relevance labels."""

from collections import Counter
import os
from pathlib import Path
from statistics import median
from time import perf_counter

import numpy as np

from .bm25 import BM25
from .text import fold_key, tokenize

STOP = set("a an and are about by for i in is of on or the to want with ya wa za na katika".split())
FORM_LABELS = {
    "fiction": "fiction novel riwaya",
    "poetry": "poetry poems mashairi ushairi",
    "children": "children picture book watoto hadithi",
    "memoir": "memoir autobiography kumbukumbu wasifu",
    "nonfiction": "nonfiction non-fiction",
    "drama": "drama play tamthilia",
}
LANGUAGE_CODES = {"eng": "English", "swa": "Kiswahili", "kik": "Gĩkũyũ", "luo": "Dholuo", "fra": "French"}
SYSTEMS = ("A_lexical", "B_semantic", "C_hybrid")


def terms(value):
    return set(tokenize(value)) - STOP


def searchable(review):
    profiles = {row["work_id"]: row["fields"] for row in review["profiles"]}
    documents = []
    for row in sorted(review["queue"], key=lambda row: row["work_id"]):
        fields = {
            **{field: row["fields"][field] for field in ("title", "author")},
            **profiles[row["work_id"]],
        }
        text_fields = {}
        for name, value in fields.items():
            if value["status"] not in {"verified", "needs_review"} or value["value"] is None:
                continue
            content = value["value"]
            if name == "literary_form":
                content = FORM_LABELS.get(content, content)
            if name == "language":
                content = [LANGUAGE_CODES.get(code, code) for code in content]
            text_fields[name] = " ".join(content) if isinstance(content, list) else content
        documents.append({
            "work_id": row["work_id"], "title": row["title"], "author": row["author"],
            "form": profiles[row["work_id"]]["literary_form"]["value"],
            "languages": fields["language"]["value"] if "language" in text_fields else [],
            "fields": fields, "text_fields": text_fields,
        })
    return documents


def validate_queries(queries, documents):
    required = {"id", "query", "kind", "language"}
    kinds = {"known_title", "theme", "genre", "literary_interest", "ambiguous", "irrelevant"}
    ids = {document["work_id"] for document in documents}
    seen = set()
    for query in queries:
        if not required <= query.keys() or query["kind"] not in kinds or not terms(query["query"]):
            raise ValueError("Invalid evaluation query.")
        if query["id"] in seen or query["language"] not in {"en", "sw", "mixed"}:
            raise ValueError("Duplicate query ID or unsupported query language.")
        if query["kind"] == "known_title":
            if query.get("target") not in ids:
                raise ValueError("Known-title controls require a work ID in this sample.")
        elif "target" in query:
            raise ValueError("Only known-title controls may specify an objective target.")
        seen.add(query["id"])


def describe(doc, query, ranking_signals):
    query_terms = terms(query)
    matched = []
    for name, text in doc["text_fields"].items():
        overlap = sorted(query_terms & terms(text))
        if overlap:
            field = doc["fields"][name]
            matched.append({
                "field": name, "matched_tokens": overlap, "status": field["status"],
                "origin": field["origin"], "evidence": field["evidence"],
            })
    return {
        "work_id": doc["work_id"], "title": doc["title"], "author": doc["author"], "form": doc["form"],
        "ranking_signals": ranking_signals, "literal_evidence_matches": matched,
        "explanation": (
            "Matching indexed fields: " + ", ".join(match["field"] for match in matched)
            if matched else "Semantic similarity only. A literary explanation needs human review."
        ),
    }


def normalized(vectors, expected):
    vectors = np.asarray(vectors, dtype="float32")
    if vectors.ndim != 2 or len(vectors) != expected or not np.isfinite(vectors).all():
        raise ValueError("The semantic model returned invalid vectors.")
    norms = np.linalg.norm(vectors, axis=1, keepdims=True)
    return vectors / np.where(norms > 0, norms, 1)


def rank(scores, valid_indices, documents, cutoff, preferred=()):
    return sorted(
        (i for i in valid_indices if scores[i] > cutoff or i in preferred),
        key=lambda i: (i not in preferred, -scores[i], documents[i]["work_id"]),
    )


def evaluate(review, queries, encoder=None, *, dense_cutoff=0.30, model_name=None):
    if not -1 <= dense_cutoff <= 1:
        raise ValueError("Dense cutoff must be a cosine value between -1 and 1.")
    documents = searchable(review)
    validate_queries(queries, documents)
    texts = [" ".join(doc["text_fields"].values()) for doc in documents]
    start = perf_counter()
    index = BM25(texts)
    lexical_index_ms = (perf_counter() - start) * 1000
    timings = {system: [] for system in SYSTEMS}
    vectors, dense_index_ms = None, None
    if encoder is not None:
        start = perf_counter()
        vectors = normalized(encoder.encode_documents(texts), len(texts))
        dense_index_ms = (perf_counter() - start) * 1000
    runs = []
    for query in queries:
        text = query["query"]
        indices = [i for i, doc in enumerate(documents)
                   if not query.get("work_language") or query["work_language"] in doc["languages"]]
        query_start = perf_counter()
        scores = index.scores(" ".join(sorted(terms(text))))
        exact = {i for i in indices if fold_key(documents[i]["text_fields"].get("title")) == fold_key(text)}
        lexical = rank(scores, indices, documents, 0, exact)
        timings[SYSTEMS[0]].append((perf_counter() - query_start) * 1000)
        rankings = {SYSTEMS[0]: lexical}
        if vectors is not None:
            start = perf_counter()
            query_vector = normalized(encoder.encode_queries([text]), 1)[0]
            if query_vector.size != vectors.shape[1]:
                raise ValueError("Document and query vectors use different dimensions.")
            dense = rank(vectors @ query_vector, indices, documents, dense_cutoff)
            timings[SYSTEMS[1]].append((perf_counter() - start) * 1000)
            combined = Counter()
            for result in (lexical, dense):
                for position, item in enumerate(result, 1):
                    combined[item] += 1 / (60 + position)
            rankings[SYSTEMS[1]] = dense
            rankings[SYSTEMS[2]] = sorted(combined, key=lambda i: (i not in exact, -combined[i], documents[i]["work_id"]))
            timings[SYSTEMS[2]].append((perf_counter() - query_start) * 1000)
        for system, result in rankings.items():
            top = result[:5]
            hits = []
            for i in top:
                signals = []
                if (system != SYSTEMS[1]) and i in lexical:
                    signals.append("lexical")
                if (system != SYSTEMS[0]) and i in rankings[SYSTEMS[1]]:
                    signals.append("semantic")
                hits.append(describe(documents[i], text, signals))
            runs.append({
                "query_id": query["id"], "system": system, "results": hits,
                "eligible_works": len(indices), "distinct_authors": len({row["author"] for row in hits}),
                "distinct_forms": len({row["form"] for row in hits if row["form"]}),
            })
    report = {
        "version": 1, "queries": queries, "human_judgments": "not_collected",
        "index_scope": "nonconflicting catalog candidates and editorial proposals",
        "systems": {
            SYSTEMS[0]: "ran", SYSTEMS[1]: "ran" if vectors is not None else "not_run_no_local_model",
            SYSTEMS[2]: "ran" if vectors is not None else "not_run_no_local_model",
        },
        "semantic_configuration": {"model": model_name, "cosine_cutoff": dense_cutoff} if vectors is not None else None,
        "runs": runs,
        "diagnostics": summarize(queries, runs),
    }
    runtime = {
        "lexical_index_ms": round(lexical_index_ms, 3),
        "dense_document_encoding_ms": round(dense_index_ms, 3) if dense_index_ms is not None else None,
        "dense_vector_bytes": vectors.nbytes if vectors is not None else None,
        "median_query_ms": {name: round(median(times), 3) for name, times in timings.items() if times},
    }
    return report, runtime


def summarize(queries, runs):
    by_id = {query["id"]: query for query in queries}
    summaries = {}
    for system in SYSTEMS:
        subset = [run for run in runs if run["system"] == system]
        if not subset:
            continue
        controls = [run for run in subset if by_id[run["query_id"]]["kind"] == "known_title"]
        slices = {}
        for language in sorted({query["language"] for query in queries}):
            rows = [run for run in subset if by_id[run["query_id"]]["language"] == language]
            slices[language] = {"queries": len(rows), "no_results": sum(not run["results"] for run in rows)}
        summaries[system] = {
            "queries": len(subset), "no_results": sum(not run["results"] for run in subset),
            "returned_count": sum(len(run["results"]) for run in subset), "by_language": slices,
            "known_title_controls": len(controls),
            "known_title_at_1": sum(bool(run["results"]) and
                                   run["results"][0]["work_id"] == by_id[run["query_id"]]["target"]
                                   for run in controls),
            "known_title_at_5": sum(any(row["work_id"] == by_id[run["query_id"]]["target"] for row in run["results"])
                                   for run in controls),
            "irrelevant_controls_with_results": sum(
                bool(run["results"]) and by_id[run["query_id"]]["kind"] == "irrelevant" for run in subset
            ),
        }
    return summaries


class LocalModel:
    """Optional CPU-only Sentence Transformers adapter. Models must already exist locally."""

    def __init__(self, directory, *, e5_prefix=False):
        path = Path(directory)
        if not (path.is_dir() and (path / "modules.json").is_file()):
            raise ValueError("Supply a local Sentence Transformers directory with modules.json.")
        os.environ["HF_HUB_OFFLINE"] = "1"
        os.environ["TRANSFORMERS_OFFLINE"] = "1"
        from sentence_transformers import SentenceTransformer

        self.model = SentenceTransformer(
            str(path.resolve()), device="cpu", local_files_only=True, trust_remote_code=False,
        )
        self.e5_prefix = e5_prefix

    def encode_documents(self, texts):
        return self.model.encode([f"passage: {text}" for text in texts] if self.e5_prefix else texts)

    def encode_queries(self, texts):
        return self.model.encode([f"query: {text}" for text in texts] if self.e5_prefix else texts)
