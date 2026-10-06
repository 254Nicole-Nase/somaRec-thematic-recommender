-- Search vectors for the somarec-api Edge Function.
-- Kept out of public.books so `select *` from the website stays small.
-- Only the Edge Function (service role) reads and writes this table; it embeds
-- each book with Supabase's built-in gte-small model and re-embeds when the
-- text it was computed from changes (text_hash).
create extension if not exists vector with schema extensions;

create table if not exists public.book_embeddings (
  book_id uuid primary key references public.books(id) on delete cascade,
  embedding extensions.vector(384) not null,
  model text not null,
  text_hash text not null,
  updated_at timestamptz not null default now()
);

alter table public.book_embeddings enable row level security;
-- No policies: anon and signed-in users get nothing; the service role bypasses RLS.
