-- A book can be in each of a user's lists (or their default library, list_id null) only once.
-- Saving twice used to insert a second row.

-- Keep the earliest row of any duplicates.
delete from public.reading_lists newer
using public.reading_lists older
where newer.book_id is not null
  and newer.user_id = older.user_id
  and newer.book_id = older.book_id
  and newer.list_id is not distinct from older.list_id
  and (newer.added_at, newer.id) > (older.added_at, older.id);

create unique index if not exists reading_lists_one_book_per_list
  on public.reading_lists (user_id, list_id, book_id) nulls not distinct
  where book_id is not null;
