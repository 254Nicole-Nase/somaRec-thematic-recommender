# Offline field-aware retrieval experiment

## Phase 5A reference, inspected before changing retrieval

At fa10c736, searchable() joined title, author and nine eligible literary fields into one string per work. The diagnostic policy admitted populated verified and needs_review fields, excluding conflicts. Genres and audiences lived outside that dictionary. A small form lookup expanded fiction to novel and drama to play. Query language labeled slices only. The optional work_language filter required an edition-language code. Case-folded exact titles sorted first; other hits used positive Okapi BM25 with k1=1.5 and b=0.75 over the shared document. Explanations recomputed token overlap by field after ranking. The artifact stored references and assertion status for each overlap, but did not serialize scores.

The [byte-for-byte baseline](../experiments/catalog_v2/editorial/baselines/fa10c736/evaluation.json) contains the 24 original query texts and all 53 ordered hits, six known titles first and three empty lists (q13, q23, q24). Extract it independently with `git show fa10c736:experiments/catalog_v2/editorial/generated/evaluation.json`. The normal report generator never writes this reference.

## Reproduce both policies

Run the existing offline CLI from the repository root. It reads the frozen 30 works, editorial overlays and 24 original query controls. A checksum protects the baseline, and the CLI refuses an output directory under the baseline directory. Use an empty temporary directory for a reviewer's experiment.

```sh
python backend/review_catalog_v2.py --output-dir /tmp/somarec-5b
diff -r experiments/catalog_v2/editorial/generated /tmp/somarec-5b
python -m pytest backend/tests
```

The CLI writes diagnostic `evaluation.json`, `evaluation_approved_only.json`, both `comparison_<mode>.json` files, and `form_reconciliation.json`. Each comparison joins the original query object to the matching baseline run and gives ordered work IDs, ranks before and after, added and removed hits, field differences, emptiness and interpreted constraints. Alternate queries have no baseline unless their ID, text, filters and other metadata match. The frozen artifact supplies the historical explanations and source evidence. New hits include their lexical score, normalized overlaps, contributing evidence, fingerprints and assertion status. Worksheets remain blank for human judgment. [Per-query reading guide](CATALOG_V2_SEARCH_REGRESSIONS.md)

## What the ranker can use

The diagnostic policy admits populated, evidence-bearing proposals or verified assertions. Approved-only verifies the human decision's work, field, status and underlying fingerprint before indexing each claim. Identity lookup follows the same rule. An independently approved edition language also requires the link to the work to be approved. Eligible literary claims can return a stable work ID when display metadata is unavailable. Neither policy admits conflicting or unknown assertions. The production engine has a separate entry point.

The reconciliation report retains the entire source assertion. Twelve works have unambiguous controlled forms and 18 retain their source value without a precise form ID. A legacy memoir string can satisfy an explicit memoir *genre* request under the applicable policy. Fiction and nonfiction remain broad. Drama can match a literal drama request. Equating it with a play would require evidence. Exact classifications supported by the same assertion count once. Controlled assignments are preferred when equally reviewed, and parents are never expanded.

The parser resolves the longest unambiguous English or Kiswahili taxonomy phrase to its stable dimension and ID. It also recognizes a small documented-in-code vocabulary of inflections and translations, including *mashairi*, *mazingira*, and *uongozi*. An exact eligible title, optionally followed by its author, triggers identity lookup. Query-language labels are reporting slices. An explicit work-language filter and languages requested in the text constrain the edition language. An about/kuhusu marker normally introduces subject words. *Hadithi* supplies a broad story preference supported by a story collection, short story, or animal-story claim; the audience and edition-language requirements remain independent.

All explicit requirements must have eligible supporting evidence. Conflicting values, missing values, and differing known values all withhold a work from exact results. An exclusion never establishes that an unknown language, audience or genre is incompatible. An empty list means the index could not support the request under the selected policy. There is no fallback. Positive results in diagnostic mode are provisional wherever their support is provisional.

Free-text matching runs the existing BM25 separately over title, author, themes, major subjects, setting, mood/tone and synopsis. Within each field, lexical variants collapse to unique terms. A subject or descriptive facet has twice the weight of prose or incidental title/author overlap. A matching adjacent content-word pair in a single assertion value increases that field's score in proportion to query-pair coverage (at most twice its base). Weights express a preference for attributable metadata and have not been fitted against relevance judgments. Pure classification hits tie and sort by stable work ID. For a multiword request, place cues route geographic terms to setting; a place by itself cannot support a separate requested subject. Exact taxonomy labels constrain instead of adding repeated lexical boosts.

The parser handles conjunctions conservatively. Quoted phrases, alternatives, negation, complex Kiswahili morphology, and arbitrary place hierarchies need review before broader use. Country adjectives can mean nationality or setting; the current interpretation treats *Kenyan* as geographic context. Titles containing common words can dominate an ambiguous single-term query. Generic overlap such as *change* still produces weak matches. Per-hit explanations label lexical overlap and provisional classification. A normalized word or matching phrase is evidence of lexical correspondence only.

## Source changes and review boundary

The Finnish national library records the exact 1968 Matindi/Mdoe work in Kiswahili and supplies Finnish and Swedish children's-literature classifications. This supports a pending audience proposal for *Jua na Upepo*. The UEAB contents separately support the story-collection form. The audience field does not assert an age band. [National library](https://kansalliskirjasto.finna.fi/Record/fikka.5933380) · [UEAB](https://opac.ueab.ac.ke/cgi-bin/koha/opac-detail.pl?biblionumber=28330)

For *Petals of Blood*, the Ilmorog study describes the village's development into an industrial town. The CODESRIA study connects the setting to agricultural and economic transformation. The existing setting and subject replacement proposals now retain both the place name and that context. These revisions get new fingerprints. Rebuilding with a stale decision fails. The retrieval code contains no work-specific ranking rule. [Setting study](https://iiste.org/Journals/index.php/RHSS/article/download/30272/31087) · [Economic context](https://www.journals.codesria.org/index.php/ad/en/article/download/1995/2044/5041)

Independent reviewers should judge the paired lists, bilingual intent, omissions, and evidence for each explanation. A future model experiment can reuse the same baseline and queries. There are no human labels or real semantic/hybrid benchmarks in this phase.
