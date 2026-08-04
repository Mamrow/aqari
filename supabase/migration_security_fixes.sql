-- Aqari — security-audit follow-up migration.
-- Run this once against the existing live project (SQL Editor → New query →
-- paste → Run). schema.sql has already been updated to match, for anyone
-- provisioning a fresh project from scratch — this file is only for bringing
-- an already-running database up to date. Safe to re-run (every statement is
-- idempotent).

-- 1) Rate-limit the unauthenticated "forgot password" phone→email lookup.
-- RLS on with zero policies, same defense-in-depth pattern as private.admins
-- above: the private schema is already unreachable via PostgREST (not in the
-- exposed-schemas list), but this blocks direct table access too in case
-- that config ever changes. get_reset_email_for_phone still works fine —
-- SECURITY DEFINER functions run as the function's owner, which bypasses RLS.
create table if not exists private.password_reset_attempts (
  phone text not null,
  requested_at timestamptz not null default now()
);

alter table private.password_reset_attempts enable row level security;

create or replace function public.get_reset_email_for_phone(p_phone text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  recent_count int;
  result_email text;
begin
  select count(*) into recent_count
  from private.password_reset_attempts
  where phone = p_phone and requested_at > now() - interval '15 minutes';

  if recent_count >= 5 then
    return null;
  end if;

  insert into private.password_reset_attempts (phone) values (p_phone);

  select email into result_email from profiles where phone = p_phone;
  return result_email;
end;
$$;

grant execute on function public.get_reset_email_for_phone(text) to anon, authenticated;

-- 2) Only agent accounts may submit listings (was previously enforced only
--    in the UI, not the database).
drop policy if exists "signed-in sessions can submit their own listing" on listings;
drop policy if exists "agent sessions can submit their own listing" on listings;
create policy "agent sessions can submit their own listing" on listings for insert
  with check (
    auth.uid() is not null
    and owner_id = auth.uid()
    and exists (select 1 from profiles where auth_uid = auth.uid() and role = 'agent')
  );

-- 3) Explicit WITH CHECK on listings update (previously only USING, which
--    would have allowed an owner to reassign owner_id away from themselves).
drop policy if exists "owner or admin can update listings" on listings;
create policy "owner or admin can update listings" on listings for update
  using (owner_id = auth.uid() or private.is_admin())
  with check (owner_id = auth.uid() or private.is_admin());

-- 4) Favorites: scope to the real account that saved each row, not just
--    "any signed-in session" (which let any account read/delete anyone
--    else's saved-listings list).
alter table favorites add column if not exists owner_id uuid;
drop policy if exists "signed-in sessions manage favorites" on favorites;
drop policy if exists "own account manages favorites" on favorites;
create policy "own account manages favorites" on favorites for all
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- 5) Agents: only the owning account may register/update its own directory
--    entry (previously any signed-in session could edit any agent's entry).
alter table agents add column if not exists owner_id uuid;
drop policy if exists "signed-in sessions can register/update agents" on agents;
drop policy if exists "signed-in sessions can update agents" on agents;
drop policy if exists "own account can register as agent" on agents;
drop policy if exists "own account can update its agent entry" on agents;
create policy "own account can register as agent" on agents for insert
  with check (auth.uid() is not null and owner_id = auth.uid());
create policy "own account can update its agent entry" on agents for update
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- 6) Storage: only the uploading account may update/delete its own
--    photos/videos/avatars (previously any signed-in session could overwrite
--    or delete anyone's files in the shared bucket). owner_id is
--    auto-populated by Storage from the uploader's JWT, not client-supplied.
drop policy if exists "signed-in sessions update listing photos" on storage.objects;
drop policy if exists "signed-in sessions delete listing photos" on storage.objects;
drop policy if exists "owner can update their listing photos" on storage.objects;
drop policy if exists "owner can delete their listing photos" on storage.objects;
create policy "owner can update their listing photos" on storage.objects for update
  using (bucket_id = 'listing-photos' and owner_id = (auth.uid())::text);
create policy "owner can delete their listing photos" on storage.objects for delete
  using (bucket_id = 'listing-photos' and owner_id = (auth.uid())::text);

-- 7) Foreign keys from owner_id/auth_uid to auth.users(id), so deleting an
--    account from the Dashboard cleans up its dependent rows instead of
--    leaving them behind with a dangling reference. This is the real fix for
--    a bug already hit once in practice: deleting an auth user left its
--    profiles row behind with a stale auth_uid, and a later signup's
--    profiles upsert then failed RLS because the leftover row's auth_uid
--    didn't match the new account. Orphans from before this migration are
--    cleaned up first so the constraints can actually be added.
-- NULL owner_id/auth_uid is fine and left as-is (e.g. favorites/agents rows
-- that predate the owner_id column) — the FK constraints below only ever
-- reject a non-null value that doesn't match an existing auth.users row.
delete from profiles where auth_uid is not null and auth_uid not in (select id from auth.users);
update listings set owner_id = null where owner_id is not null and owner_id not in (select id from auth.users);
update favorites set owner_id = null where owner_id is not null and owner_id not in (select id from auth.users);
update agents set owner_id = null where owner_id is not null and owner_id not in (select id from auth.users);

alter table profiles drop constraint if exists profiles_auth_uid_fkey;
alter table profiles add constraint profiles_auth_uid_fkey
  foreign key (auth_uid) references auth.users(id) on delete cascade;

alter table listings drop constraint if exists listings_owner_id_fkey;
alter table listings add constraint listings_owner_id_fkey
  foreign key (owner_id) references auth.users(id) on delete set null;

alter table favorites drop constraint if exists favorites_owner_id_fkey;
alter table favorites add constraint favorites_owner_id_fkey
  foreign key (owner_id) references auth.users(id) on delete cascade;

alter table agents drop constraint if exists agents_owner_id_fkey;
alter table agents add constraint agents_owner_id_fkey
  foreign key (owner_id) references auth.users(id) on delete cascade;

-- Notes on existing rows:
--  - Rows in favorites/agents created before this migration have owner_id =
--    NULL, so they'll no longer be editable/deletable by their original
--    account (only admin, via the SQL Editor / service role, can touch them
--    going forward) — same accepted tradeoff already made for listings.owner_id
--    earlier in this project. Low-stakes for favorites (heart-icon saves);
--    for agents, affected users can just re-trigger the self-service upsert
--    (re-save their profile as an agent) to re-stamp owner_id on their entry.
