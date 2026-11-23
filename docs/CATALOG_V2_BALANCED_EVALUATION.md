# Phase 5B.2 evaluation protocol for review

**Phase 5C is pending.** Holdout A is sealed. Holdout B awaits human authorship and sealing. The genuine form pilot awaits reviewer decisions. These are separate inputs with different roles.

## Protect the two samples

**Holdout A — open-world and abstention.** Keep the original 15 requests, manifest and creation commit `2b3c5f14cc07e0042d5bb6a6db66306889ded1ec`. The query-file SHA-256 is `30b31abd24f321b58b350c7e6a605483da179f5e813b7c384c38a3046943db07`. The manifest SHA-256 is `e2c2351a508786e4fad013c61e1091768c538b8a2cd97c74633a9ef865d79b17`. Some requests may have relevant books in the sample. Only subsequent independent judgments can establish that. [Original manifest](../experiments/catalog_v2/readiness/holdout.manifest.json)

**Holdout B — positive discovery.** Give the independent author only the invitation and blank template. The target is ten plausible requests with useful matches, including queries for which several books could qualify. Actual coverage is unknown. The author’s candidate titles are private hypotheses for later error analysis. Exclude those fields from ranking inputs and withhold them from relevance judges until their assessments are locked. [Author invitation](HOLDOUT_B_AUTHOR.md)

The coordinator checks independence, natural wording, mix of needs and the language split before sealing. Use a clean checkout of the intended experimental revision and run:

```sh
python backend/seal_holdout_b.py /path/to/completed-human-input.json \
  --output-dir /path/to/private-seals --version 1
```

The command validates the ten rows and writes `holdout-b-v1.zip` containing the original input bytes and a versioned manifest with SHA-256, language counts and checkout HEAD. It publishes the completed archive using an exclusive hard link on the destination filesystem. An existing version is never replaced. Use the same version, input bytes and revision to reproduce the archive in a separate directory. The recorded SHA binds the author’s input, including whitespace. The commit identifies the sealer checkout; separately pin the model and all inputs at experiment registration.

Keep the sealed archive with the coordinator and **seal before inspecting any retrieval results for B**. Corrections made after exposure move the affected requests to development. Preserve the archive and revision history, commission independently authored replacements and seal a new version. Validation cannot establish authorship, fluency or actual relevance.

## How to judge discovery and abstention

1. Before retrieval, register both holdout hashes, the 30-work snapshot, taxonomy version, editorial overlay, actual decisions, systems, top-five cutoff and retrieval mode. Keep the original 24 development requests outside all holdout metrics.
2. Two independent reviewers competent in the query language should judge the 30 works for each request without seeing the rankings, author hypotheses or one another’s labels. For each pairing record relevance (0 irrelevant, 1 weak, 2 useful, 3 directly relevant), or insufficient evidence. Cite the evidence, including form, edition language or audience when explicitly requested. Adjudicate disagreements. Record the counts of supported positives, supported negatives and unresolved requests in A and B separately. A negative requires adequate evidence across the catalog. Missing metadata alone cannot establish irrelevance.
3. For adjudicated positive requests report hit@5, recall@5 and reciprocal rank of the first useful result (relevance ≥2). Count an empty response as a miss. For adjudicated negative requests report the fraction with a correct abstention and the fraction returning an unsupported suggestion. For unresolved requests report counts and observed behavior separately from confirmed-negative metrics. Report denominators and counts per language, set and policy. If a stratum is empty its rate is undefined.
4. Review top-five explanations separately for evidence, provisional status and spoiler risk. Distinguish a relevant work missing catalog metadata, a work ineligible under approved-only policy, and an eligible work missed by ranking. Report diagnostic and approved-only coverage alongside relevance. Inspect every multi-book request for missing relevant works. Keep pooled totals secondary; the designed 15:10 split does not estimate reader traffic.
5. If the independent judgments yield too few actual positives or negatives, disclose that limitation. Do not relabel examples or adapt exposed queries to manufacture balance. A larger independently sealed set would be a later experiment.

## Form pilot and taxonomy choice

The [readiness taxonomy v1.1.0](../experiments/catalog_v2/readiness/taxonomy.v1.1.json) adds one form, `essay-collection`. A volume of essays and an individual essay have distinct IDs. The English label follows the author bibliography already cited for *Decolonising the Mind*. The Kiswahili label is explicitly pending specialist review and supplies no search alias. The eleven pilot corrections include two pending essay collections, *Decolonising the Mind* and *Something Torn and New*. Reconciliation against v1.1.0 can identify the collection form while preserving their proposal status. The 29 preceding concepts and the frozen v1.0.0 data remain available. Existing baseline commands default to v1.0.0. No metadata was selected using holdout wording.

Give the reviewer the [seven-row worksheet](../experiments/catalog_v2/readiness/review_worksheet.csv) and [full source packet](../experiments/catalog_v2/readiness/review_packet.json). In a private copy, preserve the first six columns. For each completed ballot enter:

| Column | Reviewer input |
| --- | --- |
| decision | `approve`, `reject` or `request_more_evidence`. Leave all four response columns blank to defer. |
| reviewer | Your reviewer identifier. |
| notes | Why the evidence supports, contradicts or leaves the classification open. |
| checked_urls | Space-separated public source URLs actually inspected. |

The command maps the three actions to verified, conflicting and needs_review through the existing decision validator. It requires at least one completed ballot, checks all seven against the frozen packet and recomputes their fingerprints under v1.1.0. Once genuine decisions arrive, run the following offline:

```sh
python backend/run_form_pilot.py /path/to/completed-review.csv \
  --output /path/to/new-private-pilot-report.json
```

Only the three fixed form smoke queries run in approved-only mode. The report separates accepted, rejected and pending assertions, returns the actual ranked results and flags explanations inconsistent with the verified form assertion. This is a mechanical support check; a person must still assess the cited source. The report contains reviewer notes. Keep it private unless reviewers authorize sharing. The command supplies no title, language, theme or edition approvals. A returned work ID may therefore lack an approved display title. The [previous pilot instructions](CATALOG_V2_APPROVAL_PILOT.md) explain the status semantics.

## Phase 5C readiness checklist

- [x] Confirm the Holdout A hash and original creation history.
- [x] Provide a blank Holdout B authoring file and a tested no-overwrite sealer.
- [x] Separate v1.1.0 from the historical taxonomy and verify the seven ballots.
- [x] Test approval, rejection, requests for evidence and stale fingerprints with synthetic ballots.
- [ ] Obtain independent human requests, review their provenance and seal Holdout B.
- [ ] Receive genuine reviewer decisions and inspect the approved-only form pilot.
- [ ] Independently review this protocol, lock experiment inputs and judgment procedures, and authorize Phase 5C.
