-- SomaRec: catalog metadata, reader reviews, and honest CBC alignment.
-- Run in the Supabase SQL editor (or `supabase db push`). Safe to re-run.

-- ---------------------------------------------------------------------------
-- 1. Books: fields the cleaned catalog provides (backend/data/catalog.csv)
-- ---------------------------------------------------------------------------
alter table public.books add column if not exists language text;
alter table public.books add column if not exists language_source text;      -- 'metadata' | 'guessed'
alter table public.books add column if not exists themes text[] not null default '{}';
alter table public.books add column if not exists theme_source text;         -- 'model' | 'legacy_top3' | 'curated'
alter table public.books add column if not exists publisher text;
alter table public.books add column if not exists ol_work_key text;
alter table public.books add column if not exists source text;
alter table public.books add column if not exists curation_status text not null default 'unreviewed';
-- 'find' = metadata only, link out to libraries/shops. 'read' = openly licensed full text.
alter table public.books add column if not exists access_type text not null default 'find';
alter table public.books add column if not exists access_url text;
alter table public.books add column if not exists license text;

do $$ begin
  alter table public.books add constraint books_access_type_check check (access_type in ('find', 'read'));
exception when duplicate_object then null; end $$;

do $$ begin
  -- A 'read' link is only allowed with a recorded open licence (e.g. CC BY 4.0, public domain).
  alter table public.books add constraint books_read_needs_license
    check (access_type <> 'read' or (license is not null and access_url is not null));
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- 2. Reviews and ratings (Goodreads-style)
-- ---------------------------------------------------------------------------
create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  display_name text,
  rating smallint not null check (rating between 1 and 5),
  body text check (char_length(body) <= 4000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (book_id, user_id)
);

create index if not exists reviews_book_id_idx on public.reviews (book_id);

alter table public.reviews enable row level security;

drop policy if exists "Reviews are public" on public.reviews;
create policy "Reviews are public" on public.reviews
  for select using (true);

drop policy if exists "Users write their own reviews" on public.reviews;
create policy "Users write their own reviews" on public.reviews
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "Users edit their own reviews" on public.reviews;
create policy "Users edit their own reviews" on public.reviews
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users delete their own reviews" on public.reviews;
create policy "Users delete their own reviews" on public.reviews
  for delete to authenticated using (auth.uid() = user_id);

create or replace view public.book_rating_summary as
  select book_id, count(*)::int as ratings, round(avg(rating)::numeric, 2) as average_rating
  from public.reviews
  group by book_id;

-- ---------------------------------------------------------------------------
-- 3. CBC alignment: every row says whether a teacher reviewed it
-- ---------------------------------------------------------------------------
alter table public.book_curriculum add column if not exists level text;
alter table public.book_curriculum add column if not exists focus text;
alter table public.book_curriculum add column if not exists status text not null default 'suggested';
alter table public.book_curriculum add column if not exists source text;
alter table public.book_curriculum add column if not exists reviewed_by text;
alter table public.book_curriculum add column if not exists reviewed_on date;

do $$ begin
  alter table public.book_curriculum add constraint book_curriculum_status_check
    check (status in ('reviewed', 'suggested'));
exception when duplicate_object then null; end $$;

-- Remove the randomly generated rows created by the old generate_sample_cbc_data.py.
-- They assigned grades, learning areas and competencies at random, so none of them
-- can be trusted. Every one of them has a note starting with 'Sample alignment for'.
delete from public.book_curriculum where notes like 'Sample alignment for %';
