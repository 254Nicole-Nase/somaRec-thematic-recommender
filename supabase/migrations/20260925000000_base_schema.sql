-- SomaRec base schema: the tables the frontend uses.
-- Earlier versions of the app created these by hand in the Supabase dashboard;
-- this migration makes a fresh project reproducible. Safe to re-run.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Profiles (one per auth user) and admin helpers
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  name text,
  role text not null default 'reader' check (role in ('reader', 'admin')),
  is_admin boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_active timestamptz
);

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false);
$$;

-- Create a profile when someone signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'name', new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Non-admins may edit their own profile but not grant themselves privileges.
create or replace function public.protect_profile_privileges()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() and auth.uid() is not null then
    new.is_admin := old.is_admin;
    new.role := old.role;
    new.is_active := old.is_active;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists protect_profile_privileges on public.profiles;
create trigger protect_profile_privileges
  before update on public.profiles
  for each row execute function public.protect_profile_privileges();

alter table public.profiles enable row level security;

drop policy if exists "Profiles: read own or admin" on public.profiles;
create policy "Profiles: read own or admin" on public.profiles
  for select to authenticated using (id = auth.uid() or public.is_admin());

drop policy if exists "Profiles: update own or admin" on public.profiles;
create policy "Profiles: update own or admin" on public.profiles
  for update to authenticated using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

-- Used by the admin Users page.
create or replace function public.update_user_status(user_id uuid, active boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can change user status';
  end if;
  update public.profiles set is_active = active, updated_at = now() where id = user_id;
end;
$$;

revoke execute on function public.update_user_status(uuid, boolean) from public, anon;
grant execute on function public.update_user_status(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Books
-- ---------------------------------------------------------------------------
create table if not exists public.books (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  author text,
  description text,
  cover_url text,
  published_year integer,
  isbn10 text,
  isbn13 text,
  genre text,
  status text not null default 'published',
  legacy_item_id integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists books_title_idx on public.books (title);
create index if not exists books_author_idx on public.books (author);

alter table public.books enable row level security;

drop policy if exists "Books are public" on public.books;
create policy "Books are public" on public.books for select using (true);

drop policy if exists "Admins manage books" on public.books;
create policy "Admins manage books" on public.books
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Themes
-- ---------------------------------------------------------------------------
create table if not exists public.themes (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text
);

alter table public.themes enable row level security;

drop policy if exists "Themes are public" on public.themes;
create policy "Themes are public" on public.themes for select using (true);

drop policy if exists "Admins manage themes" on public.themes;
create policy "Admins manage themes" on public.themes
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Reading lists. One table holds both:
--   * named lists       (name set, book_id null)
--   * saved-book rows   (book_id set; list_id null = default "My Library")
-- ---------------------------------------------------------------------------
create table if not exists public.reading_lists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text,
  description text,
  is_public boolean not null default false,
  book_id uuid references public.books(id) on delete cascade,
  list_id uuid references public.reading_lists(id) on delete cascade,
  status text check (status in ('to-read', 'reading', 'completed')),
  added_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists reading_lists_user_idx on public.reading_lists (user_id);
create index if not exists reading_lists_list_idx on public.reading_lists (list_id);
create index if not exists reading_lists_book_idx on public.reading_lists (book_id);

alter table public.reading_lists enable row level security;

drop policy if exists "Reading lists: own rows" on public.reading_lists;
create policy "Reading lists: own rows" on public.reading_lists
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "Reading lists: public lists are visible" on public.reading_lists;
create policy "Reading lists: public lists are visible" on public.reading_lists
  for select using (is_public and book_id is null);

-- ---------------------------------------------------------------------------
-- CBC alignment
-- ---------------------------------------------------------------------------
create table if not exists public.book_curriculum (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books(id) on delete cascade,
  grade text,
  learning_area text,
  strand text,
  sub_strand text,
  competencies text[],
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists book_curriculum_book_idx on public.book_curriculum (book_id);

alter table public.book_curriculum enable row level security;

drop policy if exists "Curriculum is public" on public.book_curriculum;
create policy "Curriculum is public" on public.book_curriculum for select using (true);

drop policy if exists "Admins manage curriculum" on public.book_curriculum;
create policy "Admins manage curriculum" on public.book_curriculum
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
