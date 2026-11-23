"""Offline editorial assertions and decision gating for the frozen Catalog V2 sample."""

from collections import Counter
import re

from .import_preview import digest, public_url
from .taxonomy import validate_taxonomy

PROFILE_FIELDS = {
    "primary_genre": "Check an authoritative genre designation or have a literature editor classify the work.",
    "literary_form": "Check the publisher, author bibliography or a library authority for the form.",
    "themes": "Use an authorized reading, reliable literary scholarship or a detailed attributable synopsis.",
    "narrative_setting": "Check a synopsis or literary source that explicitly identifies the setting.",
    "mood_tone": "Use a documented literary assessment or authorized reading, then review in context.",
    "major_subjects": "Check what the work materially covers using a reliable attributable source.",
    "language": "Verify language on the exact edition. Do not infer the original language from an edition.",
    "original_language": "Verify the original language independently of any translation or edition.",
    "synopsis": "Write an original, spoiler-safe introduction from verified facts and have an editor check it.",
}
LIST_FIELDS = {"themes", "narrative_setting", "mood_tone", "major_subjects"}
CRITICAL = ("primary_genre", "themes", "major_subjects", "language", "synopsis")
STATUSES = {"verified", "needs_review", "conflicting", "unknown"}
EDITION_LANGUAGE_FIELD = {"language"}


def urls(values):
    if not isinstance(values, list) or any(not isinstance(url, str) or not public_url(url) for url in values):
        raise ValueError("Evidence must contain only public HTTP(S) URLs.")
    return sorted(set(values))


def assertion(value, evidence=(), *, origin="automated_candidate", status=None, note=None):
    evidence = urls(list(evidence))
    if value is not None and not evidence:
        raise ValueError("A populated field requires evidence.")
    if value is None:
        origin = None
    state = {
        "value": value, "evidence": evidence, "origin": origin,
        "status": status or ("unknown" if value is None else "needs_review"),
        "note": note,
    }
    return {**state, "fingerprint": digest(state)}


def proposals_index(proposals, work_ids):
    if not isinstance(proposals, dict) or set(proposals) - work_ids:
        raise ValueError("Proposals must be keyed by an included work ID.")
    for profile in proposals.values():
        if not isinstance(profile, dict) or set(profile) - (PROFILE_FIELDS.keys() - EDITION_LANGUAGE_FIELD):
            raise ValueError("Proposals may only supplement literary profile fields.")
        for field, entry in profile.items():
            if not isinstance(entry, dict):
                raise ValueError("A proposal must be an object.")
            if set(entry) == {"conflict", "evidence"}:
                if not isinstance(entry["conflict"], str) or not entry["conflict"].strip() or not urls(entry["evidence"]):
                    raise ValueError("A source conflict requires a note and evidence.")
                continue
            if set(entry) not in ({"value", "evidence"}, {"value", "evidence", "replaces"}):
                raise ValueError("A proposal requires a value and evidence.")
            if "replaces" in entry and (
                not isinstance(entry["replaces"], str) or not re.fullmatch(r"[0-9a-f]{64}", entry["replaces"])
            ):
                raise ValueError("A replacement requires the exact inherited assertion fingerprint.")
            value = entry["value"]
            if field in LIST_FIELDS:
                valid = isinstance(value, list) and bool(value) and all(
                    isinstance(term, str) and term.strip() for term in value
                )
            else:
                valid = isinstance(value, str) and bool(value.strip())
            if not valid or not urls(entry["evidence"]):
                raise ValueError(f"Invalid proposal for {field}.")
    return proposals


def decision_index(decisions):
    if not isinstance(decisions, list):
        raise ValueError("Decisions must be an array.")
    indexed = {}
    for entry in decisions:
        required = {"work_id", "field", "fingerprint", "status", "reviewer", "evidence", "note"}
        if not isinstance(entry, dict) or set(entry) != required:
            raise ValueError("A decision must include its work, field, fingerprint, status, reviewer, evidence and note.")
        if any(not isinstance(entry[key], str) or not entry[key].strip() for key in required - {"evidence"}):
            raise ValueError("Decision metadata must be non-empty strings.")
        if entry["status"] not in STATUSES - {"unknown"} or not urls(entry["evidence"]):
            raise ValueError("Invalid editorial decision status or missing evidence.")
        key = (entry["work_id"], entry["field"])
        if key in indexed:
            raise ValueError("Conflicting decisions for the same field.")
        indexed[key] = entry
    return indexed


def decide(work_id, field, candidate, decisions):
    decision = decisions.pop((work_id, field), None)
    if not decision:
        return candidate
    if candidate["fingerprint"] != decision["fingerprint"]:
        raise ValueError(f"Stale decision for {work_id}/{field}.")
    if candidate["status"] == "conflicting" and decision["status"] != "conflicting":
        raise ValueError(f"Resolve the source conflict before changing {work_id}/{field}.")
    if candidate["value"] is None and decision["status"] != "conflicting":
        raise ValueError(f"Provide a value before changing {work_id}/{field}.")
    return {**candidate, "status": decision["status"], "human_decision": decision}


def edition_fields(edition, conflicts):
    fields = {}
    for field in ("title", "work_id", "publish_date", "publishers", "isbn13", "languages"):
        value = edition[field] or None
        source = edition["source_fields"].get(field)
        is_collision = field == "isbn13" and edition["isbn13"] in conflicts
        fields[field] = assertion(
            value, [source] if source else [],
            status="conflicting" if is_collision else None,
            note="Compare the edition records sharing this ISBN." if is_collision else None,
        )
    return fields


def literary_profile(work, editions, proposals):
    profile = {field: assertion(None, note=note) for field, note in PROFILE_FIELDS.items()}
    profile["literary_form"] = assertion(
        work["form"]["value"], [work["form"]["source_url"]], origin="editorial_proposal",
        note=PROFILE_FIELDS["literary_form"],
    )
    language_editions = [edition for edition in editions if edition["languages"]]
    if language_editions:
        profile["language"] = assertion(
            sorted({lang for edition in language_editions for lang in edition["languages"]}),
            [edition["source_fields"]["languages"] for edition in language_editions],
            note="These are edition languages. Confirm them against each manifestation.",
        )
    if work["synopsis"]:
        profile["synopsis"] = assertion(
            work["synopsis"]["text"], [work["synopsis"]["source_url"]], origin="editorial_proposal",
            note="Editorial draft in English. Check accuracy and avoid spoilers before approval.",
        )
    apply_proposals(work["work_id"], profile, proposals)
    return profile


def apply_proposals(work_id, profile, proposals, *, reason=None):
    for field, item in proposals.items():
        if "conflict" in item:
            existing = profile[field]
            if existing["value"] is None:
                raise ValueError(f"No existing value to flag for {work_id}/{field}.")
            profile[field] = assertion(
                existing["value"], existing["evidence"] + item["evidence"], origin=existing["origin"],
                status="conflicting", note=item["conflict"],
            )
            continue
        existing = profile[field]
        if "replaces" in item:
            if existing["value"] is None or item["replaces"] != existing["fingerprint"]:
                raise ValueError(f"Stale literary replacement for {work_id}/{field}.")
        elif existing["value"] is not None:
            raise ValueError(f"Competing literary proposal for {work_id}/{field}.")
        profile[field] = assertion(
            item["value"], item["evidence"], origin="editorial_proposal", note=reason or PROFILE_FIELDS[field],
        )


def controlled_assignments(work_id, entries, categories, decisions):
    groups = {"genres": [], "audiences": []}
    seen = set()
    primary = False
    for entry in sorted(entries, key=lambda item: item["category_id"]):
        category_id = entry["category_id"]
        category = categories.get(category_id)
        if not category or category["status"] != "active" or category_id in seen:
            raise ValueError(f"Unknown, repeated or retired assignment: {category_id}")
        seen.add(category_id)
        dimension = category["dimension"]
        if dimension not in {"genre", "audience"}:
            raise ValueError(f"Unexpected assignment dimension: {dimension}")
        display = entry["display"]
        if dimension == "genre":
            if display not in {"primary", "secondary"} or (display == "primary" and primary):
                raise ValueError(f"Invalid genre display designation for {work_id}")
            primary |= display == "primary"
        elif display is not None:
            raise ValueError("Audience assignment cannot designate a primary genre")
        if set(entry) != {"category_id", "display", "evidence", "reason"} or not entry["reason"].strip():
            raise ValueError("Assignment requires a reason and evidence")
        value = {"category_id": category_id, "display": display}
        claim = assertion(value, urls(entry["evidence"]), origin="editorial_proposal", note=entry["reason"])
        group = "genres" if dimension == "genre" else "audiences"
        groups[group].append(decide(work_id, f"{group}/{category_id}", claim, decisions))
    return groups


def build_review(catalog, quality, proposals, decision_rows, *, taxonomy=None, assignments=None, corrections=None):
    work_ids = {work["work_id"] for work in catalog["works"]}
    proposals = proposals_index(proposals, work_ids)
    categories = validate_taxonomy(taxonomy)[0] if taxonomy is not None else {}
    assignments = assignments or {}
    corrections = corrections or {}
    if (assignments.keys() | corrections.keys()) - work_ids:
        raise ValueError("Unknown work in controlled assignments or corrections")
    decisions = decision_index(decision_rows)
    people = {person["person_id"]: person for person in catalog["people"]}
    editions = {edition["edition_id"]: edition for edition in catalog["editions"]}
    findings = {row["work_id"]: row for row in quality["findings"]}
    comparisons = {row["work_id"]: row for row in quality["work_comparison"]}
    if set(comparisons) != work_ids or {wid for wid, row in findings.items() if row["status"] == "included"} != work_ids:
        raise ValueError("The quality report and catalog disagree about included works.")
    duplicate_isbns = quality["duplicate_edition_candidates"]
    queue, profiles = [], []
    for work in sorted(catalog["works"], key=lambda row: row["work_id"]):
        wid = work["work_id"]
        author = people[work["contributors"][0]["person_id"]]["name"]
        finding = findings[wid]
        work_editions = [editions[eid] for eid in work["edition_ids"]]
        mapping = comparisons[wid]["legacy_candidates"]
        competing = {key: value for key, value in finding.items() if key.endswith("_candidates")}
        work_conflict = any(len(competing[key]) > 1 for key in (
            "open_library_title_author_candidates", "wikidata_title_author_candidates"
        ))
        edition_conflicts = {edition["isbn13"]: duplicate_isbns[edition["isbn13"]] for edition in work_editions
                             if edition["isbn13"] in duplicate_isbns}
        fields = {
            "title": assertion(work["title"], work["source_fields"]["title"]),
            "author": assertion(author, work["source_fields"]["author"]),
            "work_identity": assertion(
                {key: value for key, value in work["identifiers"].items() if value} or None,
                work["source_fields"]["title"], status="conflicting" if work_conflict else None,
                note="Check the work versus edition entity and the competing provider records.",
            ),
            "legacy_mapping": assertion(
                [row["id"] for row in mapping] or None,
                [*work["source_fields"]["title"],
                 "https://github.com/254Nicole-Nase/somaRec-thematic-recommender/blob/9051bbb/backend/data/catalog.csv"]
                if mapping else [], status="conflicting" if len(mapping) > 1 else None,
                note="Compare exact work and edition; retain all existing UUIDs until an explicit mapping review.",
            ),
        }
        profile = literary_profile(work, work_editions, proposals.get(wid, {}))
        for field, correction in corrections.get(wid, {}).items():
            if set(correction) != {"value", "existing", "evidence", "replaces", "reason"}:
                raise ValueError(f"Invalid correction for {wid}/{field}")
            overlay = {key: correction[key] for key in ("value", "evidence", "replaces")}
            proposals_index({wid: {field: overlay}}, work_ids)
            if not correction["reason"].strip() or profile[field]["status"] == "conflicting":
                raise ValueError(f"Unsupported correction or unresolved conflict for {wid}/{field}")
            if correction["existing"] != profile[field]["value"]:
                raise ValueError(f"Stale existing value for {wid}/{field}")
            apply_proposals(wid, profile, {field: overlay}, reason=correction["reason"])
        controlled = controlled_assignments(wid, assignments.get(wid, []), categories, decisions)
        fields = {key: decide(wid, key, value, decisions) for key, value in fields.items()}
        profile = {key: decide(wid, key, value, decisions) for key, value in profile.items()}
        edition_review = [{
            "edition_id": edition["edition_id"],
            "fields": {key: decide(wid, f"edition/{edition['edition_id']}/{key}", value, decisions)
                       for key, value in edition_fields(edition, edition_conflicts).items()},
        } for edition in work_editions]
        assertions = list(fields.values()) + list(profile.values()) + [
            value for edition in edition_review for value in edition["fields"].values()
        ]
        assertions.extend(claim for group in controlled.values() for claim in group)
        missing = [key for key in CRITICAL if profile[key]["status"] == "unknown"]
        conflicts = sum(row["status"] == "conflicting" for row in assertions)
        questions = [f"{key}: {profile[key]['note']}" for key in PROFILE_FIELDS if profile[key]["status"] != "verified"]
        questions.extend(f"Source finding: {issue}." for issue in finding["issues"])
        if not work_editions:
            questions.append("Find edition records with a confirmed work link, ISBN and language where available.")
        if fields["legacy_mapping"]["status"] != "verified":
            questions.append(fields["legacy_mapping"]["note"])
        if edition_conflicts:
            questions.append("Check each ISBN collision against publisher or national-library edition evidence.")
        queue.append({
            "work_id": wid, "title": work["title"], "author": author,
            "priority": 1 if conflicts else 2 if missing else 3,
            "fields": fields, "edition_reviews": edition_review,
            "source_candidates": competing, "rejected_editions": finding["rejected_editions"],
            "isbn_conflicts": edition_conflicts, "legacy_candidates": mapping,
            "missing_critical_fields": missing, "questions": questions,
            "status_counts": dict(Counter(row["status"] for row in assertions)),
        })
        item = {"work_id": wid, "fields": profile}
        if taxonomy is not None:
            item.update(taxonomy_version=taxonomy["version"], **controlled)
            queue[-1]["classification_review"] = {
                group: [f"{group}/{claim['value']['category_id']}" for claim in claims]
                for group, claims in controlled.items()
            }
        profiles.append(item)
    if decisions:
        raise ValueError("Decisions refer to unknown works or fields.")
    queue.sort(key=lambda row: (row["priority"], -len(row["missing_critical_fields"]), row["work_id"]))
    return {
        "version": 1, "catalog_fingerprint": digest(catalog), "quality_fingerprint": digest(quality),
        "queue": queue, "profiles": profiles,
        "quarantined_outside_scope": [row["work_id"] for row in quality["findings"] if row["status"] == "quarantined"],
    }
