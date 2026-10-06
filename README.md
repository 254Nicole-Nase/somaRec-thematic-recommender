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

## Deployment

Everything runs on free tiers, deployed from `main`:

| Part | Host | How |
|---|---|---|
| Website (React) | Vercel | Import the GitHub repo in Vercel; it redeploys on every push. `vercel.json` sets the build. |
| Search API | Supabase Edge Function `somarec-api` | `supabase/functions/somarec-api/`; `.github/workflows/deploy-functions.yml` deploys it when it changes. |
| Data, accounts, reviews | Supabase (Postgres) | `supabase/migrations/` |

The Edge Function serves the same `/api/*` routes as `backend/app.py`, ported to TypeScript (`engine.ts`, tested against the Python engine). It uses Supabase's built-in **gte-small** embedding model, which is English-only: Kiswahili queries are matched by keywords, not by meaning. Book vectors are stored in `book_embeddings`; new or edited books are embedded automatically, a few per request.

The Flask API in `backend/` is still the reference implementation for local development, evaluation and the data pipeline. `backend/Dockerfile` can run it on any container host that offers about 1 GB of RAM.

**One-time setup**
1. Vercel → Add New → Project → import this repo. Add these environment variables:
   - `VITE_SUPABASE_URL` = `https://<project-ref>.supabase.co`
   - `VITE_SUPABASE_ANON_KEY` = the publishable key
   - `VITE_API_URL` = `https://<project-ref>.supabase.co/functions/v1/somarec-api`
2. Supabase → Authentication → URL Configuration: set the Site URL to your Vercel address, so sign-up emails link to the live site.
3. To let GitHub redeploy the search function, create a token at supabase.com/dashboard/account/tokens. Save it as the `SUPABASE_ACCESS_TOKEN` repository secret. Manual alternative: `supabase functions deploy somarec-api --no-verify-jwt`.

**Google / GitHub sign-in (optional).** Email sign-up works out of the box. To add "Sign in with Google":
1. In Google Cloud Console → APIs & Services → Credentials, create an *OAuth client ID* (type: Web application). Add `https://<project-ref>.supabase.co/auth/v1/callback` as the authorised redirect URI.
2. In Supabase → Authentication → Sign In / Providers → Google, switch it on and paste the client ID and secret.
3. In Supabase → Authentication → URL Configuration, add your site addresses (e.g. `https://somarec.vercel.app/**`) to the redirect URLs.
4. In Vercel, set `VITE_AUTH_PROVIDERS=google`, then redeploy. The button appears only for providers listed there. GitHub works the same way, using a GitHub OAuth App.

Free Supabase projects pause after a week with no activity; restore them from the dashboard.

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

Results with the models are in `backend/evaluation/results_known_item.md` (summary and interpretation in `docs/REPORT_REVISIONS.md`, section 5.4). `backend/evaluation/judgments_template.csv` is the sheet for raters, already generated.

## Content and copyright

SomaRec only offers in-app reading for openly licensed or public-domain texts. The database enforces this: `access_type='read'` requires a licence. Every other book links out to libraries and shops.

## Credits

- UI/UX design: [Figma wireframes](https://www.figma.com/design/INGtyIHdCE0UyVRezrDxWc/High-Fidelity-Wireframes-for-SomaRec)
- Project owner: 254Nicole-Nase

[![Review Assignment Due Date](https://classroom.github.com/assets/deadline-readme-button-22041afd0340ce965d47ae6ef1cefeee28c7c493a6346c4f15d667ab976d596c.svg)](https://classroom.github.com/a/blswXyO9)
