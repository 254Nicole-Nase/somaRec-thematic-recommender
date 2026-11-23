# SomaRec field-level import preview plan

23 November 2026 · For review · `feature/somarec-discovery-rebuild`

## Scope and sequence

**Implemented in Phase 2.** The offline CLI compares a candidate catalog with a saved local baseline and produces field-level JSON and Markdown reports. It handles reviewed metadata, verified UUID continuity, possible duplicates and evidence conflicts. The [operator guide](IMPORT_PREVIEW.md) has the input contract, regression examples and 490-book demonstration. Phase 4 retired the legacy uploader write path and retained snapshot-only preview compatibility.

**Future work.** A remote staging reader, transactionally applying an approved plan, checking reader-level collisions and executing duplicate merges each need their own implementation and review. The current preview can report sanitized aggregate dependency counts from its input snapshot.

[Current uploader](https://github.com/254Nicole-Nase/somaRec-thematic-recommender/blob/5f91be8/backend/upload_books_to_supabase.py#L34) · [Audit](DATA_PIPELINE_AUDIT.md)

## Inputs and preview output

- Accept an explicit candidate catalog and exactly one baseline, either a saved snapshot or a verified staging target. A future remote preview should read only the current book columns and aggregate relationship information needed for decisions. Use a single consistent baseline snapshot, with stable UUID ordering when paginated. Prefer an exported snapshot if the read API cannot guarantee consistency. Never put credentials, user IDs, review bodies or shelf names in the report.
- Preserve three input intentions. An omitted column leaves a value alone. A blank cell means no proposed value unless the input explicitly requests a clear. A clear identifies the book, field and reason in a separate override manifest. Normalize representations for comparison while retaining the display text and a record of provenance. Treat ISBNs as strings and use checksum validation when matching. Keep published editions, translations and expression languages distinct.
- Give each incoming record an action such as `insert`, `update`, `unchanged` or `blocked`. Flag baseline records missing from the input as outside the import. Never infer deletion from their absence. Show existing and proposed UUIDs, old and new values, provenance, applicable protection rule, and whether a field is permitted or blocked. Include counts for inserts, updates, unchanged books, clears, reviewed-field conflicts, ambiguous identities and unsupported fields. Include dependency counts and collision flags for identity cases.
- Emit stable JSON and a Markdown summary. The JSON captures format and policy versions, target identity, source file digest, identity and override manifest digests, baseline fingerprints, and an ordered change set. Put volatile metadata such as run time outside the hashed content. The same inputs and baseline must produce the same plan digest. A plan with unresolved blockers exits nonzero and still emits its report.

## Identity and editorial policy

| Situation | Preview behavior |
| --- | --- |
| Candidate UUID exists and corroborating identifiers agree | Use the existing UUID. Preview catalog changes against it. Flag conflicting identifiers or evidence of a different edition for review. |
| Candidate names an approved source-to-existing UUID mapping | Check that both ends exist where expected, the source and target agree with the reviewed evidence, and the mapping does not conflict with another row or identifier. Preserve the target UUID for corrections to the same catalog entry. |
| UUID is new, and an edition-level identifier or folded title and author match an existing entry | Surface the candidate mapping. A folded name is only a lookup hint. An Open Library work key can be shared by editions and translations. Require review before changing identity or creating a second row where the match is plausible. |
| UUID is new, with no collision and adequate evidence | Preview an insert. Propose explicit draft status and verify how all public readers and RLS handle it before a future apply path creates rows. The database currently defaults new books to published. |
| Multiple candidate rows claim one UUID or identifiers disagree | Block with the conflicting row identifiers and an explanation. No tie-breaking by row order or description length. |
| Reviewed book or individually curated field would change | Preserve the baseline by default. Include descriptions, covers, genre, language and source, themes and source, access links, license and curation status. Preserve explicitly curated fields even when the overall book is unreviewed. Use the current curated markers, reviewed catalog status and explicit curated fields from the baseline snapshot. Carry over verified corrections when preparing that snapshot. |
| A reviewed field is intentionally changed | Require an approved override keyed by UUID and field, with the expected previous value or hash, the proposed value, a reason and source evidence. A blank import value cannot downgrade curation. Validate coupled fields together, including themes and source, language and source, and access type, URL and license. Reject newly introduced `legacy_top3` theme data. |

The catalog UUID of an existing book stays stable for title and author corrections. Record publisher or source identifiers as evidence and keep the same UUID when the reviewed mapping confirms the same catalog entry. Reject a title or author change that unexpectedly collides with another book. Treat a material identity correction as blocked until its effect on people who already saved or reviewed the entry is understood.

## Reading lists, reviews and duplicate works

- A same-book metadata update should preserve every foreign key. The preview reports counts for `reading_lists`, `reviews`, `book_curriculum` and `book_embeddings` when an identity change is proposed. It never writes those tables or deletes a book.
- Flag a duplicate as a separate merge proposal with explicit source and survivor UUIDs. For reading lists, check overlaps per user and named list, including the default shelf with a null list ID. Preserve status and timestamps. If entries disagree, report a conflict for review. Preserve named-list rows and their membership links. Handle older browser-local saves through UUID continuity or a separately reviewed alias strategy.
- Reviews enforce one row per user and book. A reader who reviewed both duplicates creates a collision. Block the proposed merge until there is a policy to preserve both review records or the reader’s chosen survivor. Never silently discard text or change ratings. Check CBC references and any canonical book URLs before retiring the duplicate. Prefer a durable redirect or alias for retired IDs and verify public book lookup behavior in that separate work.
- Keep merges out of ordinary import apply. If later implemented, move approved references and verify counts in one transaction before retiring a source record. Books have cascading foreign keys. Deletion is outside the importer. Recompute embeddings only where title, author or description changed, using the existing text hash to detect affected vectors.

[Reading-list and CBC schema](https://github.com/254Nicole-Nase/somaRec-thematic-recommender/blob/5f91be8/supabase/migrations/20260925000000_base_schema.sql#L154) · [Review constraints](https://github.com/254Nicole-Nase/somaRec-thematic-recommender/blob/5f91be8/supabase/migrations/20260926000000_catalog_reviews_cbc.sql#L30) · [Embedding hashes](https://github.com/254Nicole-Nase/somaRec-thematic-recommender/blob/5f91be8/supabase/functions/somarec-api/index.ts#L92)

## Conditions for a later apply step

A future apply command must take the approved, versioned plan and exact digest. It must not silently build a new plan. Verify the target, input digests, schema, rules version, and the expected values of affected rows. Verify identity candidates again under the same database transaction as writes, using appropriate locking or database uniqueness constraints and retrying serialization failures only after checking for a prior successful receipt. A stale plan fails before any edits and produces a fresh preview for review. Updating only approved fields prevents unrelated data from being replaced.

Use one transaction for an approved import and its receipt, with a unique plan digest per target. A constraint error or interrupted transaction rolls back the entire import. If a response is lost after commit, running the approved plan again returns its existing receipt without rewriting records. Replanning the same input against the resulting baseline produces no mutations. Record the applied plan digest, actor, time and counts. Keep credentials and private baseline values out of logs and shared output.

## Verification and review gates

| Test | Expected result |
| --- | --- |
| Known mismatch fixtures for `Juices`, `Olduvai Gorge` and the two `Dragonfly Sea` entries | Surface suspicious sources and duplicate candidates in the sample preview. This checks how the fixtures are handled. It does not imply automatic detection of all bad blurbs. |
| Reviewed synopsis, empty incoming value, curated themes and license override | Reviewed values survive. A clear or override appears with its reason. Inconsistent access and license combinations are blocked. |
| Same UUID with corrected title, changed UUID for the same work, ambiguous ISBN/work key, translation and two rows claiming one target | Preserve the original UUID for an approved same-book correction, flag uncertain mappings and reject conflicting identities. Preserve distinct editions where supported by evidence. |
| Existing named-list and default-shelf entries, overlapping user reviews, and CBC references | Preview reports dependency and collision counts without disclosing private data or deleting, moving or editing a row. |
| Same input and snapshot across repeated previews, reordered file rows, and partial incoming rows | Identical inputs give identical plan digests. Reordered equivalent rows give the same change set, with raw file digest differences visible. Omitted fields produce no edits. |
| Staging-only apply tests after approval, including concurrent edits, stale plans, mid-run failure, duplicate retry and second preview | Stale plans fail before edits, failures roll back, retry returns the prior receipt, and a second preview has zero mutations. Fixtures verify UUID continuity and unchanged reader records. |

The preview proposes draft inserts and protects reviewed metadata using the snapshot and its per-field annotations. Before implementing apply, review draft visibility, permitted clears, and how to authorize changes. A later merge requires a separate decision for review collisions and old book links.
