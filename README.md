# SomaRec: discover Kenyan books by what they're about

SomaRec helps readers, students and teachers find Kenyan books and books by Kenyan authors. You can search by theme ("stories about land and displacement", "hadithi za watoto"), keep shelves, rate and review books, and find books for a CBC learning area.

- **Readers:** thematic search, "similar books", "more by this author", shelves, ratings and reviews, and links to where each book can be read, borrowed or bought.
- **Teachers:** a CBC reading finder that separates **teacher-reviewed** alignments from **content-based suggestions**, and exports lesson plans.
- **Admins:** manage book metadata and users; reindex search after edits.

See [docs/PRODUCT_ROADMAP.md](docs/PRODUCT_ROADMAP.md) for where the product is going, and [docs/REPORT_REVISIONS.md](docs/REPORT_REVISIONS.md) for the review of the project report.

## Architecture

```
React (Vite) SPA ──► Supabase      auth, books, reading lists, reviews, CBC alignments (RLS)
        │
        └──────────► Flask search API (backend/)
                       catalog (CSV or Supabase)
                       ├─ BM25 keyword index         exact titles/authors, accent-folded
                       ├─ multilingual embeddings    meaning; FAISS exact inner-product search
                       ├─ Reciprocal Rank Fusion     combines the two
                       ├─ theme tagger               zero-shot, thresholded
                       └─ CBC suggestions            labelled as suggestions
```

Every book has one stable UUID, derived from its normalised title and author. The API, Supabase, reading lists and reviews all use it.

## Data

| File | What it is |
|---|---|
| `backend/data/kenyan_works_augmented.csv` | Raw harvest (Wikidata, Open Library, Google Books), produced by `part5.ipynb` |
| `backend/data/catalog.csv` | Cleaned catalog: 490 works, 113 authors, stable ids. Built by `backend/pipeline/build_catalog.py` |
| `backend/data/themes.csv` | The 59 themes, each with a short description used for tagging |
| `backend/data/cbc_alignment.csv` | Teacher-reviewed CBC alignments (only rows with `status=reviewed` are served) |

Known gaps: 41% of works have little or no description; language is guessed for many records (labelled `language_source=guessed`); some Google Books descriptions belong to a different edition.

## Setup

### 1. Frontend
```sh
npm install
cp .env.example .env      # fill in VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
npm run dev               # http://localhost:3000
```

### 2. Database
Run the files in `supabase/migrations/` in filename order, either with `supabase db push` or in the SQL editor:
1. `…_base_schema.sql` creates profiles (with a sign-up trigger), books, themes, reading lists and CBC alignment tables, all with RLS. It is safe on a project that already has them.
2. `…_catalog_reviews_cbc.sql` adds catalog columns to `books` (language, themes, access type/licence …), creates `reviews`, and adds `status`/`source`/`reviewed_by` to `book_curriculum`. **It deletes the old randomly generated CBC rows.**
3. `…_security_hardening.sql` moves `is_admin()` out of the public API and tightens policies. It fixes the Supabase advisor warnings.

To make yourself an admin after signing up, run `update public.profiles set is_admin = true where email = 'you@example.com';` in the SQL editor.

Then sync the catalog:
```sh
python backend/upload_books_to_supabase.py          # dry run
python backend/upload_books_to_supabase.py --apply
```
Books already in Supabase keep their ids and get updated metadata. If your database had books before this change, set `SOMAREC_CATALOG_SOURCE=supabase` so the API serves the same ids.

### 3. Search API
```sh
cd backend
pip install -r requirements-dev.txt
python pipeline/build_catalog.py      # rebuild catalog.csv from the raw harvest
python pipeline/tag_themes.py         # optional: re-tag themes with the multilingual model
python app.py                         # http://localhost:5000
```
The first start downloads the embedding model (`SOMAREC_EMBED_MODEL`) and caches book embeddings in `backend/.cache/`. If the model can't be loaded, the API falls back to keyword search; `/api/health` shows the active mode.

### 4. Tests
```sh
cd backend && pytest -q
```

## API

| Method | Path | Notes |
|---|---|---|
| GET | `/api/health` | mode (hybrid/keyword), model, counts |
| GET | `/api/search?q=&top_k=&mode=&language=&theme=` | `mode` = hybrid (default), keyword, dense |
| GET | `/api/books` `?language=&theme=` | all books |
| GET | `/api/books/<id>` | one book, including `where_to_find` links |
| GET | `/api/books/<id>/similar?top_k=&exclude_same_author=1` | content-based recommendations |
| GET | `/api/books/<id>/by-author` | more by the same author |
| GET | `/api/recommend?book_id=` | legacy alias of `/similar` |
| GET | `/api/themes`, `/api/themes/stats`, `/api/languages` | filter values |
| GET | `/api/cbc/options` | CBC levels, learning areas, competencies/values |
| GET | `/api/cbc?learning_area=&focus=&level=` | `{reviewed: [...], suggested: [...]}` |
| POST | `/api/admin/reindex` | header `Authorization: Bearer $SOMAREC_ADMIN_TOKEN` |

## Evaluating search quality

`backend/evaluation/evaluate.py` compares TF-IDF, BM25, dense-only, hybrid, and the original MiniLM + IVF setup.

```sh
# automatic: can each system find a known book from its title / a phrase?
python backend/evaluation/evaluate.py known-item \
  --models all-MiniLM-L6-v2 sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2 \
  --original all-MiniLM-L6-v2

# human judgments for the 30 realistic queries in evaluation/queries.csv
python backend/evaluation/evaluate.py pool --models sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2
#   -> raters fill in relevance 0/1/2 in copies of judgments_template.csv
python backend/evaluation/evaluate.py score judgments_rater1.csv judgments_rater2.csv
```

Keyword-only results (no model) are in `backend/evaluation/results_known_item_offline.md`.

## Content and copyright

SomaRec only offers in-app reading for openly licensed or public-domain texts. The database enforces this: `access_type='read'` requires a licence. Every other book links out to libraries and shops.

## Credits

- UI/UX design: [Figma wireframes](https://www.figma.com/design/INGtyIHdCE0UyVRezrDxWc/High-Fidelity-Wireframes-for-SomaRec)
- Project owner: 254Nicole-Nase

[![Review Assignment Due Date](https://classroom.github.com/assets/deadline-readme-button-22041afd0340ce965d47ae6ef1cefeee28c7c493a6346c4f15d667ab976d596c.svg)](https://classroom.github.com/a/blswXyO9)
