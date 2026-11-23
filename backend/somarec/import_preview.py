"""Compare public catalog metadata using local data only."""

import hashlib
import json
import re
from collections import Counter, defaultdict
from urllib.parse import parse_qsl, urlsplit
from uuid import UUID

from .text import fold_key

FIELDS = (
    "title", "author", "published_year", "description", "cover_url", "publisher",
    "isbn10", "isbn13", "ol_work_key", "genre", "language", "language_source",
    "themes", "theme_source", "source", "curation_status", "access_type",
    "access_url", "license", "status",
)
NAME_FIELDS = ("title", "author")
ISBN_FIELDS = ("isbn10", "isbn13")
IDENTIFIERS = ISBN_FIELDS + ("ol_work_key",)
IDENTITY_FIELDS = NAME_FIELDS + IDENTIFIERS
DEPENDENCIES = ("reading_lists", "reviews", "book_curriculum", "book_embeddings")
EDITORIAL_FIELDS = {
    "description", "cover_url", "genre", "language", "language_source", "themes",
    "theme_source", "access_type", "access_url", "license", "curation_status",
}
URL_FIELDS = {"cover_url", "access_url"}
ENRICHMENT_FIELDS = {"description", "cover_url"}
WORK_KEY = re.compile(r"(?:/?works/)?(OL[0-9]+W)", re.I)
VERSION = 1


def json_text(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, indent=2, allow_nan=False) + "\n"


def digest(value):
    return hashlib.sha256(json_text(value).encode()).hexdigest()


def book_uuid(value):
    try:
        return str(UUID(value))
    except (TypeError, ValueError, AttributeError):
        raise ValueError("Book IDs must be UUID strings.") from None


def public_url(value):
    try:
        parts = urlsplit(value)
        return (
            parts.scheme in {"http", "https"} and bool(parts.hostname)
            and parts.username is None and parts.password is None
            and not any(char.isspace() for char in value)
            and not parts.fragment
            and not any(re.search(r"token|secret|password|signature|credential|authorization|api.?key|^key$",
                                  key, re.I) for key, _ in parse_qsl(parts.query))
        )
    except ValueError:
        return False


def normalize(field, value):
    if value is None or isinstance(value, str) and not value.strip():
        return None
    if field == "published_year":
        if type(value) is int or isinstance(value, str) and re.fullmatch(r"[0-9]{1,4}", value.strip()):
            return int(value)
        raise ValueError("published_year must be an integer.")
    if field == "themes":
        if isinstance(value, str):
            value = json.loads(value)
        if isinstance(value, list) and all(isinstance(tag, str) and tag.strip() for tag in value):
            return sorted({tag.strip() for tag in value})
        raise ValueError("themes must be a JSON array of non-empty strings.")
    if not isinstance(value, str):
        raise ValueError(f"{field} must be a string.")
    value = value.strip()
    if field in ISBN_FIELDS:
        return re.sub(r"[\s-]+", "", value).upper()
    if field == "ol_work_key" and (match := WORK_KEY.fullmatch(value)):
        return match[1].upper()
    if field in URL_FIELDS and not public_url(value):
        raise ValueError(f"{field} must be a public HTTP(S) URL without credentials.")
    return value


def catalog_rows(rows):
    if not isinstance(rows, list):
        raise ValueError("A catalog must contain an array of book objects.")
    normalized = []
    for row in rows:
        if not isinstance(row, dict) or "id" not in row:
            raise ValueError("Every catalog row needs an id.")
        if set(row) - {"id", "year", *FIELDS}:
            raise ValueError("Catalog contains unsupported columns. Use public book fields only.")
        if "year" in row and "published_year" in row:
            raise ValueError("Use either year or published_year, never both.")
        normalized.append({
            "id": book_uuid(row["id"]),
            **{
                ("published_year" if key == "year" else key): normalize(
                    "published_year" if key == "year" else key, value
                )
                for key, value in row.items() if key != "id"
            },
        })
    return sorted(normalized, key=lambda row: (row["id"], json_text(row)))


def edition_isbn(value, field):
    if not value:
        return None
    value = re.sub(r"[\s-]+", "", value).upper()
    if field == "isbn10" and re.fullmatch(r"[0-9]{9}[0-9X]", value):
        digits = [10 if char == "X" else int(char) for char in value]
        if sum((10 - i) * digit for i, digit in enumerate(digits)) % 11 == 0:
            prefix = "978" + value[:9]
            return prefix + str(-sum(int(char) * (1 + 2 * (i % 2)) for i, char in enumerate(prefix)) % 10)
    if field == "isbn13" and re.fullmatch(r"97[89][0-9]{10}", value):
        if sum(int(char) * (1 + 2 * (i % 2)) for i, char in enumerate(value)) % 10 == 0:
            return value
    return None


def name_key(title, author):
    return re.sub(r"^the ", "", fold_key(title)), fold_key(author)


def keys(row):
    title, author = name_key(row.get("title"), row.get("author"))
    if title and author:
        yield "title_author", (title, author)
    for field in ISBN_FIELDS:
        isbn = edition_isbn(row.get(field), field)
        if isbn:
            yield "isbn", isbn
    work = row.get("ol_work_key") or ""
    match = WORK_KEY.fullmatch(work)
    if match:
        yield "open_library_work", match[1].upper()


def identity_index(rows):
    index = defaultdict(set)
    for row in rows:
        for key in keys(row):
            index[key].add(row["id"])
    return index


def evidence_entry(entry, fields):
    if not isinstance(entry, dict) or set(entry) != fields | {"url", "reason"}:
        raise ValueError("Invalid review manifest entry fields.")
    if not isinstance(entry["url"], str) or not public_url(entry["url"]):
        raise ValueError("Review evidence must use a public HTTP(S) URL.")
    if not isinstance(entry["reason"], str) or not entry["reason"].strip():
        raise ValueError("Review evidence requires a reason.")


def review_entries(manifest):
    if not isinstance(manifest, dict) or set(manifest) - {"identity", "overrides", "provenance"}:
        raise ValueError("Review manifest must contain only identity, overrides and provenance arrays.")
    result = {}
    for section, fields in (
        ("identity", {"incoming_id", "existing_id", "expected", "proposed"}),
        ("overrides", {"id", "field", "expected", "proposed"}),
        ("provenance", {"id", "field", "proposed", "title", "author"}),
    ):
        index = {}
        entries = manifest.get(section, [])
        if not isinstance(entries, list):
            raise ValueError("Review manifest sections must be arrays.")
        for raw in entries:
            evidence_entry(raw, fields)
            entry = dict(raw)
            if section == "identity":
                key = entry["incoming_id"] = book_uuid(entry["incoming_id"])
                entry["existing_id"] = book_uuid(entry["existing_id"])
                for name in ("expected", "proposed"):
                    values = entry[name]
                    if not isinstance(values, dict) or set(values) != set(IDENTITY_FIELDS):
                        raise ValueError("Identity evidence requires both complete identity tuples.")
                    entry[name] = {field: normalize(field, values[field]) for field in IDENTITY_FIELDS}
            else:
                field = entry["field"]
                allowed = FIELDS if section == "overrides" else tuple(ENRICHMENT_FIELDS)
                if field not in allowed:
                    raise ValueError("Unsupported field in review manifest.")
                key = (book_uuid(entry["id"]), field)
                entry["id"] = key[0]
                entry["proposed"] = normalize(field, entry["proposed"])
                if section == "overrides":
                    entry["expected"] = normalize(field, entry["expected"])
                else:
                    for name in NAME_FIELDS:
                        entry[name] = normalize(name, entry[name])
                        if entry[name] is None:
                            raise ValueError("Provenance requires the source title and author.")
            if key in index:
                raise ValueError("Review manifest contains duplicate entries.")
            index[key] = entry
        result[section] = index
    return result


def identity_values(row):
    return {field: row.get(field) for field in IDENTITY_FIELDS}


def protected_fields(row):
    if row.get("curation_status") == "reviewed":
        return EDITORIAL_FIELDS
    protected = {"curation_status"}
    if row.get("theme_source") == "curated":
        protected.update(("themes", "theme_source"))
    if row.get("language_source") == "curated":
        protected.update(("language", "language_source"))
    return protected


def resolve_row(row, existing, approval, baseline_lookup, candidate_lookup, claims, seen, review, curated_fields):
    incoming_id = row["id"]
    target_id = approval["existing_id"] if approval else incoming_id
    old = existing.get(target_id, {})
    overrides = review["overrides"]
    provenance = review["provenance"]
    protected = protected_fields(old) | set(curated_fields.get(target_id, []))
    blank = sorted(field for field in FIELDS if field in row and row[field] is None)
    omitted = sorted(set(FIELDS) - row.keys())
    proposed = {field: value for field, value in row.items() if field != "id" and value is not None}
    clear_fields = {
        field for field in FIELDS
        if (override := overrides.get((incoming_id, field))) and override["proposed"] is None
    }
    effective = {**old, **proposed}
    collision_reasons = defaultdict(set)
    for key in keys(effective):
        if key in baseline_lookup:
            for other in baseline_lookup[key] - {target_id}:
                collision_reasons[other].add(key[0])
        if key in candidate_lookup:
            for other in candidate_lookup[key] - {incoming_id, target_id}:
                collision_reasons[other].add(key[0])
    matches = [
        {"id": other, "matched_on": sorted(reasons)}
        for other, reasons in sorted(collision_reasons.items())
    ]
    issues = set()
    if seen[incoming_id] > 1 or claims[target_id] > 1:
        issues.add("multiple_rows_claim_uuid")
    if not all(effective.get(field) for field in NAME_FIELDS):
        issues.add("missing_title_or_author")
    if approval and (
        not old or incoming_id in existing and incoming_id != target_id
        or approval["expected"] != identity_values(old)
        or approval["proposed"] != identity_values(effective)
    ):
        issues.add("identity_evidence_conflict")
    changed_identity = {field for field in IDENTITY_FIELDS if field in proposed and proposed[field] != old.get(field)}
    if old and changed_identity and not approval:
        issues.add("identity_review_required")
    if matches and (not old or changed_identity or approval):
        issues.add("ambiguous_identity")
    if "ol_work_key" in changed_identity and not WORK_KEY.fullmatch(proposed["ol_work_key"]):
        issues.add("invalid_open_library_work_key")
    if changed_identity.intersection(ISBN_FIELDS):
        isbns = {field: edition_isbn(effective.get(field), field) for field in ISBN_FIELDS}
        if any(not isbns[field] for field in changed_identity.intersection(ISBN_FIELDS)):
            issues.add("invalid_isbn")
        if all(isbns.values()) and len(set(isbns.values())) > 1:
            issues.add("conflicting_isbns")
    if not old and "status" not in proposed:
        proposed["status"] = "draft"

    changes = {}
    for field in sorted(set(proposed) | clear_fields):
        override = overrides.get((incoming_id, field))
        is_clear = field in clear_fields
        new = proposed.get(field)
        field_issues = set()
        if is_clear:
            if field in proposed or not old or field in {*IDENTITY_FIELDS, "status", "curation_status", "access_type"}:
                field_issues.add("invalid_clear")
            elif override["expected"] != old.get(field):
                field_issues.add("stale_override")
        if old.get(field) == new and not field_issues:
            continue
        approved = bool(override and override["expected"] == old.get(field) and override["proposed"] == new)
        if override and not approved:
            field_issues.add("override_conflict")
        if old and field in protected and not approved:
            field_issues.add("protected_metadata")
        if field == "status" and (old or new != "draft"):
            field_issues.add("publication_out_of_scope")
        if field == "curation_status" and not old and new != "unreviewed":
            field_issues.add("curation_out_of_scope")
        source = provenance.get((incoming_id, field))
        if field in ENRICHMENT_FIELDS and new is not None:
            if not source:
                field_issues.add("missing_provenance")
            elif source["proposed"] != new or (
                fold_key(source["title"]), fold_key(source["author"])
            ) != (fold_key(effective.get("title")), fold_key(effective.get("author"))):
                field_issues.add("provenance_conflict")
            elif matches:
                field_issues.add("ambiguous_source_identity")
        changes[field] = {
            "before": old.get(field), "proposed": new,
            "intent": "clear" if is_clear and field not in proposed else "set",
            "issues": sorted(field_issues),
        }
        if override:
            changes[field]["override_evidence"] = {key: override[key] for key in ("url", "reason")}
        if source:
            changes[field]["source_evidence"] = {
                key: source[key] for key in ("url", "reason", "title", "author")
            }
        issues.update(field_issues)
    after = {**old, **{field: data["proposed"] for field, data in changes.items()}}
    if {"themes", "theme_source"} & changes.keys():
        theme_source = after.get("theme_source")
        if theme_source == "legacy_top3":
            issues.add("legacy_top3_regression")
        elif after.get("themes") and theme_source not in {"curated", "model"}:
            issues.add("themes_without_valid_source")
        elif theme_source == "model" and not after.get("themes"):
            issues.add("model_source_without_themes")
    if {"language", "language_source"} & changes.keys() and bool(after.get("language")) != bool(
        after.get("language_source")
    ):
        issues.add("incomplete_language_metadata")
    if {"access_type", "access_url", "license"} & changes.keys() and (
        after.get("access_type") not in {None, "find", "read"}
        or after.get("access_type") == "read" and not (after.get("access_url") and after.get("license"))
    ):
        issues.add("invalid_access_metadata")
    if issues:
        action = "blocked"
    elif not old:
        action = "insert"
    else:
        action = "update" if changes else "unchanged"
    result = {
        "id": incoming_id, "existing_id": target_id if old else None,
        "title": effective.get("title"), "author": effective.get("author"), "action": action,
        "changes": changes, "issues": sorted(issues), "possible_matches": matches,
        "blank_fields": blank, "omitted_fields": omitted,
    }
    if approval:
        result["identity_evidence"] = {field: approval[field] for field in ("url", "reason")}
    return result


def build_preview(candidate, baseline, review=None, *, dependencies=None, curated_fields=None):
    """Return a deterministic proposal. A blocked row permits none of its edits."""
    candidate, baseline = catalog_rows(candidate), catalog_rows(baseline)
    existing = {row["id"]: row for row in baseline}
    if len(existing) != len(baseline):
        raise ValueError("Baseline snapshot contains duplicate UUIDs.")
    if not isinstance(dependencies, (dict, type(None))):
        raise ValueError("Dependency counts must be an object keyed by baseline UUID.")
    for book_id, counts in (dependencies or {}).items():
        if book_id not in existing or not isinstance(counts, dict) or set(counts) - set(DEPENDENCIES) or any(
            type(count) is not int or count < 0 for count in counts.values()
        ):
            raise ValueError("Invalid dependency counts. Use aggregate nonnegative counts only.")
    if not isinstance(curated_fields, (dict, type(None))):
        raise ValueError("Curated fields must be an object keyed by baseline UUID.")
    for book_id, fields in (curated_fields or {}).items():
        if book_id not in existing or not isinstance(fields, list) or any(
            not isinstance(field, str) or field not in FIELDS for field in fields
        ):
            raise ValueError("Invalid curated fields. Use public book field names only.")
    curated_fields = {book_id: sorted(set(fields)) for book_id, fields in (curated_fields or {}).items()}
    review = review_entries({} if review is None else review)
    identities = review["identity"]
    claims = Counter(identities.get(row["id"], {}).get("existing_id", row["id"]) for row in candidate)
    seen = Counter(row["id"] for row in candidate)
    baseline_lookup = identity_index(baseline)
    candidate_lookup = identity_index([
        {**existing.get(identities.get(row["id"], {}).get("existing_id", row["id"]), {}),
         **{field: value for field, value in row.items() if value is not None}}
        for row in candidate
    ])
    records = []
    for row in candidate:
        record = resolve_row(
            row, existing, identities.get(row["id"]), baseline_lookup, candidate_lookup,
            claims, seen, review, curated_fields,
        )
        if record["possible_matches"] or identities.get(row["id"]) or set(record["changes"]) & set(IDENTITY_FIELDS):
            related = {match["id"] for match in record["possible_matches"]} | {record["existing_id"]}
            record["dependency_counts"] = {
                book_id: (dependencies or {}).get(book_id)
                for book_id in sorted(related & existing.keys())
            }
        records.append(record)
    counts = Counter(record["action"] for record in records)
    plan = {
        "version": VERSION,
        "candidate_fingerprint": digest(candidate),
        "baseline_fingerprint": digest({"books": baseline, "dependencies": dependencies or {}, "curated_fields": curated_fields}),
        "review_fingerprint": digest({section: sorted(entries.values(), key=json_text)
                                     for section, entries in review.items()}),
        "counts": {action: counts[action] for action in ("insert", "update", "unchanged", "blocked")},
        "issues": dict(sorted(Counter(issue for record in records for issue in record["issues"]).items())),
        "baseline_only_ids": sorted(existing.keys() - claims.keys()),
        "records": records,
    }
    return {**plan, "plan_digest": digest(plan)}
