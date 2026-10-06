# SomaRec project report: revisions, chapter by chapter

This is a review of the November 2025 project report ("SomaRec: A Transformer-Based Thematic Classification and Recommendation System for Low-Resource Kenyan Literature"), checked against the code and data in this repository. Page numbers are the printed page numbers in the report.

Each item says what to change and why. Where a suggested replacement text is given, adjust the wording to your own voice; the numbers in it come from the current code and data.

**The one rule for the whole report:** only claim what the system does and what you measured. An examiner can open the repo and check each claim in minutes. A report that says "X is a prototype and Y doesn't work yet, for this reason" scores better than one where every test is marked Pass and some can be disproved.

---

## Front matter

| Where | Problem | Fix |
|---|---|---|
| Title | "Low-Resource" plus "Kenyan Literature" suggests Kiswahili and other Kenyan languages are handled. The original model was English-only. | Keep the title, since the new default model is multilingual, but report Kiswahili results separately in Chapter 5 (queries K01–K05 in `backend/evaluation/queries.csv`). |
| Abstract | "digitizes … books" is inaccurate. The system harvests **metadata** (title, author, description, cover). No book text is stored or readable. | Replace "digitizes and semantically indexes open-access Kenyan books" with "aggregates and semantically indexes metadata for Kenyan books". |
| Abstract | "deployed as a scalable web platform with over 500 digitized Kenyan literary works" | The cleaned catalog has **490** works after de-duplication (see Chapter 5). Give the real number, say "metadata records", and only say "deployed" if there is a public URL. |
| Abstract | "books are mapped to … CBC" | The original mapping was random (see Chapter 5). Rephrase as "a CBC reading finder that separates teacher-reviewed alignments from content-based suggestions". |
| Abbreviations | "EHRs – Electronic Health Records (corrected)" and "ML – Machine Learning (corrected)" are leftover editing notes. EHRs isn't used in the report. | Delete "EHRs". Remove "(corrected)". Also check that CNNs, HDBSCAN, LDA, LIME, RAG and SASRec are actually used in the text; drop any that aren't. |

## Chapter 1: Introduction

| Where | Problem | Fix |
|---|---|---|
| 1.2, p.3 | "applied semantic theme classification using Sentence-BERT embeddings" | Correct, but say it is **zero-shot** classification against a fixed list of 59 themes, not a trained classifier. |
| 1.5, p.4 | The sentence "However, the vast majority of these advances have focused on well-resourced languages, resulting in minimal benefit for African literary ecosystems" appears twice in a row. | Delete the second copy. |
| 1.6, p.5 | "Users could search by keyword, theme, author, or title" | Now true in a stronger way: hybrid BM25 + embedding search handles exact titles and authors (see Chapter 5 results). |
| 1.6, p.5 | "This prototype did not include … user-behavior analytics" | Fine, but it now has reviews and ratings. Add a sentence saying ratings are collected for a future collaborative-filtering stage. |
| 1.7, p.6 | "without a fully integrated user management system in the core logic" contradicts Chapter 4/5, which describe Supabase Auth, roles and RLS. | Replace with: "User accounts, roles and reading lists are handled by Supabase; the recommendation service itself is stateless." |
| 1.7, p.6 | "evaluation relied on quantitative metrics (Silhouette Score)" | See Chapter 5: Silhouette doesn't measure recommendation quality. Replace with the new evaluation (known-item search plus human relevance judgments). |
| 1.7 (add) | Missing limitation: metadata quality. | Add: "About 41% of records (203 of 490) have little or no description, and some descriptions from the Google Books enrichment step belong to a different edition or book (e.g. a picture book record carrying a description of a teachers' activity guide). Search and theme tagging for these books is weak." |

## Chapter 2: Literature review

| Where | Problem | Fix |
|---|---|---|
| p.9 (after Fig 2.1) | "You could also emphasize that copyright issues pose a significant legal challenge…" is an editing note left in the text. | Rewrite as your own sentence: "Copyright is a further barrier: the legal position on digitising protected works, even for preservation, is often unclear (cite)." Then cite a source on the Kenya Copyright Act 2001. |
| 2.3, p.10 | "we've reviewed four representative examples", but only three follow (Amazon/Goodreads, Readow, BERT4Rec). | Change to "three", or add a fourth that fits better: **African Storybook** (openly licensed African-language children's books) or **eKitabu** (Kenyan digital book platform). Either one strengthens the "gaps" section more than BERT4Rec. |
| 2.3.1, p.10 | "achieves high accuracy (>90% Precision@10) for popular titles" | No source supports this number. Remove it, or cite the exact paper and dataset it came from. |
| 2.3.2, p.11 | "Readow reports embedding-based Precision@10 of ~85%" | Same problem. Remove it unless you can cite where Readow published it. |
| 2.3.3 / 2.4 | BERT4Rec needs long per-user reading histories, which SomaRec doesn't have. | Keep it, but say explicitly that it's reviewed as a **future** option once reading-list and rating data exists. That is the honest link to your Future Works. |
| 2.4, p.13 | "leading recommender systems … employ supervised or hybrid models" | Fine. Add one sentence that SomaRec's hybrid is **lexical + semantic** (BM25 + embeddings), not content + collaborative, so readers don't confuse the two meanings of "hybrid". |
| 2.5, p.15 | "Feedback from users helps improve the system over time." No such feedback loop exists. | Delete it, or change to "User ratings are collected so a future version can learn from them." |

## Chapter 3: Methodology

| Where | Problem | Fix |
|---|---|---|
| 3.2.1, p.17 | The heading says "Justification of OOAD", but the first half justifies Scrum. | Split into "3.2.1 Justification of Agile Scrum" and "3.2.2 Justification of OOAD". |
| 3.2.1, p.17 | "encapsulate complex logic into distinct classes (e.g., Recommender, CBCAlignment)" | The code now has `SearchEngine`, `BM25`, `ThemeTagger` and `SentenceEncoder` in `backend/somarec/`. Update the class names. |
| 3.2.5–3.2.6, p.18 | Daily Scrums and stakeholder Sprint Reviews for a one-person project read as template text. | Say how it actually worked, e.g. "one-week sprints tracked in GitHub; weekly review with the supervisor served as the Sprint Review." |
| 3.3.3, p.19 | Hugging Face Transformers "v4.39.1" | Only keep the version if it's in `requirements.txt`. Sentence-transformers pulls Transformers in as a dependency. |
| 3.3.4, p.19 | all-MiniLM-L6-v2 | Update: the default is now `paraphrase-multilingual-MiniLM-L12-v2` (multilingual, including Swahili). Keep MiniLM-L6 as the **baseline you compared against**. |
| 3.3.5, p.20 | "IndexIVFFlat … allowing queries to run in sub-linear time even as the dataset grew" | With 490 books, IVF saves nothing measurable and can miss results (it searches only about half the clusters). Rewrite: "Exact inner-product search (FAISS IndexFlatIP) is used because the catalog is small; an IVF index was evaluated and is only worthwhile for catalogs of hundreds of thousands of books." The evaluation script can show the recall difference (`--original`). |
| 3.3.7, p.20 | "The web-based user interface will be built using Flask" | Wrong tense and wrong layer: the UI is React. Flask serves only the search/recommendation API. |
| 3.4.3, p.21 | "Distributed System Architecture … high degree of scalability" | It's a React SPA, one Flask service and Supabase. Call it a "three-tier architecture" and drop "high degree of scalability" unless you load-tested it. |

## Chapter 4: System analysis and design

| Where | Problem | Fix |
|---|---|---|
| 4.2.1 (v), p.23 | "rate materials" | Now true: `reviews` table with 1–5 star ratings (migration `20260926000000_catalog_reviews_cbc.sql`). Keep it and describe it. |
| 4.2.1 (vi), p.23 | "update dataset indices, and configure thematic classifications" | Admins can edit metadata in Supabase and trigger `POST /api/admin/reindex`. Theme lists are edited in `backend/data/themes.csv`. Describe exactly that. |
| 4.2.2 (ii), p.23 | Performance justified by IVF | Replace with a measured latency (time `/api/search` locally) and exact search. |
| 4.3.3, p.26 | The logical schema lists ADMINS and IMPORT_AUDIT tables that don't exist in the code. | Redraw it with the real tables: `books`, `themes`, `reading_lists`, `book_curriculum`, `profiles`, `reviews`. |
| 4.3.7, p.28–29 | "microservices approach … API Gateway … User Management, Book Content, Recommendations, and Curriculums" services. None of these separate services exist. | Redraw it: React SPA → (a) Supabase (auth, books, reading lists, reviews, curriculum) and (b) Flask search API (catalog + BM25 + embedding index + CBC suggestions). |
| DFD Level 1, p.28 | "Store & Deliver Recommendations" | Recommendations are computed on request, not stored. Rename it "Deliver recommendations". |

## Chapter 5: Implementation and testing (the biggest changes)

### 5.3.1 Dataset preparation

- **"514 unique literary works"** is wrong: the harvested file has 509 rows. After the new cleaning step (`backend/pipeline/build_catalog.py`) the catalog has **490** works by **113** authors. Suggested text:

  > The harvested file contained 509 records. Cleaning removed 5 records whose titles were unresolved Wikidata identifiers (e.g. "Q24937606"), merged 15 author spellings that differed only in apostrophes or diacritics (e.g. "Ngũgĩ wa Thiong'o" / "Ngũgĩ wa Thiongʼo"), and merged 14 duplicate works (editions such as "Hot Hippo" / "Hot Hippo (Picture Knight)", and subtitle variants such as "Decolonising the Mind" / "Decolonising the Mind: The Politics of Language in African Literature"). The final catalog has 490 works by 113 authors. Each work has a stable identifier derived from its normalised title and author, so the search service, database and reading lists refer to the same book.

- **Report data coverage honestly:**
  - 203 of 490 works (41%) have fewer than 80 characters of description.
  - Language, from metadata or a labelled guess: English 401, Kiswahili 16, Gikuyu 7, other 2, unknown 64. Of these, 347 are guesses from title and description words.
  - 51 have no cover image.
- **Scope of "Kenyan literature":** the harvest includes Kenyan-born authors writing on non-Kenyan subjects (e.g. Ben Kane's Roman novels) and non-fiction. Define the inclusion rule you use (Kenyan author, or about Kenya) and say that records carry a `curation_status` field so an editor can review them.

### 5.3.2 NLP pipeline

- Replace the IVF description with the hybrid design:

  > Each query is ranked two ways: BM25 keyword scoring over accent-folded title, author and description text, and cosine similarity between multilingual sentence embeddings (paraphrase-multilingual-MiniLM-L12-v2, 384 dimensions) using exact inner-product search. The two rankings are combined with Reciprocal Rank Fusion (k = 60). Keyword scoring makes exact titles and author names reliable; embeddings capture meaning ("stories about freedom fighters" → Mau Mau novels). Embedding results below a minimum similarity are dropped, so nonsense queries return no results instead of arbitrary books.

- **Theme tagging:**

  > Themes are assigned zero-shot by comparing each book's embedding with an embedding of the theme name plus a short gloss. A theme is only assigned if its similarity passes a threshold, and at most three are kept. Books with under 80 characters of description are left untagged rather than guessed from the title alone.

- **5.3.2.2 Testing and validation: remove or demote Silhouette and "diversity".**
  - Silhouette measured how tidy FAISS's internal k-means clusters were, not whether recommendations are relevant.
  - "1 − mean similarity" rewards random recommendations.
  - The t-SNE plot can stay as an illustration, labelled as such.

### 5.4 Testing: new evaluation section (replaces the argument for Table 5.1)

Add a subsection "5.4.x Retrieval evaluation" with two parts.

**(a) Known-item search (automatic).** Run:
```
python backend/evaluation/evaluate.py known-item --sample 200 \
  --models sentence-transformers/all-MiniLM-L6-v2 \
           sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2 intfloat/multilingual-e5-small \
  --original sentence-transformers/all-MiniLM-L6-v2 --out backend/evaluation/results_known_item.md
```
Results for 200 books (seed 42); the full table is in `backend/evaluation/results_known_item.md`. Hit@1 / MRR:

| system | exact title | first two title words + surname | phrase from description |
|---|---|---|---|
| **original: MiniLM-L6 + FAISS IVF** | 0.72 / 0.77 | 0.48 / 0.57 | 0.44 / 0.53 |
| same model, exact search (no IVF) | 0.79 / 0.84 | 0.50 / 0.61 | 0.46 / 0.55 |
| TF-IDF | 0.77 / 0.87 | 0.50 / 0.65 | 0.88 / 0.93 |
| BM25 keyword | 0.98 / 0.99 | 0.88 / 0.93 | 0.89 / 0.94 |
| hybrid, multilingual MiniLM-L12 (**app default**) | 0.98 / 0.99 | 0.60 / 0.71 | 0.65 / 0.74 |
| hybrid, multilingual-e5-small | 0.98 / 0.99 | 0.53 / 0.65 | 0.75 / 0.84 |

What to say about it:
- **IVF cost recall.** Same model, same books: the original IVF index finds the right book first 72% of the time for an exact title, exact search 79%. At a few hundred books exact search is instant, so IVF brings no benefit.
- **Embeddings alone are bad at finding a book you can name.** Every dense-only system is well below plain BM25. That is why the app is hybrid, and why an exact title now always ranks first.
- **Known-item search can't show what embeddings are for.** Hybrid still trails BM25 on partial titles and phrases, because this test rewards exact word overlap. The case for the model is thematic, cross-language queries ("growing up during the Mau Mau emergency", Kiswahili queries), which part (b) measures. How much weight the meaning score gets (`SOMAREC_SEMANTIC_WEIGHT`, default 0.5) should be set from part (b), not from this table.
- **Model choice.** The two multilingual models are close; e5-small is better on description phrases, MiniLM-L12 on partial titles. Keep MiniLM-L12 unless part (b) says otherwise.

**Theme tagging.** Themes are now assigned by comparing each book with a short gloss of every theme and keeping a theme only when the book scores clearly above that theme's catalog average (z-score ≥ 1.5, at most 3). Raw similarity let broad themes win everywhere: in the original labels "Wealth and materialism" was on 163 of 490 books; with raw scores "Ethnic diversity" took over (98 books); with per-theme normalisation no theme is on more than 15 books. 235 books get themes; 203 have no usable description and 52 had no theme that stood out, and all of these are shown as "not tagged yet" rather than guessed. Report the tagger as a first pass that teachers correct, not as ground truth.

**(b) Thematic relevance (human judgments).** This answers research question iv.
1. Run `evaluate.py pool --models …` to produce a shuffled sheet of the top 10 from every system for the 30 queries in `queries.csv`, which include 5 in Kiswahili.
2. Have 2–3 people (ideally teachers) mark each book 0/1/2 without knowing which system found it.
3. Run `evaluate.py score rater1.csv rater2.csv`.
4. Report nDCG@10, P@5, MRR per system and Cohen's kappa between raters.

Thirty queries and two raters is a reasonable scope for a BSc project; say so.

### Table 5.1 test cases

| Test | Problem | Fix |
|---|---|---|
| TC006 CBC dashboard | The CBC mappings were generated at random by `generate_sample_cbc_data.py` (random grade, learning area, strand and competency per book). The test "passed" only because the UI displayed what was in the table. | Say this plainly: "The first version used randomly generated sample alignments to test the interface; these were removed. Alignments are now either teacher-reviewed (with reviewer and source recorded) or clearly labelled content-based suggestions." Re-test against the new behaviour. |
| TC008 Admin edits reflected in search | False for the original code: the index was built once from the CSV and the Flask create/update/delete endpoints did nothing. | Re-test with the new flow: edit in Supabase → `POST /api/admin/reindex` → search shows the change. |
| TC005 Recommendation for a selected book | The frontend sent Supabase UUIDs but the backend looked up CSV row numbers, so recommendations were likely empty for real books. | Re-test. Books now share one UUID across API and database, and `tests/test_api.py` covers this. |
| TC009 Performance | "< 2 seconds" is a loose bar. | Report the measured median and 95th-percentile latency. |
| TC013 Data integrity "514 unique entries" | Wrong count. | 490 after de-duplication (see 5.3.1). |
| TC012 Nonsense query | Previously FAISS always returned the nearest books, even for "xyz123". | Now covered by an automated test (`test_nonsense_query_returns_nothing`). |
| All | Every row says Pass. | Add a column for the evidence (screenshot, automated test name). Keep the failures you found and fixed; they show real testing. Mention the automated suite: `pytest backend/tests` (16 tests). |

### Headings

- 5.3.3.3 is titled "Description of Testing and Validation" but describes the Book Details page. Rename it "Book Details Page".
- 5.3.3.5 and 5.3.3.6 are both titled "Admin Module"; 5.3.3.5 is the CBC dashboard. Rename 5.3.3.5 "CBC Reading Finder".
- 5.3.2 heading: "NLP Pipline" → "NLP Pipeline".
- 5.2.1: the model is about 90 MB (MiniLM-L6) or about 470 MB (multilingual MiniLM-L12), not "400MB+" for MiniLM-L6.

## Chapter 6: Conclusions

| Where | Problem | Fix |
|---|---|---|
| 6.1 | "successfully developed and validated", "robust, scalable prototype" | Tie each claim to a result: "Hybrid search found the right book first for 93% of exact-title queries…", plus the relevance scores once judged. Name what's still weak: sparse descriptions, few Kiswahili records, teacher review of CBC alignments not yet done. |
| 6.2 | Recommending that institutions integrate the platform now | Soften to "after a pilot with teachers". |
| 6.3 | Future works | Add: (1) ingest openly licensed full texts (African Storybook, StoryWeaver) so readers can read in the app; (2) teacher review workflow for CBC alignments; (3) calibrate the theme threshold against human labels; (4) collaborative filtering once enough ratings exist, which is where your BERT4Rec review becomes relevant. |

## References

- Readow and Amazon precision figures: add sources or remove the numbers (see Chapter 2).
- Make sure every in-text citation has an entry, and vice versa. "Vaswani et al., 2023" is the arXiv revision date; the paper is usually cited as 2017.
- If you add African Storybook, eKitabu or the Kenya Copyright Act, add them here.
