-- Fixes from the Supabase security and performance advisors.
--  * is_admin() moves to a schema the REST API does not expose, so it is no
--    longer callable as /rest/v1/rpc/is_admin.
--  * Trigger functions cannot be called directly by API roles.
--  * auth.uid() / is_admin() are wrapped in (select ...) so Postgres evaluates
--    them once per query instead of once per row.
--  * Admin "for all" policies are split per command so SELECT has one policy.
-- Safe to re-run.

create schema if not exists private;
grant usage on schema private to authenticated;

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select is_admin from public.profiles where id = (select auth.uid())), false);
$$;

revoke all on function private.is_admin() from public, anon;
grant execute on function private.is_admin() to authenticated;

-- Functions that used public.is_admin() --------------------------------------
create or replace function public.protect_profile_privileges()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and not private.is_admin() then
    new.is_admin := old.is_admin;
    new.role := old.role;
    new.is_active := old.is_active;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.update_user_status(user_id uuid, active boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not private.is_admin() then
    raise exception 'Only admins can change user status';
  end if;
  update public.profiles set is_active = active, updated_at = now() where id = user_id;
end;
$$;

-- Trigger functions are never called through the API.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.protect_profile_privileges() from public, anon, authenticated;
-- The admin Users page calls this; it checks is_admin itself.
revoke execute on function public.update_user_status(uuid, boolean) from public, anon;
grant execute on function public.update_user_status(uuid, boolean) to authenticated;

-- Profiles --------------------------------------------------------------------
drop policy if exists "Profiles: read own or admin" on public.profiles;
create policy "Profiles: read own or admin" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or (select private.is_admin()));

drop policy if exists "Profiles: update own or admin" on public.profiles;
create policy "Profiles: update own or admin" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()) or (select private.is_admin()))
  with check (id = (select auth.uid()) or (select private.is_admin()));

-- Admin-managed public tables: one public SELECT policy, admin writes per command.
do $$
declare
  t text;
  label text;
begin
  foreach t in array array['books', 'themes', 'book_curriculum'] loop
    label := case t when 'book_curriculum' then 'curriculum' else t end;
    execute format('drop policy if exists %I on public.%I', 'Admins manage ' || label, t);
    execute format('drop policy if exists %I on public.%I', 'Admins insert ' || label, t);
    execute format('drop policy if exists %I on public.%I', 'Admins update ' || label, t);
    execute format('drop policy if exists %I on public.%I', 'Admins delete ' || label, t);
    execute format('create policy %I on public.%I for insert to authenticated with check ((select private.is_admin()))',
                   'Admins insert ' || label, t);
    execute format('create policy %I on public.%I for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()))',
                   'Admins update ' || label, t);
    execute format('create policy %I on public.%I for delete to authenticated using ((select private.is_admin()))',
                   'Admins delete ' || label, t);
  end loop;
end;
$$;

-- Reading lists ---------------------------------------------------------------
drop policy if exists "Reading lists: own rows" on public.reading_lists;
drop policy if exists "Reading lists: public lists are visible" on public.reading_lists;
drop policy if exists "Reading lists: read own or public" on public.reading_lists;
drop policy if exists "Reading lists: insert own" on public.reading_lists;
drop policy if exists "Reading lists: update own" on public.reading_lists;
drop policy if exists "Reading lists: delete own" on public.reading_lists;

create policy "Reading lists: read own or public" on public.reading_lists
  for select
  using (user_id = (select auth.uid()) or (is_public and book_id is null));
create policy "Reading lists: insert own" on public.reading_lists
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "Reading lists: update own" on public.reading_lists
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "Reading lists: delete own" on public.reading_lists
  for delete to authenticated using (user_id = (select auth.uid()));

-- Reviews ---------------------------------------------------------------------
create index if not exists reviews_user_id_idx on public.reviews (user_id);

drop policy if exists "Users write their own reviews" on public.reviews;
create policy "Users write their own reviews" on public.reviews
  for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists "Users edit their own reviews" on public.reviews;
create policy "Users edit their own reviews" on public.reviews
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "Users delete their own reviews" on public.reviews;
create policy "Users delete their own reviews" on public.reviews
  for delete to authenticated using ((select auth.uid()) = user_id);

-- Nothing references the old exposed helper any more.
drop function if exists public.is_admin();
