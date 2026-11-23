# SomaRec data pipeline audit

23 November 2026 · Source revision `5f91be86a234078945ccded7f6cfb646222fe7f7` · `feature/somarec-discovery-rebuild`

SomaRec’s catalog is usable for known-title search. The main obstacle to reliable discovery by interest is that an unverified source match can supply the description, cover and inferred language for a public book. That description can then determine its themes and recommendations. Start with a small reviewed collection and a safe import preview.

## Scope and reproduction

I inspected the original notebook, both committed harvest snapshots, catalog builder, Open Library enrichment, theme tagger, Supabase uploader and schema, and the production search code. I rebuilt from the committed backend harvest into a scratch file. The earlier read-only production check and signed-out walkthrough are described separately below. The rebuild made no live source calls or database writes.

| Input or output | Rows | Evidence |
| --- | ---: | --- |
| Notebook export under `somarec_data/derived` | 452 | 51 descriptions and 125 image URLs |
| Backend harvest used by the builder | 509 | 309 descriptions and 452 image URLs |
| Committed catalog | 490 | 297 descriptions, 441 cover URLs, 220 Open Library work keys, 15 records with at least one ISBN |
| Scratch rebuild | 490 | Five placeholder titles dropped, 14 rows merged, 11 manual corrections applied. All 490 IDs matched the committed catalog. Only `themes` and `theme_source` differed, on all 490 records. |

The checked-in harvests are different snapshots. The scratch build reproduces the handoff from the backend snapshot. The notebook was inspected without re-running the external harvest, so the exact history of the differences between those inputs remains unverified. The other counts measure populated fields. They do not establish accuracy or availability. [Notebook export](https://github.com/254Nicole-Nase/somaRec-thematic-recommender/blob/5f91be8/somarec_data/derived/kenyan_works_augmented.csv) · [Backend harvest](https://github.com/254Nicole-Nase/somaRec-thematic-recommender/blob/5f91be8/backend/data/kenyan_works_augmented.csv) · [Build entry point](https://github.com/254Nicole-Nase/somaRec-thematic-recommender/blob/5f91be8/backend/pipeline/build_catalog.py#L223)

## Findings

### 1. Enrichment can attach the wrong description and cover

The Google Books notebook code takes the first result of a title-and-author query and copies a description or thumbnail without comparing the returned title, author, or ISBN. It keeps the row’s original source label, so `wikidata` or `ol_author` does not identify the provider of the synopsis. A later Open Library lookup in the notebook can fall back to token overlap without a minimum match threshold. The standalone Open Library enrichment checks the main title and surname for its search fallback, but accepts a supplied work key if it resolves. Its output is used to fill gaps, so a long wrong description survives. For duplicates the builder favors longer descriptions and a cover.

- The raw *Olduvai Gorge* row has the Google Books thumbnail and synopsis for *Wiley-Blackwell Encyclopedia of Human Evolution*. This specific source mismatch was verified against the Google Books volume.
- Jared Angira’s *Juices* already contains a synopsis of *The Columbia Guide to East African Literature in English Since 1945* in the raw export.
- The catalog’s *Umbuji wa kiwandeo* contains a description of *Philosophising in Mombasa* and was classified as English by the heuristic. This illustrates how bad descriptions can contaminate language labels.
- The checked-in corrections already clear a wrong cover for *Kilio cha haki* and two wrong Mazrui descriptions. These are examples of existing editorial work that a future import must preserve.

[Google Books matching](https://github.com/254Nicole-Nase/somaRec-thematic-recommender/blob/5f91be8/part5.ipynb#L581) · [Notebook Open Library fallback](https://github.com/254Nicole-Nase/somaRec-thematic-recommender/blob/5f91be8/part5.ipynb#L1309) · [Standalone Open Library matching](https://github.com/254Nicole-Nase/somaRec-thematic-recommender/blob/5f91be8/backend/pipeline/enrich_open_library.py#L57) · [Merge and enrichment rules](https://github.com/254Nicole-Nase/somaRec-thematic-recommender/blob/5f91be8/backend/pipeline/build_catalog.py#L152) · [Corrections](https://github.com/254Nicole-Nase/somaRec-thematic-recommender/blob/5f91be8/backend/data/corrections.csv#L8) · [Encyclopedia volume](https://books.google.com/books?id=440TmWXToLAC)

### 2. The author harvest does not establish literary scope or work identity

Open Library author searches account for 394 of the 490 catalog records. The notebook seeds its search from Wikidata citizenship and occupation data, limits an Open Library author query to 20 hits, and can accept a hit if any contributor matches an alias while saving the first contributor as author. These choices can miss authors with incomplete records and assign incorrect author credit. They also admit works such as a Pan-African Congress statement into the same browse pool as fiction.

The builder merges normalized title-and-author matches and some subtitle variants. *Dragonfly Sea* and *The Dragonfly Sea* survived under different UUIDs and appeared side by side in the live author list. The committed catalog contains 18 groups comprising 38 records with the same author and matching descriptions of at least 80 characters after punctuation normalization. This is a triage list. It includes possible duplicate editions and distinct works with reused blurbs, so it cannot be used as an automatic merge rule. Translations and different editions can need their own metadata.

[Wikidata selection](https://github.com/254Nicole-Nase/somaRec-thematic-recommender/blob/5f91be8/part5.ipynb#L195) · [Open Library author search](https://github.com/254Nicole-Nase/somaRec-thematic-recommender/blob/5f91be8/part5.ipynb#L308) · [Contributor handling](https://github.com/254Nicole-Nase/somaRec-thematic-recommender/blob/5f91be8/part5.ipynb#L529) · [Congress statement](https://github.com/254Nicole-Nase/somaRec-thematic-recommender/blob/5f91be8/backend/data/catalog.csv#L2) · [Duplicate title example](https://github.com/254Nicole-Nase/somaRec-thematic-recommender/blob/5f91be8/backend/data/catalog.csv#L488)

### 3. The theme pipeline has two incompatible build outcomes

The checked-in catalog and the earlier live check agreed on 232 model-tagged records, 205 marked `insufficient_text`, and 53 marked `no_confident_theme`. The current tagger uses an 80-character description floor and a confidence threshold. Leaving weak matches untagged is useful. The scratch rebuild assigned `legacy_top3` to every row because the default builder reads the older theme CSV. The newer tagger is a separate step, and the importer accepts the rebuild as valid input. A rebuild followed directly by an import can therefore regress theme quality. A wrong synopsis can also yield confident but incorrect themes.

The production keyword and embedding inputs use title, author and description. Theme tags do not enter those search inputs, and the homepage’s theme chips submit free-text searches. Better tags alone will not change what the chips retrieve.

[Legacy theme loading](https://github.com/254Nicole-Nase/somaRec-thematic-recommender/blob/5f91be8/backend/pipeline/build_catalog.py#L92) · [Thresholds](https://github.com/254Nicole-Nase/somaRec-thematic-recommender/blob/5f91be8/backend/somarec/themes.py#L21) · [Retag script](https://github.com/254Nicole-Nase/somaRec-thematic-recommender/blob/5f91be8/backend/pipeline/tag_themes.py#L32) · [Search input](https://github.com/254Nicole-Nase/somaRec-thematic-recommender/blob/5f91be8/supabase/functions/somarec-api/engine.ts#L51) · [Theme chip handler](https://github.com/254Nicole-Nase/somaRec-thematic-recommender/blob/5f91be8/src/App.tsx#L190)

### 4. The catalog has identifiable metadata gaps

The committed catalog has 193 blank descriptions, 203 descriptions under 50 characters, 49 blank cover URLs and 475 records with no ISBN. It has 346 guessed language labels, 74 supplied by metadata, six corrected labels and 64 blanks. The live check found 16 records labeled Kiswahili, 11 of them guesses. The notebook’s main Open Library mapping leaves ISBN and language blank. The builder uses title and description heuristics for missing language.

The live snapshot had 490 published records, zero marked human-reviewed, zero populated genres and zero dedicated access URLs. Supabase has a genre column, while the build and uploader omit it and the API genre endpoint returns an empty list. Book details still generate Open Library, Google Books and WorldCat links from work keys, ISBNs or title searches. A stored cover URL or lookup link does not establish that the cover matches or that a reader can obtain the book.

[Notebook mapping](https://github.com/254Nicole-Nase/somaRec-thematic-recommender/blob/5f91be8/part5.ipynb#L550) · [Language heuristic](https://github.com/254Nicole-Nase/somaRec-thematic-recommender/blob/5f91be8/backend/somarec/text.py#L78) · [Schema defaults](https://github.com/254Nicole-Nase/somaRec-thematic-recommender/blob/5f91be8/supabase/migrations/20260925000000_base_schema.sql#L111) · [Genre route](https://github.com/254Nicole-Nase/somaRec-thematic-recommender/blob/5f91be8/supabase/functions/somarec-api/index.ts#L242) · [Link generation](https://github.com/254Nicole-Nase/somaRec-thematic-recommender/blob/5f91be8/supabase/functions/somarec-api/engine.ts#L254)

### 5. The importer can overwrite editorial work or duplicate an existing identity

The importer looks up existing books by folded title and author, reuses the matched UUID and upserts full payloads by UUID in independent batches. When a correction changes the lookup key and the supplied UUID differs, it can insert a new row. A stale CSV can replace an edited description, curated themes or access link with an older value or null, and can reset curation status. The dry run reports insert and update totals without showing field differences. New rows omit publication status and inherit the schema’s published default. The serving API selects published books regardless of whether curation status is reviewed.

Existing reading-list entries, reviews, CBC alignments and embeddings reference book UUIDs. Those foreign keys cascade on deletion, so duplicate cleanup by deletion can lose linked data. Reviews are unique per reader and book, which makes merges with two reviews by one reader a case for explicit resolution.

[Uploader mapping and write path](https://github.com/254Nicole-Nase/somaRec-thematic-recommender/blob/5f91be8/backend/upload_books_to_supabase.py#L34) · [Published catalog query](https://github.com/254Nicole-Nase/somaRec-thematic-recommender/blob/5f91be8/supabase/functions/somarec-api/index.ts#L92) · [Reading lists and CBC schema](https://github.com/254Nicole-Nase/somaRec-thematic-recommender/blob/5f91be8/supabase/migrations/20260925000000_base_schema.sql#L154) · [Reviews schema](https://github.com/254Nicole-Nase/somaRec-thematic-recommender/blob/5f91be8/supabase/migrations/20260926000000_catalog_reviews_cbc.sql#L30)

## Reader impact verified earlier

On the deployed site, *Dust* ranked first for its title and had helpful related books. The same-author section displayed both *Dragonfly Sea* entries. A query for novels about family secrets and political violence also surfaced a history handbook. “hadithi za watoto” surfaced *Gardening in East Africa* second, and a meaningless query still returned five results. Genre browsing offered no choices. *Dust* had three useful lookup buttons that led to title searches. The public API served 490 books in hybrid mode with 490 embeddings after recovering from one health check error. The signed-out library prompt was verified. Authentication, saved-book sync, posting reviews and the mobile layout were outside that completed walkthrough. [Live SomaRec](https://soma-rec-thematic-recommender.vercel.app/)

## Remediation order

1. **Protect the next import.** Preview per-field changes against a staging snapshot, protect existing editorial decisions, require explicit identity mapping, and verify an unchanged rerun makes no edits.
2. **Review a pilot of 50–75 works.** Include deliberate Kiswahili coverage and classify fiction, poetry, memoir and children’s literature. Check why each work belongs, identify its author and edition, and retain evidence for synopsis, language, themes and access links. Add publisher catalogs to fill gaps missed by the author harvest. Use the confirmed mismatches as regression cases.
3. **Retag and test reader discovery.** Make tagging reproducible, preserve reviewed themes, and check referred links and recommendation quality. Judge the top five results for relevance and variety on English, Kiswahili and mixed-language queries before choosing a redesign or model change.

[East African Educational Publishers catalogue](https://www.eastafricanpublishers.com/catalogue/) · [Longhorn catalogue](https://www.longhornpublishers.com/products-services/catalogue/) · [Existing relevance queries](https://github.com/254Nicole-Nase/somaRec-thematic-recommender/blob/5f91be8/backend/evaluation/queries.csv)
