# Catalog V2 editorial review and discovery evaluation

Phase 4 runs offline against the existing 30 works and 97 edition candidates. It leaves the frozen catalog and its source evidence unchanged. The two works previously quarantined remain outside the sample.

## Reproduce the review

From the repository root, use Python 3.11 or later with `numpy` and `Unidecode`.

```sh
python backend/review_catalog_v2.py --output-dir /tmp/somarec-editorial --measure
diff -r -x runtime.json experiments/catalog_v2/editorial/generated /tmp/somarec-editorial
python -m pytest backend/tests/test_editorial_review.py backend/tests/test_legacy_uploader.py -q
```

The [editorial artifacts](../experiments/catalog_v2/editorial) include the input proposals and query set, [profile schema](../experiments/catalog_v2/editorial/profile.schema.json), and generated outputs. `review_queue.csv` is the working list. Its JSON companion includes field evidence, editions and ISBN groups, competing provider IDs, legacy UUID candidates, and question-by-question detail. `literary_profiles.json` carries the structured claims. The runtime file is optional and varies by machine.

The generated reports reproduced byte for byte, excluding timings. The profile artifact passed validation against the JSON Schema. Example lexical measurements were 1.7 ms to build the index, 0.33 ms median query time and about 30 MiB peak process memory including Python and NumPy. These are single-process measurements on 30 works. They exclude model loading, model inference and human work.

## Field and source review

| Status | How it is assigned |
| --- | --- |
| `unknown` | No supported value. The question names the evidence needed. |
| `needs_review` | An automated candidate or an evidence-backed editorial proposal is available. |
| `conflicting` | Source candidates or claims disagree, or a reviewer recorded a specific conflict. The claim is held out of the retrieval index. |
| `verified` | An explicit decision supplied by a reviewer agrees with the exact assertion and cites supporting evidence. The status does not follow from an ISBN checksum, provider match, or the number of links. |

Each assertion records its value, status, origin, references, note and evidence fingerprint. The work fields, supported literary terms, and publication fields are separate. Language on an edition is distinct from the original language of the work. The profile distinguishes genre, form, themes, subject matter, setting, mood and a synopsis. An editorial proposal sets a field only where a source supports it. Neither the prototype's existing genre candidates nor a title alone provide evidence for themes. Automated identities remain pending even when multiple sources agreed.

Review priority 1 covers conflicts, including competing works, ISBN groups and legacy UUIDs. Priority 2 covers missing recommendation-critical fields. Within each level, the queue gives works missing more critical fields higher priority. For each work, check the actual edition, match the contributor's role, review the cited literary evidence, and record unresolved items and review minutes. Edition and UUID candidates stay separate. A decision flag never changes an ID or merges records.

For a field decision, copy the exact fingerprint from the generated assertion and add an entry to a local copy of [decisions.json](../experiments/catalog_v2/editorial/decisions.json). Use `edition/<edition_id>/<field>` for an edition field. The default decision list is empty. For example, the following illustrates the structure with placeholders:

```json
[
  {
    "work_id": "dust",
    "field": "themes",
    "fingerprint": "<exact assertion fingerprint>",
    "status": "verified",
    "reviewer": "<reviewer handle>",
    "evidence": ["https://example.org/replace-with-reviewed-source"],
    "note": "<how the source supports the proposed values>"
  }
]
```

Rebuild with `--decisions /path/to/reviewed-decisions.json`. A stale fingerprint, duplicate decision, or decision that refers to a missing work or field fails the build. Changing a status alone cannot promote a conflicting or absent value into the index. To propose a replacement for an inherited literary assertion, rebuild without its proposal overlay to obtain the inherited fingerprint, then supply a new value, evidence and that fingerprint as `replaces` in the local proposal file. The replacement still needs a fresh human decision. Work, edition and legacy-ID conflicts require a separate identity review. The tool binds decisions to evidence and values. Authenticating reviewers and determining whether evidence is sufficient remain human responsibilities.

### Findings from this sample

- **Bibliographic facts observed:** The frozen sample has 30 works and 97 edition candidates. Title, author and edition evidence is available for review in the queue, with 13 works flagged for conflicts and 23 missing at least one recommendation-critical field.
- **Automated candidates:** Both existing UUID candidates are still listed for *The Dragonfly Sea*. The queue retains all edition IDs involved in ISBN groups, even where an ISBN is checksum-valid.
- **Editorial proposals:** Eight works have draft enrichment, including spoiler-safe original synopsis drafts for *Petals of Blood*, *The House of Rust* and *One Day I Will Write About This Place*. The latter uses Granta as its literary evidence because the previously cited Graywolf URL returned 404 during direct checking. *Juices* retains an unknown synopsis. No legacy synopsis or book text was used to fill the gap.
- **Unresolved source conflict:** African Books Collective's page for *The River and the Source* gives different generation counts in its description and author section. The inherited draft is retained as a conflicting assertion and excluded from evaluation. The other proposal fields avoid a generation count. [Distributor listing](https://africanbookscollective.com/books/the-river-and-the-source/)
- **Human decisions:** Zero approvals were supplied. Editorial metadata remains draft. No labels were assigned for recommendation relevance, explanation support, diversity or spoiler risk.

## Evaluate discovery

- **A, lexical:** BM25 over nonconflicting indexed fields. It preserves exact title priority, folds accents, and uses a small English/Kiswahili stop list and bilingual form labels. Zero-token overlap yields no result. A literal overlap on a broad term can still yield a weak result.
- **B, semantic:** Optional local Sentence Transformers metadata encoding with normalized cosine ranking. Only a pre-downloaded local model directory is accepted. The adapter forces offline mode and disables execution of model-provided remote code. Use a preapproved model and record its revision and model card with the run. The proposed cosine cutoff of 0.30 is an uncalibrated experiment setting.
- **C, hybrid:** Reciprocal rank fusion with equal lexical and dense contributions and exact-title priority. B and C require the same model and cutoff. No compatible local model or Sentence Transformers installation was present for the recorded experiment. Both paths ran in regression tests with deterministic toy vectors, which establish control flow only.

For a future authorized local model experiment:

```sh
python backend/review_catalog_v2.py \
  --output-dir /tmp/somarec-editorial-with-model \
  --model-dir /path/to/pinned-local-sentence-transformer \
  --dense-cutoff 0.30 --measure
```

Add `--e5-prefix` for E5's query and passage conventions. Measure model loading, document encoding and query latency on the same machine. Hybrid timing covers lexical lookup, query encoding and fusion. The repository stores model-free outputs so comparisons do not depend on a download.

The index includes nonconflicting candidates and proposals for diagnostic use. Evidence matches in the report name the actual indexed fields and retain status and source links. Lexical overlap does not establish subject relevance. A dense hit alone generates a similarity notice, so it cannot supply a verified literary explanation.

Across 24 queries, lexical retrieval returned 54 ranked entries. It found all six known-title targets at rank one and returned nothing for both irrelevant controls. For example, “hadithi za watoto” with a Kiswahili edition filter returned *Jua na Upepo* only. “mashairi ya Kiswahili” also returned a novel and a children's work because language matches contribute to ranking. These outputs diagnose gaps. No cross-system or relevance conclusion follows from this run. [Ranked results](../experiments/catalog_v2/editorial/generated/evaluation.json)

### Human worksheets

Use [relevance_worksheet.csv](../experiments/catalog_v2/editorial/generated/relevance_worksheet.csv) for top-five results and [list_worksheet.csv](../experiments/catalog_v2/editorial/generated/list_worksheet.csv) for diversity, empty lists and overconfident results. All judgment cells are empty. Make a separate copy per rater. When running multiple systems, blind the system label, randomize order and pool equivalent work results. Preserve query IDs and a mapping for later analysis. Use at least two raters familiar with the relevant language or literature.

- Relevance **0–3** means irrelevant, weak, useful, or directly relevant.
- Explanation accuracy is **supported**, **partially supported**, **unsupported**, or **not enough evidence**. Check cited fields and record why.
- Spoiler risk is **none**, **minor**, or **severe**. Record the issue without reproducing the spoiler in a shared worksheet.
- List diversity **1–3** means narrow, adequate, or varied relative to the query. Record whether the system returned an adequate list, withheld results appropriately, or overreached.

## Expansion decision

Expansion remains blocked. The [machine-readable gate report](../experiments/catalog_v2/editorial/generated/quality_gates.json) separates checks from editorial decisions. Suggested thresholds are review criteria and do not represent measured performance.

| Gate | Automated evidence | Human condition for expansion |
| --- | --- | --- |
| Work identity and duplicates | Duplicate checks, competing source IDs, legacy UUID evidence and counts. | Approve 100% of titles, contributor identities and work mappings proposed for publication. Release with zero unresolved identity collisions. Treat legacy mappings as a separate decision. |
| Editions and ISBN | Validate candidate checksum and group matching ISBNs across edition records. | Confirm at least one edition for 90% of works from direct edition sources. Keep a reason and independent evidence where ISBNs are unavailable. |
| Literary metadata and provenance | Count missing critical fields and check references on every populated claim. | Approve genre, form, themes, subjects, language and spoiler-safe synopsis on at least 90% of the release sample. Check every approved assertion's evidence and reuse basis. |
| Recommendation relevance | Known-title recall@5 at least 95%. Report result counts and negative controls. | Two raters on at least 20 discovery queries, 80% with a relevant top-three result, 90% supported explanations and zero severe spoilers. Report diversity alongside relevance. |
| Multilingual coverage | Query and edition coverage by language, with empty results tracked separately. | Verify at least five Kiswahili works and judge at least six Kiswahili discovery queries. Target 70% relevant top-three in that slice. Record the limits for other languages. |
| Workload | Queue size and elapsed review minutes per work. | Time a ten-work review sample. Target median review under or equal to 20 minutes and document cases requiring specialist follow-up. |

The next step is independent review of the queue and ratings, using the same frozen sample. No production integration or dataset expansion is part of this phase.
