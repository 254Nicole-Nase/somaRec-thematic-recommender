"""Evaluate the fixed three form smoke checks from a completed seven-ballot worksheet."""

import argparse
import csv
import json
from pathlib import Path

from catalog_v2 import SAMPLE, load_json
from prepare_form_pilot import EDITORIAL, READINESS, prepare
from somarec.catalog_evaluation import evaluate
from somarec.editorial_review import build_review

ACTIONS = {"approve": "verified", "reject": "conflicting", "request_more_evidence": "needs_review"}


def run(worksheet):
    materials = prepare()
    packet = {r["work_id"]: r for r in materials["review_packet.json"]}
    if materials["review_packet.json"] != load_json(READINESS / "review_packet.json"):
        raise ValueError("Frozen ballot packet differs from the current assertions.")
    decisions, seen = [], set()
    with worksheet.open(encoding="utf-8-sig", newline="") as stream:
        reader = csv.DictReader(stream)
        columns = {"work_id", "title", "field", "proposed_form", "fingerprint", "source_urls",
                   "decision", "reviewer", "notes", "checked_urls"}
        if not reader.fieldnames or set(reader.fieldnames) != columns or len(reader.fieldnames) != len(columns):
            raise ValueError("Expected the ten worksheet columns.")
        for row in reader:
            if None in row or any(value is None for value in row.values()):
                raise ValueError("Malformed worksheet row.")
            wid = row["work_id"]
            if wid not in packet or wid in seen:
                raise ValueError("Unknown or duplicate ballot.")
            seen.add(wid)
            ballot = packet[wid]
            claim = ballot["ballot_assertion"]
            if (row["title"], row["field"], row["proposed_form"], row["fingerprint"], row["source_urls"]) != (
                ballot["title"], ballot["field"], claim["value"], claim["fingerprint"],
                " ".join(claim["evidence"] + ballot["additional_evidence"])
            ):
                raise ValueError(f"Ballot identity or evidence changed for {wid}.")
            if not row["decision"] and not any(row[k] for k in ("reviewer", "notes", "checked_urls")):
                continue
            if row["decision"] not in ACTIONS:
                raise ValueError(f"Invalid or unfinished decision for {wid}.")
            decisions.append(dict(work_id=wid, field=row["field"], fingerprint=row["fingerprint"],
                                  status=ACTIONS[row["decision"]], reviewer=row["reviewer"],
                                  note=row["notes"], evidence=row["checked_urls"].split()))
    if seen != packet.keys() or not decisions:
        raise ValueError("Provide the complete worksheet with at least one reviewer decision.")

    taxonomy = load_json(READINESS / "taxonomy.v1.1.json")
    review = build_review(load_json(SAMPLE / "sample.json"), load_json(SAMPLE / "quality.json"),
                          load_json(EDITORIAL / "proposals.json"), decisions, taxonomy=taxonomy,
                          assignments=load_json(EDITORIAL / "assignments.json"),
                          corrections=materials["pilot_corrections.json"])
    forms = {p["work_id"]: p["fields"]["literary_form"] for p in review["profiles"]}
    for wid, ballot in packet.items():
        if forms[wid]["fingerprint"] != ballot["ballot_assertion"]["fingerprint"]:
            raise ValueError(f"Taxonomy revision invalidated the ballot for {wid}.")
    report, _ = evaluate(review, load_json(READINESS / "pilot_smoke.json"), mode="approved_only", taxonomy=taxonomy)
    unsupported = []
    for result in report["runs"]:
        for hit in result["results"]:
            form = forms[hit["work_id"]]
            matches = hit["literal_evidence_matches"]
            if (form["status"] != "verified" or not matches or any(
                (m["field"], m["status"], m["fingerprint"], m["evidence"]) !=
                ("literary_form", "verified", form["fingerprint"], form["evidence"]) for m in matches
            )):
                unsupported.append([result["query_id"], hit["work_id"]])
    return {"accepted": [w for w in packet if forms[w]["status"] == "verified"],
            "rejected": [w for w in packet if forms[w]["status"] == "conflicting"],
            "pending": [w for w in packet if forms[w]["status"] == "needs_review"],
            "decisions": decisions, "approved_only": report, "unsupported_explanations": unsupported,
            "missing_approvals": "This form-only pilot supplies no title, author, edition-language, theme or synopsis approvals."}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("worksheet", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    try:
        report = run(args.worksheet)
        with args.output.open("x", encoding="utf-8") as stream:
            stream.write(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    except (OSError, ValueError, KeyError) as error:
        parser.exit(2, f"{error}\n")
