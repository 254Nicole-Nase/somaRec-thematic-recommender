"""Generate editorial and discovery review artifacts from local Catalog V2 evidence."""

import argparse
import csv
import json
from pathlib import Path
from time import perf_counter

from catalog_v2 import SAMPLE, load_json, save_json
from somarec.catalog_evaluation import LocalModel, evaluate
from somarec.editorial_review import build_review
from somarec.import_preview import digest

INPUTS = SAMPLE / "editorial"


def write_csv(path, headers, rows):
    with path.open("w", encoding="utf-8", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=headers, lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)


def worksheets(report, output):
    query_by_id = {query["id"]: query for query in report["queries"]}
    hits, lists = [], []
    for run in report["runs"]:
        query = query_by_id[run["query_id"]]
        context = {"query_id": query["id"], "query": query["query"], "language": query["language"],
                   "kind": query["kind"], "system": run["system"]}
        lists.append({
            **context, "results_count": len(run["results"]),
            "distinct_authors": run["distinct_authors"], "distinct_forms": run["distinct_forms"],
        })
        for position, row in enumerate(run["results"], 1):
            hits.append({
                **context, "rank": position, "work_id": row["work_id"], "title": row["title"], "author": row["author"],
                "explanation": row["explanation"],
                "literal_evidence_json": json.dumps(row["literal_evidence_matches"], ensure_ascii=False),
            })
    common = ("query_id", "query", "language", "kind", "system")
    write_csv(output / "relevance_worksheet.csv", common + (
        "rank", "work_id", "title", "author", "explanation", "literal_evidence_json",
        "relevance_0_to_3", "explanation_accuracy", "spoiler_risk", "reviewer", "notes",
    ), hits)
    write_csv(output / "list_worksheet.csv", common + (
        "results_count", "distinct_authors", "distinct_forms", "diversity_1_to_3",
        "adequate_or_overconfident_results", "reviewer", "notes",
    ), lists)


def gate_report(review, report):
    queue, profiles = review["queue"], review["profiles"]
    identity = ("title", "author", "work_identity")
    literary = ("primary_genre", "literary_form", "themes", "major_subjects", "language", "synopsis")
    complete_identity = sum(all(row["fields"][field]["status"] == "verified" for field in identity) for row in queue)
    complete_literary = sum(all(row["fields"][field]["status"] == "verified" for field in literary) for row in profiles)
    approved_editions = sum(any(
        all(edition["fields"][field]["status"] == "verified" for field in ("work_id", "languages", "isbn13"))
        for edition in row["edition_reviews"]
    ) for row in queue)
    conflicting_works = sum(row["status_counts"].get("conflicting", 0) > 0 for row in queue)
    proposed_synopses = sum(row["fields"]["synopsis"]["origin"] == "editorial_proposal" for row in profiles)
    approved_languages = sum(row["fields"]["language"]["status"] == "verified" and
                             "swa" in row["fields"]["language"]["value"] for row in profiles)
    return {
        "version": 1,
        "expansion_ready": False,
        "basis": "Protocol requires independent review, relevance judgments and a workload pilot.",
        "automated": {
            "works": len(queue),
            "edition_candidates": sum(len(row["edition_reviews"]) for row in queue),
            "works_with_conflict": conflicting_works,
            "works_missing_critical_fields": sum(bool(row["missing_critical_fields"]) for row in queue),
            "populated_assertions_have_evidence": True,
            "works_with_draft_synopses_including_conflicts": proposed_synopses,
            "queries": len(report["queries"]),
        },
        "human": {
            "works_with_verified_identity": complete_identity,
            "works_with_verified_language_and_isbn_on_an_edition": approved_editions,
            "works_with_all_required_literary_fields_verified": complete_literary,
            "works_with_verified_kiswahili_edition_language": approved_languages,
            "relevance_judgments": report["human_judgments"],
            "editorial_minutes_measured": None,
        },
        "criteria": [
            {"gate": "identity", "automated": "Zero untriaged cross-work identity or identifier conflicts.",
             "human": "Verify exact title, authorship and work identity for 100% of publishable works."},
            {"gate": "editions", "automated": "Validate checksums and report all competing edition IDs.",
             "human": "Verify at least one edition for 90% of works; independently document editions without an ISBN."},
            {"gate": "literary_metadata", "automated": "Count missing required fields and hold conflicting values.",
             "human": "At least 90% have approved genre, form, themes, subjects, language and a spoiler-safe synopsis."},
            {"gate": "provenance", "automated": "100% of populated assertions carry public evidence references.",
             "human": "Check evidence supports each approved field and document reuse basis."},
            {"gate": "duplicate_detection", "automated": "Report conflicting work keys, ISBNs and all legacy UUID candidates.",
             "human": "Zero unresolved identity conflicts in the proposed release subset; review any legacy map separately."},
            {"gate": "relevance", "automated": "Known-title top-five at least 95%; report weak and empty result sets.",
             "human": "At least two raters on 20 discovery queries; 80% have a relevant top-three result, "
                      "90% of explanations are supported, and zero severe spoilers."},
            {"gate": "multilingual", "automated": "Slice coverage and empty results by query and edition language.",
             "human": "Verify at least five Kiswahili works and use at least six Kiswahili discovery queries; "
                      "target 70% relevant top-three within that slice."},
            {"gate": "editorial_workload", "automated": "Count queue items and record elapsed review minutes per work.",
             "human": "Time a ten-work review pilot; target a median of 20 minutes or less and document escalations."},
        ],
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--proposals", type=Path, default=INPUTS / "proposals.json")
    parser.add_argument("--decisions", type=Path, default=INPUTS / "decisions.json")
    parser.add_argument("--queries", type=Path, default=INPUTS / "queries.json")
    parser.add_argument("--model-dir", type=Path, help="Optional local Sentence Transformers directory")
    parser.add_argument("--e5-prefix", action="store_true")
    parser.add_argument("--dense-cutoff", type=float, default=0.30)
    parser.add_argument("--measure", action="store_true", help="Also record non-reproducible runtime measurements")
    args = parser.parse_args()
    catalog, quality = (load_json(SAMPLE / filename) for filename in ("sample.json", "quality.json"))
    review = build_review(catalog, quality, load_json(args.proposals), load_json(args.decisions))
    started = perf_counter()
    try:
        encoder = LocalModel(args.model_dir, e5_prefix=args.e5_prefix) if args.model_dir else None
    except (ImportError, OSError, ValueError) as error:
        parser.error(f"Local semantic model could not be loaded: {error}")
    load_ms = (perf_counter() - started) * 1000 if encoder else None
    report, runtime = evaluate(review, load_json(args.queries), encoder, dense_cutoff=args.dense_cutoff,
                               model_name=args.model_dir.name if args.model_dir else None)
    report["review_fingerprint"] = digest(review)
    if encoder:
        report["semantic_configuration"]["e5_prefix"] = args.e5_prefix
    out = args.output_dir.resolve()
    if out == SAMPLE.resolve() or (SAMPLE.parents[1] / "backend" / "data").resolve() in {out, *out.parents}:
        parser.error("Choose a separate editorial output directory.")
    out.mkdir(parents=True, exist_ok=True)
    save_json(out / "review_queue.json", {
        key: value for key, value in review.items() if key != "profiles"
    })
    save_json(out / "literary_profiles.json", {"version": review["version"], "profiles": review["profiles"]})
    write_csv(out / "review_queue.csv", (
        "priority", "work_id", "title", "author", "identity_status", "editions", "isbn_conflicts",
        "legacy_candidates", "missing_critical_fields", "questions", "review_minutes",
    ), ({
        "priority": row["priority"], "work_id": row["work_id"], "title": row["title"], "author": row["author"],
        "identity_status": row["fields"]["work_identity"]["status"], "editions": len(row["edition_reviews"]),
        "isbn_conflicts": " | ".join(row["isbn_conflicts"]),
        "legacy_candidates": " | ".join(item["id"] for item in row["legacy_candidates"]),
        "missing_critical_fields": " | ".join(row["missing_critical_fields"]),
        "questions": " | ".join(row["questions"]),
    } for row in review["queue"]))
    save_json(out / "evaluation.json", report)
    save_json(out / "quality_gates.json", gate_report(review, report))
    worksheets(report, out)
    if args.measure:
        import resource
        import sys

        peak = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
        save_json(out / "runtime.json", {
            **runtime, "local_model_load_ms": load_ms, "peak_rss_kib": peak // 1024 if sys.platform == "darwin" else peak,
            "platform": sys.platform,
        })
    summary = gate_report(review, report)
    print(f"Editorial queue: {len(review['queue'])} works · {summary['automated']['works_with_conflict']} with conflicts")
    print(json.dumps(report["diagnostics"], sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
