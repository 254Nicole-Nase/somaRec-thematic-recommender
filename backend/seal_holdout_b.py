"""Seal human-authored reader requests without loading any catalog or retrieval code."""

import argparse
from collections import Counter
from datetime import date
import hashlib
import json
import os
from pathlib import Path
import subprocess
import tempfile
from zipfile import ZipFile, ZipInfo

MIX = {"en": 4, "sw": 3, "mixed": 3}
TEXT = {"id", "query", "language", "intent", "kind", "author_id", "created_on"}
KINDS = {"genre", "theme", "literary_interest", "ambiguous", "irrelevant"}


def validate(rows):
    if not isinstance(rows, list) or len(rows) != sum(MIX.values()):
        raise ValueError("Supply ten completed human-authored requests.")
    ids, queries, languages, multiple = set(), set(), Counter(), 0
    for row in rows:
        if not isinstance(row, dict) or set(row) != TEXT | {
            "expected_candidates", "potentially_multiple", "uncertainty_notes"
        }:
            raise ValueError("Unexpected or missing authoring fields.")
        if any(not isinstance(row[k], str) or not row[k].strip() for k in TEXT):
            raise ValueError("Complete all required text fields.")
        key = row["id"].strip()
        wording = " ".join(row["query"].casefold().split())
        if key in ids or wording in queries:
            raise ValueError("Duplicate ID or query wording.")
        ids.add(key)
        queries.add(wording)
        if date.fromisoformat(row["created_on"]).isoformat() != row["created_on"]:
            raise ValueError("Use YYYY-MM-DD for the creation date.")
        if row["kind"] not in KINDS or not isinstance(row["uncertainty_notes"], str):
            raise ValueError("Invalid category or uncertainty notes.")
        candidates = row["expected_candidates"]
        if not isinstance(candidates, list) or any(not isinstance(x, str) or not x.strip() for x in candidates):
            raise ValueError("Expected candidates must be an array of optional book hypotheses.")
        if type(row["potentially_multiple"]) is not bool:
            raise ValueError("Indicate whether several books could satisfy the request.")
        multiple += row["potentially_multiple"]
        languages[row["language"]] += 1
    if languages != MIX or multiple < 2:
        raise ValueError("Require 4 English, 3 Kiswahili, 3 mixed and at least two multi-book requests.")


def seal(source, output, version):
    if version < 1:
        raise ValueError("Version must be positive.")
    raw = source.read_bytes()
    validate(json.loads(raw))
    revision = subprocess.check_output(["git", "rev-parse", "--verify", "HEAD"],
                                       cwd=Path(__file__).resolve().parent, text=True).strip()
    manifest = dict(schema_version=1, holdout="B", version=version, file="queries.json",
                    sha256=hashlib.sha256(raw).hexdigest(), count=10, languages=MIX, git_revision=revision)
    output.mkdir(parents=True, exist_ok=True)
    target = output / f"holdout-b-v{version}.zip"
    # Publish both files together. link() fails atomically if another writer won.
    with tempfile.NamedTemporaryFile(dir=output) as tmp:
        with ZipFile(tmp, "w") as archive:
            archive.writestr(ZipInfo("queries.json"), raw)
            archive.writestr(ZipInfo("manifest.json"), json.dumps(manifest, indent=2) + "\n")
        tmp.flush()
        os.link(tmp.name, target)
    return target


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--version", type=int, required=True)
    args = parser.parse_args()
    try:
        print(seal(args.input, args.output_dir, args.version))
    except (OSError, ValueError) as error:
        parser.exit(2, f"{error}\n")
