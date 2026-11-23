"""Write a local, read-only import preview for a candidate catalog and saved baseline."""

import argparse
import csv
import hashlib
import html
import io
import json
from pathlib import Path
from tempfile import NamedTemporaryFile

from somarec.import_preview import FIELDS, build_preview, digest, json_text


def unique_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("JSON input contains duplicate keys.")
        result[key] = value
    return result


def read_input(path):
    raw = path.read_bytes()
    checksum = hashlib.sha256(raw).hexdigest()
    content = raw.decode("utf-8-sig")
    if path.suffix.lower() == ".json":
        return json.loads(content, object_pairs_hook=unique_object), checksum
    if path.suffix.lower() != ".csv":
        raise ValueError("Inputs must be CSV or JSON files.")
    rows = csv.DictReader(io.StringIO(content, newline=""), strict=True)
    fields = rows.fieldnames
    if not fields or "id" not in fields or len(fields) != len(set(fields)):
        raise ValueError("CSV needs an id column and unique column names.")
    if set(fields) - {"id", "year", *FIELDS}:
        raise ValueError("Catalog contains unsupported columns. Use public book fields only.")
    result = []
    for row in rows:
        if None in row:
            raise ValueError("CSV row has extra cells.")
        result.append({key: value for key, value in row.items() if value is not None})
    return result, checksum


def cell(value):
    text = html.escape(json.dumps(value, ensure_ascii=False, sort_keys=True))
    return text.translate({ord(char): f"&#{ord(char)};" for char in "|`[]()*_~!"})


def write_report(path, content):
    # Replace the output instead of truncating any existing link to an input.
    with NamedTemporaryFile(dir=path.parent, mode="w", encoding="utf-8", newline="\n", delete=False) as handle:
        temporary = Path(handle.name)
        try:
            handle.write(content)
            handle.close()
            temporary.replace(path)
        finally:
            temporary.unlink(missing_ok=True)


def markdown(plan):
    lines = [
        "# Catalog import preview",
        "",
        f"Plan digest: `{plan['plan_digest']}`",
        "",
        "| Inserts | Updates | Unchanged | Blocked |",
        "| ---: | ---: | ---: | ---: |",
        "| " + " | ".join(str(number) for number in (plan["counts"][action] for action in ("insert", "update", "unchanged", "blocked"))) + " |",
        "",
        f"Baseline-only records: {len(plan['baseline_only_ids'])}. They stay outside this proposal.",
        "",
        "A blocked record permits none of its proposed changes. JSON lists every record.",
        "",
    ]
    if plan["issues"]:
        lines.extend(["## Blocking issues", ""])
        lines.extend(f"- `{issue}`: {count}" for issue, count in plan["issues"].items())
        lines.append("")
    for record in plan["records"]:
        if record["action"] == "unchanged" and not record["possible_matches"] and "identity_evidence" not in record:
            continue
        lines.extend([
            f"## {record['action'].capitalize()} · {cell(record['title'])} by {cell(record['author'])}",
            "",
            f"- Incoming UUID: `{record['id']}`",
            f"- Existing UUID: `{record['existing_id'] or 'none'}`",
        ])
        if record["issues"]:
            lines.append("- Blocking issues: " + ", ".join(f"`{issue}`" for issue in record["issues"]))
        for match in record["possible_matches"]:
            lines.append(f"- Possible match: `{match['id']}` ({', '.join(match['matched_on'])})")
        for book_id, counts in record.get("dependency_counts", {}).items():
            lines.append(f"- Dependencies for `{book_id}`: " + (cell(counts) if counts is not None else "unknown"))
        if "identity_evidence" in record:
            lines.append(f"- Identity evidence: {cell(record['identity_evidence'])}")
        if record["changes"]:
            lines.extend([
                "",
                "| Field | Before | Proposed | Intent | Field issues |",
                "| --- | --- | --- | --- | --- |",
            ])
            for field, change in record["changes"].items():
                lines.append(
                    f"| `{field}` | {cell(change['before'])} | {cell(change['proposed'])} | "
                    f"{change['intent']} | {', '.join(change['issues']) or '—'} |"
                )
            lines.append("")
            for field, change in record["changes"].items():
                for kind in ("override_evidence", "source_evidence"):
                    if kind in change:
                        lines.append(f"- `{field}` {kind.replace('_', ' ')}: {cell(change[kind])}")
        lines.append("")
    return "\n".join(lines).rstrip() + "\n"


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--candidate", required=True, type=Path, help="Local public catalog CSV or JSON array")
    parser.add_argument("--baseline", required=True, type=Path, help="Local baseline CSV or JSON snapshot")
    parser.add_argument("--review", type=Path, help="Local JSON review manifest")
    parser.add_argument("--output-dir", required=True, type=Path)
    args = parser.parse_args(argv)
    try:
        baseline, baseline_sha = read_input(args.baseline)
        dependencies = curated_fields = None
        if isinstance(baseline, dict):
            if "books" not in baseline or set(baseline) - {"books", "dependencies", "curated_fields"}:
                raise ValueError("Baseline snapshot supports only books, aggregate dependencies and curated fields.")
            dependencies = baseline.get("dependencies")
            curated_fields = baseline.get("curated_fields")
            baseline = baseline["books"]
        candidate, candidate_sha = read_input(args.candidate)
        review, review_sha = read_input(args.review) if args.review else ({}, None)
        if not isinstance(review, dict):
            raise ValueError("Review input must be a JSON object.")
        plan = build_preview(
            candidate, baseline, review, dependencies=dependencies, curated_fields=curated_fields,
        )
        plan["input_sha256"] = {"candidate": candidate_sha, "baseline": baseline_sha, "review": review_sha}
        del plan["plan_digest"]
        plan["plan_digest"] = digest(plan)
        json_path = args.output_dir / "preview.json"
        markdown_path = args.output_dir / "preview.md"
        inputs = [path.resolve() for path in (args.candidate, args.baseline, args.review) if path]
        if any(path.resolve() in inputs for path in (json_path, markdown_path)):
            raise ValueError("Report paths must differ from input paths.")
        args.output_dir.mkdir(parents=True, exist_ok=True)
        write_report(json_path, json_text(plan))
        write_report(markdown_path, markdown(plan))
    except (ValueError, OSError, csv.Error) as error:
        parser.exit(2, f"Preview failed: {error}\n")
    print("Catalog preview · " + " · ".join(f"{count} {action}" for action, count in plan["counts"].items()))
    return int(plan["counts"]["blocked"] > 0)


if __name__ == "__main__":
    raise SystemExit(main())
