# SomaRec product roadmap: Goodreads for Kenyan books, with a legal free library

## The idea

A place to **discover, track, discuss and (where legal) read** Kenyan books and books by Kenyan authors, organised by what they're *about*, not just by title.

It combines three things:

| Like… | SomaRec version |
|---|---|
| **Goodreads** | shelves (want to read / reading / read), ratings, reviews, author pages, "readers also liked" |
| **A free digital library** | read in the app, but only openly licensed or public-domain texts, plus links out to buy or borrow everything else |
| **Something new** | thematic discovery ("books about land and displacement", "hadithi za watoto") and a teacher view mapped to the CBC |

## Z-Library: take the model, not the method

Z-Library works because it hosts copyrighted books without permission. Its domains were seized and two alleged operators were charged in the US in late 2022. Copying that model would:

- expose you personally to copyright liability. Kenya's Copyright Act protects literary works for the author's life plus 50 years, and KECOBO enforces it.
- hurt the Kenyan authors and publishers the project is meant to celebrate.
- make schools, libraries, publishers and universities unable to partner with you.

What you can offer legally, and it's still a lot:

1. **Openly licensed books, readable in the app.** African Storybook publishes thousands of short illustrated stories under Creative Commons licences, many in Kiswahili, Gikuyu, Dholuo, Luhya, Kalenjin and other Kenyan languages. StoryWeaver and Global Digital Library hold more. These are ideal for teachers and young readers, and the data model already supports them (`access_type = 'read'` requires a recorded `license`).
2. **Public-domain works.** Only works whose authors died more than 50 years ago. There are few for modern Kenyan literature, so this is a small set.
3. **Publisher-approved previews and excerpts.** Ask publishers (e.g. East African Educational Publishers, Longhorn, KLB, Moran, Storymoja) for sample chapters. It's free marketing for them.
4. **"Get this book" links.** Libraries (KNLS, university catalogues, WorldCat), Kenyan bookshops and e-book platforms such as eKitabu. Affiliate links can later fund the project.
5. **Author-submitted works.** Self-published Kenyan authors upload their own work and choose a licence.

## Who it's for

| User | Job to be done | Must-have features |
|---|---|---|
| **Book lover / general reader** | "Find me a good Kenyan book I'll enjoy, and track what I read" | Search by theme or mood; shelves; ratings and reviews; "readers also liked"; author pages; where to get the book |
| **Student** | "Find a book for my assignment on corruption / identity / colonialism, and understand it" | Thematic search; summaries and themes; set-book pages; discussion |
| **Teacher** | "Find suitable Kenyan texts for my class and plan lessons" | CBC reading finder (learning area, competency, level); teacher-reviewed badge; export lesson plan; class reading lists |
| **Author / publisher** (later) | "Get my book discovered" | Claim author page; add description, cover and links; upload excerpts |

Start with **teachers and book lovers**. Teachers bring whole classes, and book lovers write the reviews that make the site useful for everyone else.

## What exists now (this repository)

- Clean catalog of 490 works / 113 authors with stable IDs (`backend/pipeline/build_catalog.py`).
- Hybrid search (keyword + multilingual embeddings), "similar books", "more by this author".
- Automatic theme tagging with a confidence threshold.
- Shelves / reading lists (Supabase), ratings and reviews (new `reviews` table).
- "Where to find it" links on every book, and in-app "Read free" support for openly licensed books.
- CBC reading finder with teacher-reviewed vs suggested alignments, and lesson plan export.
- Evaluation harness to measure search quality.

## Roadmap

### Phase 1: Make the catalog trustworthy (next 4–6 weeks)
- [ ] Run the multilingual model locally: `pipeline/tag_themes.py`, then `upload_books_to_supabase.py --apply`.
- [ ] Fix bad descriptions. The Google Books enrichment matched some books to the wrong record. Add an admin "flag wrong description" button, and prefer Open Library work descriptions.
- [ ] Decide the inclusion rule (Kenyan author, or set in Kenya) and review the ~40 borderline records via `curation_status`.
- [ ] Recruit 2–3 teachers to review CBC alignments for the 30–50 most-taught books (KICD approved lists and set books first), and add them to `book_curriculum` with `status = 'reviewed'`.
- [ ] Run the human relevance evaluation (`evaluation/evaluate.py pool` / `score`).

### Phase 2: Real reading (6–10 weeks)
- [ ] Import African Storybook / StoryWeaver titles for Kenyan languages, with licence and attribution recorded per book.
- [ ] Simple reader for those texts: mobile-first, works on slow connections, offline download.
- [ ] Language filter and browse pages for Kiswahili and each Kenyan language.

### Phase 3: Community (Goodreads layer)
- [ ] Public profiles and "currently reading".
- [ ] Book clubs and class groups: a teacher creates a class, students join with a code, and the teacher sees reading progress.
- [ ] Review moderation (report button, admin queue).
- [ ] Reading challenges ("Read 12 Kenyan books in 2027").

### Phase 4: Personalisation
- [ ] Once there are a few thousand ratings, add collaborative filtering ("readers like you also rated…"). Keep content-based search for new books with no ratings (cold start).
- [ ] Personal recommendations from shelves: an average of the embeddings of books the user rated highly.

### Phase 5: Reach
- [ ] WhatsApp / SMS bot: "send a theme, get three book suggestions".
- [ ] Partnerships: KNLS, county libraries, school clubs, publishers.
- [ ] Author pages that authors can claim.

## How to know it's working

| Metric | Why it matters |
|---|---|
| Search success: % of searches followed by opening a book | Are results useful? |
| nDCG@10 on the judged query set (offline) | Is search quality improving release to release? |
| Weekly active readers; books shelved per user | Is the Goodreads layer being used? |
| Reviews written per week | Community health |
| Teachers with at least one exported lesson plan | Teacher value |
| % of catalog with a real description / reviewed CBC alignment | Catalog quality |

## Keeping it sustainable

- **Costs are low.** Supabase free tier, a small Python host for the search API, and a static frontend host.
- **Revenue options, later:** bookshop affiliate links, paid school accounts (class management, reports), publisher promotion clearly marked as sponsored.
- **Never:** sell reader data, or host copyrighted books without permission.

## Risks

| Risk | Mitigation |
|---|---|
| Wrong metadata or themes erode trust | Show "auto-detected" labels; let users flag errors; editor review queue |
| CBC mapping mistakes | Only teacher-reviewed alignments claim a level; suggestions are labelled |
| Copyright complaints | Only host openly licensed / permitted texts; takedown contact on every page |
| Low engagement | Start with teachers (they bring classes); seed reviews from a book club |
| Model doesn't handle Kenyan languages beyond Kiswahili | Rely on keyword search plus human tagging for Gikuyu, Dholuo, etc.; evaluate before claiming support |
