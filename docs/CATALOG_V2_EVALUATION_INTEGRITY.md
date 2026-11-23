# Evaluation integrity and readiness for an independent review

## What is frozen

The original 24 queries are **development diagnostics**. The bilingual mappings, audience repair, setting evidence, and ranking design were informed by their observed failures. Source-backed facts can improve the catalog while also making a query easier to answer. The Phase 5A and 5B hit counts and ranks describe those particular development runs. They cannot estimate performance on new reader requests.

The [freeze manifest](../experiments/catalog_v2/readiness/freeze.json) identifies Git revision `0b4b3c44a33779f329e58bdfe6930848fe60377d`, taxonomy 1.0.0, retrieval code and dependencies in the repository, the candidate bibliography, editorial inputs, empty decision ledger, original queries, the retained Phase 5A ranking, and Phase 5B evaluations under both policies. Each path has a SHA-256 of its file bytes. For editorial files without a semantic version, the Git revision plus the content hash is their version. The earlier Phase 5A source revision and regeneration procedure are recorded in the [retrieval protocol](CATALOG_V2_FIELD_RETRIEVAL.md).

Check the pinned revision in a clone containing its Git objects, independently of the current checkout:

```sh
python - <<'PY'
import hashlib, json, subprocess
manifest = json.load(open("experiments/catalog_v2/readiness/freeze.json"))
for path, expected in manifest["sha256"].items():
    data = subprocess.check_output(["git", "show", manifest["revision"] + ":" + path])
    assert hashlib.sha256(data).hexdigest() == expected, path
print("Pinned files match.")
PY
```

## Prospective query set

Fifteen prompts were authored and committed in `2b3c5f1` before form research or pilot preparation. Six are English, five Kiswahili and four mixed-language. Each records a reader need, category and reason the request might arise. Their starting points include a caregiver choosing a read-aloud, an amateur performance group, a gift buyer and a trainee nurse. They are constructed scenarios. No reader interviews, usage logs, relevance labels or observed hits went into their wording. The author had prior project context, so this is a prospective holdout from retrieval runs, not an independently recruited reader sample.

The [query manifest](../experiments/catalog_v2/readiness/holdout.manifest.json) binds the exact bytes and count. The file sits outside the editorial CLI's default query path. This phase checked its structure and digest only. No evaluation command, embedding call, tokenization experiment or worksheet generator received these prompts.

For Phase 5C, first record the catalog revision, decision ledger, retrieval policies, model revision, cutoffs and measures to compare. Separate approved-only coverage from diagnostic ranking. Preserve empty lists. Have independent bilingual reviewers judge pooled, blinded results and inspect omissions, explanation evidence, diversity and unsafe spoilers. Collect disagreements before adjudication. Fifteen authored requests are a small pilot and support descriptive, query-level findings.

Do not use this public holdout as vocabulary or enrichment guidance. Retire an exposed query to the development set if anyone revises it or tunes to its results. Preserve the original file and hash, commission an unseen replacement, and freeze a new version before further evaluation. Publish the replacement history. Keeping a checksum proves byte integrity; access and execution discipline depend on the team.

## Bibliographic readiness

All 30 form assertions were inspected. The [audit](../experiments/catalog_v2/readiness/form_audit.json) pairs each original value, source and fingerprint with its candidate, status, supporting evidence and reason. Eleven work-specific replacements are staged separately from the frozen editorial inputs. Seventeen already-specific assertions were retained. Two broad forms still need bibliographic evidence. The [proposal file](../experiments/catalog_v2/readiness/form_proposals.json) can be combined with the existing correction layer for a local pilot.

| Proposed form | Works and bibliographic basis |
| --- | --- |
| Play | *Betrayal in the City*. Pwani University transcribes “a play” in the 1976 edition’s title statement. |
| Novel | *Kidagaa Kimemwozea* (Kibabii’s school-edition record), *Dust* (publisher and attributed reviews), *A Grain of Wheat* (Penguin’s education catalog), *Weep Not, Child* and *The River Between* (author bibliography), *Black Star Nairobi* (Cornell author profile), *Going Down River Road* (University of Nairobi research abstract), *Coming to Birth* (Pwani's Bildungsromane heading). |
| Essay collection | *Decolonising the Mind* (author identifies the four essays), *Something Torn and New* (review identifies essays and Howard’s reading guide documents the lecture structure). The existing single-essay concept cannot express a collected volume. Both candidates remain free-text forms. |

*The Dragonfly Sea* already carries a novel assertion from Owuor’s publisher. Its two legacy UUID candidates remain open. The five memoir labels remain usable as literary descriptions even though v1 places memoir in the genre dimension. *Replenishing the Earth* and *The Challenge for Africa* retain nonfiction: their publisher describes purpose and subject, without settling a more precise form. The audit gives the evidence needed in each case.

A source about one edition may establish the form of its named work. It cannot approve other edition records, merge ISBNs or reconcile legacy UUIDs. Every candidate remains pending. These proposals change no retrieval rule, theme, setting or language. No held-out or development ranking comparison was used to decide which replacements to propose.
