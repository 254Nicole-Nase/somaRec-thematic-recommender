# Run the SomaRec catalog import preview

The preview compares public catalog data in two local files. It has no database client, credentials, or apply command. It does not fetch source URLs. Reviewers supply evidence they have checked.

## Run it locally

From the repository root, with Python 3.11 or later:

```sh
python -m pip install Unidecode
python backend/preview_catalog_import.py \
  --candidate backend/data/catalog.csv \
  --baseline backend/data/catalog.csv \
  --output-dir /tmp/somarec-preview
```

This control compares the committed catalog with itself. For an actual review, replace `--baseline` with an authorized, sanitized local snapshot. Optionally pass `--review path/to/review.json`. Use a new output directory per review to keep the reports together. Exit codes are **0** for a report without blockers, **1** for a report with blocked rows, and **2** for invalid inputs or a file error.

## Input contract

- The candidate is a UTF-8 CSV or JSON array of public book objects with UUIDs. The baseline can use the same format or a JSON object with `books` and optional `curated_fields` and `dependencies`. Only public catalog columns are accepted. `year` is an alias for `published_year`. CSV theme cells hold JSON arrays.
- Key `curated_fields` by existing book UUID and list verified field names, for example `["cover_url", "description"]`. Include editorial decisions from [corrections.csv](../backend/data/corrections.csv) when preparing this snapshot. Resolve each correction to a verified existing UUID before transcribing the field name. Catalog-wide review status and the curated theme and language markers are also respected.
- Key `dependencies` by existing UUID and provide aggregate nonnegative counts for any of `reading_lists`, `reviews`, `book_curriculum`, and `book_embeddings`. An absent count means unknown. Use a snapshot without user IDs, shelf names, reviews or credentials. Metadata, URLs and reviewer reasons must be suitable for sharing.
- Omitted columns, blank cells and JSON null values express no proposed edit. An empty array is an explicit value for themes and is checked against the theme source and any review protection. To clear a field to null, use an override with a null `proposed` value. Identity, status, curation status and access type are ineligible for clears. Inserts propose `draft` status. This tool does not implement draft visibility rules.

### Review manifest

The optional JSON object accepts the arrays below. Each item needs a public evidence URL and a reason. Publishable URLs and reasons are shown in the reports.

| Section | Entry fields | Review behavior |
| --- | --- | --- |
| `provenance` | `id`, `field`, `proposed`, `title`, `author`, `url`, `reason` | Use the incoming UUID and the exact proposed description or cover value. Record the source record’s title and author. A different source identity, stale value, or unresolved competing catalog identity blocks the proposal. |
| `overrides` | `id`, `field`, `expected`, `proposed`, `url`, `reason` | Use the incoming UUID. Bind the override to the baseline value and the exact proposed value. A reviewed description or cover replacement also needs a provenance entry. A clear can omit its field in the candidate. |
| `identity` | `incoming_id`, `existing_id`, `expected`, `proposed`, `url`, `reason` | Both identity objects must contain `title`, `author`, `isbn10`, `isbn13`, and `ol_work_key`, using null for missing fields. Bind them to the existing and effective proposed identity, respectively. Use the same UUID in both ID fields for an in-place correction. |

An example override shape for an explicitly approved clear, using fixture data:

```json
{
  "overrides": [
    {
      "id": "10000000-0000-0000-0000-000000000001",
      "field": "description",
      "expected": "Fixture value already stored in the baseline",
      "proposed": null,
      "url": "https://example.org/catalog",
      "reason": "Fixture for removing a description assigned to a different work"
    }
  ]
}
```

## Read the reports

- **`preview.json`** includes every incoming record, its action, its incoming and existing UUIDs, blank and omitted inputs, and each proposed field’s before value, proposed value, intent and issues. It includes candidate matches and available aggregate dependency counts. It also records the version, canonical input fingerprints, raw input SHA-256 values and a plan digest. Identical files produce byte-identical output. Reordering rows may change the raw file and plan digests while preserving the normalized change set.
- **`preview.md`** shows action counts, blockers and readable changes for review. It includes unchanged records with possible duplicate matches. Baseline-only IDs remain outside the proposal.
- **Review the blocked rows first.** A blocked record permits none of its edits. Inspect the actual cited source for a synopsis or cover, and resolve competing UUIDs with an editor. Review even actions without blockers before accepting them. Matching a valid ISBN, work key or normalized title and author flags a candidate. It does not prove a match. Existing duplicates can be reported as possible matches on unchanged rows. A work key can span editions and translations.
- A repeat run will not discover a previously stored mismatch in an unchanged field. The code checks supplied evidence for conflicts and is unable to verify a reviewer’s claims, infer an accurate synopsis, or authenticate an approval. Aggregate dependency counts do not reveal overlapping readers' reviews or shelves. Those collision checks, database locking and atomic apply belong to later work.

## Sample from the 490-book repository catalog

The control returned **0 inserts, 0 updates, 490 unchanged, 0 blocked**. The examples below came from a scratch baseline built from the same catalog. It held back two titles, the publication year of *Dust*, and the suspect enrichment fields for *Juices* and *Olduvai Gorge*. The candidate remained the checked-in 490-book file. Source evidence for the two mismatches came from the audit. The scratch baseline is a demonstration, independent of any database.

| Inserts | Updates | Unchanged | Blocked |
| ---: | ---: | ---: | ---: |
| 1 | 1 | 485 | 3 |

| Book | Action | Excerpt from field or identity review |
| --- | --- | --- |
| *Dua ya Maarusi* | Insert | `status` goes from absent to `draft`. |
| *Dust* | Update | `published_year` goes from absent to `2013`. |
| *Juices* | Blocked | A description previously absent would come from *The Columbia Guide to East African Literature in English Since 1945*. |
| *Olduvai Gorge* | Blocked | Proposed synopsis and cover provenance point to *Wiley-Blackwell Encyclopedia of Human Evolution*. |
| *Dragonfly Sea* | Blocked | Normalized title and author match *The Dragonfly Sea*. The report also flags missing synopsis and cover evidence for the proposed new UUID. |

To reproduce the theme regression check, run the existing builder into a scratch file and compare it with the committed catalog:

```sh
python backend/pipeline/build_catalog.py --output /tmp/somarec-legacy-catalog.csv
python backend/preview_catalog_import.py \
  --candidate /tmp/somarec-legacy-catalog.csv \
  --baseline backend/data/catalog.csv \
  --output-dir /tmp/somarec-legacy-preview
```

The existing builder introduces `legacy_top3` into all 490 rows in this check. The preview blocked all 490. The builder needs the existing Python pipeline dependencies.

## Legacy importer review

The legacy [uploader](../backend/upload_books_to_supabase.py) remains separate. Its count-only mode reads a live target using a service-role credential. Its `--apply` mode matches normalized title and author, then performs full upserts in independent batches. This can clear reviewed values, publish inserts by default, create a second UUID after identity corrections, and leave a partial import after an error. The executable invocations found in the repository were documentation examples in the README, the uploader's usage text and the product roadmap. Neither GitHub Actions workflow calls it.

A later change should remove the remaining write example in the uploader and make legacy `--apply` exit with an explanation before credentials are loaded. Use staging to test a separately reviewed apply command that consumes an approved digest, rechecks identity and stale values in a transaction, and writes a receipt atomically. Review duplicate handling separately to protect reader records. See the [implementation plan](IMPORT_PREVIEW_PLAN.md).
