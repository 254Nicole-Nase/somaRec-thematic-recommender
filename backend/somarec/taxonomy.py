"""Validate the local literary vocabulary and index exact, language-scoped names."""

import re
import unicodedata

DIMENSIONS = {"genre", "form", "audience", "theme", "subject", "setting", "mood_tone",
              "language", "original_language"}
ID = re.compile(r"[a-z][a-z0-9]*(?:-[a-z0-9]+)*")
# Register only schemes whose identifier syntax and reuse basis have been reviewed.
WIKIDATA = re.compile(r"https://www\.wikidata\.org/wiki/Q[1-9][0-9]*")


def label_key(value):
    if not isinstance(value, str) or not value.strip():
        raise ValueError("Empty or invalid taxonomy label")
    return " ".join(unicodedata.normalize("NFC", value).casefold().split())


def validate_taxonomy(data):
    if not isinstance(data.get("categories"), list) or not data["categories"]:
        raise ValueError("Taxonomy requires a non-empty category list")
    if not re.fullmatch(r"[0-9]+\.[0-9]+\.[0-9]+", data["version"]):
        raise ValueError("Invalid taxonomy version")
    categories, aliases = {}, {}
    for row in data["categories"]:
        required = {"id", "dimension", "labels", "aliases", "parents", "status", "provenance", "mappings"}
        if not isinstance(row, dict) or not required <= row.keys() <= required | {"replaced_by"}:
            raise ValueError("Invalid category fields")
        if not isinstance(row["labels"], dict) or not isinstance(row["aliases"], dict):
            raise ValueError("Labels and aliases must be keyed by language")
        if not isinstance(row["mappings"], list):
            raise ValueError("Mappings must be an array")
        key, dim = row["id"], row["dimension"]
        if dim not in DIMENSIONS or not ID.fullmatch(key) or key in categories:
            raise ValueError(f"Duplicate or invalid category: {key}")
        categories[key] = row
        if row["status"] not in {"active", "deprecated"} or not row["provenance"].strip():
            raise ValueError(f"Missing provenance or invalid status: {key}")
        if not {"en", "sw"} <= row["labels"].keys() or row["aliases"].keys() - row["labels"].keys():
            raise ValueError(f"Missing language label: {key}")
        for lang, label in row["labels"].items():
            names = row["aliases"].get(lang, [])
            if not isinstance(names, list):
                raise ValueError(f"Invalid alias list: {key}")
            for name in [label, *names]:
                term = (dim, lang, label_key(name))
                if aliases.setdefault(term, key) != key:
                    raise ValueError(f"Alias collision: {term}")
        for mapping in row["mappings"]:
            if (not isinstance(mapping, dict) or set(mapping) != {"scheme", "uri", "relation"} or mapping["scheme"] != "wikidata"
                    or not WIKIDATA.fullmatch(mapping["uri"])
                    or mapping["relation"] not in {"exact", "close", "broader", "narrower"}):
                raise ValueError(f"Invalid external mapping: {key}")
    visited = set()

    def visit(key, path):
        if key in path:
            raise ValueError(f"Category cycle: {key}")
        if key in visited:
            return
        row = categories[key]
        parents = row["parents"]
        if not isinstance(parents, list) or len(set(parents)) != len(parents):
            raise ValueError(f"Invalid parents: {key}")
        replacement = row.get("replaced_by")
        if replacement is not None and (row["status"] != "deprecated" or
                                        categories.get(replacement, {}).get("status") != "active"):
            raise ValueError(f"Invalid deprecation reference: {key}")
        for ref in [*parents, *([replacement] if replacement else [])]:
            if ref not in categories or categories[ref]["dimension"] != row["dimension"]:
                raise ValueError(f"Invalid category reference: {key}/{ref}")
            visit(ref, path | {key})
        visited.add(key)

    for key in categories:
        visit(key, set())
    return categories, aliases
