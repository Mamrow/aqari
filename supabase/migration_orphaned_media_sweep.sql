-- Aqari — find listing-photos objects nothing references any more, so
-- lifecycle-cron can delete them.
--
-- Every path that removes a listing or an account already tries to remove its
-- media, but several can't guarantee it:
-- - an owner deleting a listing cleans up from the phone (removeListingMedia),
--   best-effort — a dropped connection or a killed app leaves the files;
-- - an admin deleting someone else's listing can't clean up at all: storage
--   RLS only lets the uploader delete an object;
-- - photos removed while editing a listing, and a replaced profile photo,
--   were never removed by anything;
-- - uploads from a listing that was never submitted (the files go up before
--   the row is inserted) have no row to find them from.
-- In September 2026 that had left 150 of the bucket's 170 files (147 MB)
-- unreferenced. Rather than patch each path, lifecycle-cron sweeps whatever
-- no listing or profile points at, once a day.
--
-- The edge function can't list the bucket with created_at through the
-- Storage API in one go, and the storage schema isn't exposed over REST, so
-- this function answers the question in SQL. Deletion itself still goes
-- through the Storage API: SQL deletes from storage.objects are blocked by
-- Supabase's protect_objects_delete trigger, and would leave the files behind
-- anyway.
--
-- p_min_age keeps files that are still being attached: a listing's photos
-- upload before its row is inserted, so a just-uploaded file is unreferenced
-- for the length of the form.
--
-- Matching is exact on the object path taken out of the public URL (query
-- string stripped) — the same parsing as uploadImage.js's storagePathFromUrl
-- — so a URL that doesn't parse counts as "not ours" and never protects or
-- condemns anything by accident.

create or replace function public.orphaned_listing_media(p_min_age interval default interval '1 day')
returns table (name text, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  with referenced as (
    select split_part(split_part(img, '/storage/v1/object/public/listing-photos/', 2), '?', 1) as path
    from public.listings l, unnest(l.images) as img
    where img like '%/storage/v1/object/public/listing-photos/%'
    union
    select split_part(split_part(p.avatar_url, '/storage/v1/object/public/listing-photos/', 2), '?', 1)
    from public.profiles p
    where p.avatar_url like '%/storage/v1/object/public/listing-photos/%'
  )
  select o.name, o.created_at
  from storage.objects o
  where o.bucket_id = 'listing-photos'
    and o.created_at < now() - p_min_age
    and not exists (select 1 from referenced r where r.path = o.name)
  order by o.created_at;
$$;

-- Service role only (lifecycle-cron). It reveals every unreferenced object
-- name, so no app caller gets it.
revoke execute on function public.orphaned_listing_media(interval) from public, anon, authenticated;
grant execute on function public.orphaned_listing_media(interval) to service_role;
