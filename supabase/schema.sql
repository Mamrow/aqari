-- Aqari — Supabase schema
-- Run this once in your project's SQL Editor (Supabase dashboard → SQL Editor → New query → paste → Run).
--
-- Auth note: real accounts now (phone + password, no SMS cost) — the phone
-- number is registered as a hidden internal email address under the hood
-- (see src/utils/phoneAuth.js), so Supabase Auth treats it as a normal
-- email/password account while the app only ever shows/collects the phone
-- number. auth.uid() is a real, stable per-account identity now, not an
-- anonymous session — RLS below enforces against it.

create extension if not exists pgcrypto;

-- Admin allowlist — deliberately has NO policies below, so it's completely
-- inaccessible to the anon/authenticated roles (only the SQL Editor / service
-- role, which bypasses RLS, can read or write it). private.is_admin() is the
-- only sanctioned way anything else reads it, via a security-definer function.
create schema if not exists private;

create table if not exists private.admins (
  uid uuid primary key
);

alter table private.admins enable row level security;

create or replace function private.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (select 1 from private.admins where uid = auth.uid());
$$;

grant execute on function private.is_admin() to anon, authenticated;

-- Thin public wrapper — PostgREST only exposes RPCs from the public schema,
-- and we deliberately don't want to expose the `private` schema itself. Safe
-- to expose since it only ever returns a boolean, never admin list contents.
create or replace function public.am_i_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select private.is_admin();
$$;

grant execute on function public.am_i_admin() to anon, authenticated;

-- Looks up which real recovery email a phone number is registered under,
-- since profiles itself is locked to "own row only" (can't be queried by
-- phone with no session). Only ever called server-side now, by the
-- send-password-reset Edge Function (see supabase/functions) using the
-- service role — not exposed to anon/authenticated (see the revoke below),
-- since the client no longer needs to call it directly.
--
-- No caller identity to throttle against (this runs before anyone's signed
-- in), so private.password_reset_attempts tracks attempts per-phone
-- instead, in a schema PostgREST never exposes.
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

-- Deliberately NOT granted to anon/authenticated — service role (used by
-- the Edge Function) bypasses grants entirely, and the client has no
-- legitimate reason to call this directly anymore. Must revoke from PUBLIC
-- specifically, not just anon/authenticated — Postgres grants EXECUTE to
-- PUBLIC by default on a new function, and every role (including anon)
-- implicitly inherits whatever's granted to PUBLIC regardless of a
-- role-specific revoke. Confirmed the hard way: revoking from just
-- anon/authenticated first (not PUBLIC) did nothing — a live REST call to
-- the RPC as anon still returned a real email address afterward.
revoke execute on function public.get_reset_email_for_phone(text) from public;

create table if not exists listings (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  price numeric not null,
  area numeric not null,
  description text not null,
  agent_phone text not null,
  listing_type text not null check (listing_type in ('sale', 'rent', 'daily')),
  property_type text not null check (property_type in ('apartment', 'villa', 'office', 'land', 'shop', 'chalet', 'semi_finished')),
  rooms text,
  images text[] not null default '{}',
  -- Chalet/istiraha fields only; null/empty otherwise.
  amenities text[] not null default '{}',
  audience_target text check (audience_target in ('families', 'youth', 'both')),
  -- City + district keys (see src/data/districts.js: CITIES + DISTRICTS,
  -- each district scoped to a city) — plain text, not a check constraint,
  -- since the list is expected to grow over time from that file alone,
  -- without needing a schema migration each time.
  city text,
  district text,
  latitude double precision not null,
  longitude double precision not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  agent_id text not null,
  -- The real account that created this listing — RLS enforces update/delete
  -- against this, not agent_id (which is just the human-facing phone number
  -- used for "my listings" filtering in the UI and can't be trusted by itself).
  -- ON DELETE SET NULL, not CASCADE: a listing is real-world content other
  -- people browse — it should outlive the agent's account, just lose its
  -- owner link (RLS then only lets admin touch it, same as any orphan).
  owner_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists favorites (
  user_id text not null,
  listing_id uuid not null references listings(id) on delete cascade,
  -- The real account that saved this listing — RLS enforces against this,
  -- not user_id (the human-facing phone number, kept for "my saves" lookups
  -- and unchanged elsewhere in the app). CASCADE: a save is meaningless once
  -- its account is gone.
  owner_id uuid references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, listing_id)
);

-- Registered sellers: upserted whenever an account submits its first listing
-- (see AppContext.js's submitListing) — anyone can list, so this only tracks
-- who's actually listed something, not every signed-up account. Lets admin
-- see who's registered (name + phone) without deriving it from listing data.
create table if not exists agents (
  phone text primary key,
  name text not null,
  -- The real account this directory entry belongs to — RLS enforces
  -- register/update against this, not the phone itself. CASCADE: no reason
  -- to keep a directory entry for a deleted account.
  owner_id uuid references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Profile (display name + avatar + account role) per phone number — synced
-- across devices so signing in with the same phone elsewhere shows the same
-- name/photo. Covers any signed-up account (buyer or agent).
create table if not exists profiles (
  phone text primary key,
  name text not null,
  avatar_url text,
  -- Real email registered with Supabase Auth (phone converted to a hidden
  -- internal address) — used only for "forgot password" reset emails.
  email text,
  -- Fixed at signup, not switchable — 'admin' is separate (private.admins
  -- allowlist), not a value stored here.
  role text not null default 'buyer' check (role in ('buyer', 'agent')),
  -- This account's real Supabase Auth uid — same identity RLS enforces
  -- against elsewhere (owner_id on listings, private.admins membership).
  -- CASCADE: the profile row IS the account record, meaningless orphaned.
  -- This FK is also what stops the exact bug that hit production data once
  -- already — deleting an auth.users row from the Dashboard with no FK left
  -- a stale profiles row behind with a dangling auth_uid, which then made a
  -- later signup's upsert fail RLS (existing row's auth_uid didn't match the
  -- new account). With the FK, deleting the user cleans the profile up too.
  auth_uid uuid references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  -- Expo push token for this account's device, if it ever granted
  -- notification permission — see migration_push_notifications.sql. No
  -- extra RLS needed: the existing own-row policies already cover it, and
  -- the notify-listing-status Edge Function reads it via the service role.
  push_token text
);

alter table listings enable row level security;
alter table favorites enable row level security;
alter table agents enable row level security;
alter table profiles enable row level security;

-- Listings: publicly readable (buyers browse without signing in), but writes
-- require a real session, and only the owning session (or an admin) can
-- change/remove a listing that already exists.
create policy "anyone can read listings" on listings for select using (true);
-- Any signed-in account may submit a listing — buyer/agent is no longer a
-- distinct, gated account type (see profiles.role: kept in the schema for
-- possible future use, but unused for gating as of this policy).
create policy "signed-in sessions can submit their own listing" on listings for insert
  with check (auth.uid() is not null and owner_id = auth.uid());
create policy "owner or admin can update listings" on listings for update
  using (owner_id = auth.uid() or private.is_admin())
  with check (owner_id = auth.uid() or private.is_admin());
create policy "owner or admin can delete listings" on listings for delete
  using (owner_id = auth.uid() or private.is_admin());

-- Favorites: scoped to the real account that saved each row (owner_id), not
-- just "any signed-in session" — otherwise any authenticated account could
-- read or delete another account's saved-listings list. migration_favorites_
-- user_id_check.sql tightened the insert/update check further: user_id (the
-- phone AppContext.js's fetchFavorites queries by) must match the caller's
-- own profiles.phone, not just any value paired with a valid owner_id — a
-- crafted insert could otherwise plant a favorite under someone else's
-- phone number even while correctly owning the row itself.
create policy "own account manages favorites" on favorites for all
  using (owner_id = auth.uid())
  with check (
    owner_id = auth.uid()
    and user_id = (select phone from profiles where auth_uid = auth.uid())
  );
-- Agents: the directory itself is intentionally readable by any signed-in
-- session (it's a public "browse agents" list), but only the owning account
-- can register/update its own entry, and only admin can remove one.
create policy "signed-in sessions can read agents" on agents for select
  using (auth.uid() is not null);
create policy "own account can register as agent" on agents for insert
  with check (auth.uid() is not null and owner_id = auth.uid());
create policy "own account can update its agent entry" on agents for update
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "admin can remove agents" on agents for delete
  using (private.is_admin());

-- Profiles now map 1:1 to real accounts (auth_uid is a genuine, stable
-- identity, not a rotating anonymous session) — restrict to the owning
-- account's own row rather than "any signed-in session."
create policy "own profile is readable" on profiles for select
  using (auth_uid = auth.uid());
create policy "can create own profile" on profiles for insert
  with check (auth.uid() is not null and auth_uid = auth.uid());
create policy "can update own profile" on profiles for update
  using (auth_uid = auth.uid()) with check (auth_uid = auth.uid());

-- Storage bucket for listing photos/videos (public read, so media renders
-- without signed URLs; writes require a real session).
insert into storage.buckets (id, name, public)
values ('listing-photos', 'listing-photos', true)
on conflict (id) do nothing;

-- Storage's own upload API auto-stamps owner_id with the uploading account's
-- auth.uid() (it's populated from the request's JWT, not client-supplied) —
-- update/delete are scoped to that so one signed-in account can't overwrite
-- or delete another account's photos/videos/avatars in the shared bucket.
-- Insert can't check owner_id yet (the row doesn't exist until this policy
-- passes), so it's just "any real session," matching every other insert in
-- this schema.
-- No SELECT policy for listing-photos reads — deliberate. This is a public
-- bucket, so object URLs already resolve for anyone regardless of RLS
-- (public buckets serve via /storage/v1/object/public/... unconditionally,
-- and getPublicUrl() is a local string-builder, not a query). A broad
-- SELECT policy here wouldn't protect image display at all, it would only
-- additionally let anyone enumerate every file in the bucket via list() —
-- flagged by Supabase's Security Advisor, removed for that reason.
create policy "signed-in sessions upload listing photos" on storage.objects for insert
  with check (bucket_id = 'listing-photos' and auth.uid() is not null);
create policy "owner can update their listing photos" on storage.objects for update
  using (bucket_id = 'listing-photos' and owner_id = (auth.uid())::text);
create policy "owner can delete their listing photos" on storage.objects for delete
  using (bucket_id = 'listing-photos' and owner_id = (auth.uid())::text);

-- Featured listings + Auctions ("Mazad") — see
-- supabase/migration_featured_auctions.sql for the fuller original history
-- (this originally included an Auction/"Mazad" feature, removed — see
-- migration_remove_auctions.sql; the admin-approval Featured-request flow
-- that briefly followed it was itself replaced by instant self-serve payment
-- via Dpay — see migration_remove_boost_requests.sql). This is the current
-- state mirrored here for fresh installs.

alter table listings add column if not exists is_featured boolean not null default false;

-- Listing lifecycle — see migration_listing_lifecycle.sql. `now()` is
-- volatile, so Postgres computes this default per existing row at ALTER
-- time too, not just for future inserts.
-- migration_mark_listing_sold.sql extends this to also allow 'sold' — one
-- value covering both "sold" (sale listings) and "rented" (rent listings);
-- the app picks the display word from listing_type.
alter table listings add column if not exists listing_state text not null default 'active'
  check (listing_state in ('active', 'expired', 'sold'));
alter table listings add column if not exists expires_at timestamptz not null default (now() + interval '30 days');
alter table listings add column if not exists renewed_at timestamptz;
alter table listings add column if not exists featured_until timestamptz;

-- Column-level lockdown: "owner or admin can update listings" above is a
-- row-level policy — it lets an owner set ANY column on their own row,
-- including status, which would otherwise let a seller self-approve their
-- own listing via a raw REST call (or set is_featured=true for free on
-- insert/update, bypassing Dpay entirely). RLS can't express a column-level
-- restriction, so this uses Postgres's own privilege system instead.
--
-- migration_fix_listings_column_lockdown.sql: a plain column-level REVOKE
-- alone does NOT work here — Supabase grants 'authenticated'/'anon' a broad
-- TABLE-level INSERT/UPDATE on every table by default, and a table-level
-- grant is never overridden by a narrower column-level revoke (a privilege
-- check passes if ANY applicable grant allows it). A live check
-- (has_column_privilege) confirmed this: the column-level revoke that used
-- to be here had never actually been in effect. The real fix is to revoke
-- the table-level grant entirely and re-grant only the specific columns a
-- seller's own listing form actually sends — everything except id (auto),
-- created_at (auto), owner_id (insert-only, never updated after), and the
-- six lifecycle/moderation columns below, which are only ever touched by a
-- SECURITY DEFINER RPC (renew_listing, mark_listing_sold,
-- admin_set_listing_status, resubmit_rejected_listing) or a service-role
-- Edge Function (create/verify-boost-payment, dpay-webhook, lifecycle-cron)
-- — none of which are affected by revoking the calling role's own column
-- privilege, since SECURITY DEFINER runs as the function owner and
-- service-role bypasses grants/RLS entirely.
revoke insert, update on listings from anon;
revoke insert, update on listings from authenticated;

grant insert (
  title, price, area, description, agent_phone, listing_type, property_type,
  rooms, images, latitude, longitude, agent_id, amenities, audience_target,
  owner_id, district, city
) on listings to authenticated;

grant update (
  title, price, area, description, agent_phone, listing_type, property_type,
  rooms, images, latitude, longitude, agent_id, amenities, audience_target,
  district, city
) on listings to authenticated;

-- Free renewal — resets the 30-day clock and clears 'expired' back to
-- 'active'. security definer so it can touch the now-locked-down columns;
-- still owner-gated internally. migration_renew_listing_blocks_sold.sql
-- added the listing_state != 'sold' guard — the UI never offers Renew on a
-- sold listing, but that's not a security boundary; without this a direct
-- RPC call could silently reactivate a sold listing as a side effect of
-- renewing it. Un-marking sold is still possible, just only via the
-- deliberate mark_listing_available action below, not as a side door here.
create or replace function public.renew_listing(p_listing_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update listings
  set expires_at = now() + interval '30 days',
      listing_state = 'active',
      renewed_at = now()
  where id = p_listing_id and owner_id = auth.uid() and listing_state != 'sold';

  if not found then
    raise exception 'Listing not found, not owned by you, or already marked sold';
  end if;
end;
$$;

grant execute on function public.renew_listing(uuid) to authenticated;

-- migration_mark_listing_sold.sql — same security-definer/owner-gated
-- pattern as renew_listing above. Reversed by mark_listing_available below
-- (a deliberate seller action, not automatic). Deliberately doesn't touch
-- expires_at/featured_until on the way in: a sold listing keeps whatever
-- countdown it had, it just no longer matters once excluded from
-- buyer-facing queries.
create or replace function public.mark_listing_sold(p_listing_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update listings
  set listing_state = 'sold'
  where id = p_listing_id and owner_id = auth.uid();

  if not found then
    raise exception 'Listing not found or not owned by you';
  end if;
end;
$$;

grant execute on function public.mark_listing_sold(uuid) to authenticated;

-- migration_mark_listing_available.sql — reverses the above (same
-- owner-gated pattern). Refreshes expires_at to a fresh 30 days too, not
-- left alone: coming back as 'active' with an already-past expires_at would
-- just get flipped to 'expired' again by lifecycle-cron's next run,
-- confusing right after deliberately making a listing available again.
create or replace function public.mark_listing_available(p_listing_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update listings
  set listing_state = 'active',
      expires_at = now() + interval '30 days'
  where id = p_listing_id and owner_id = auth.uid() and listing_state = 'sold';

  if not found then
    raise exception 'Listing not found, not owned by you, or not currently marked sold';
  end if;
end;
$$;

grant execute on function public.mark_listing_available(uuid) to authenticated;

-- migration_fix_listings_column_lockdown.sql — approveListing/rejectListing
-- (AppContext.js) used to run a plain client update({status}) using admin's
-- own authenticated session; that's the one legitimate authenticated-side
-- write to status the column lockdown above would otherwise also block, so
-- it moves here instead. Admin-gated (not owner-gated) via private.is_admin().
create or replace function public.admin_set_listing_status(p_listing_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not private.is_admin() then
    raise exception 'Admin only';
  end if;
  if p_status not in ('pending', 'approved', 'rejected') then
    raise exception 'Invalid status';
  end if;

  update listings set status = p_status where id = p_listing_id;

  if not found then
    raise exception 'Listing not found';
  end if;
end;
$$;

grant execute on function public.admin_set_listing_status(uuid, text) to authenticated;

-- migration_resubmit_rejected_listing.sql — AddListingScreen's "resubmit a
-- rejected listing puts it back in front of admin" used the same
-- now-blocked plain update path as approve/reject, but owner-gated instead
-- of admin-gated: only moves rejected -> pending, nothing else, same
-- security-definer pattern as renew_listing/mark_listing_sold.
create or replace function public.resubmit_rejected_listing(p_listing_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update listings
  set status = 'pending'
  where id = p_listing_id and owner_id = auth.uid() and status = 'rejected';

  if not found then
    raise exception 'Listing not found, not owned by you, or not currently rejected';
  end if;
end;
$$;

grant execute on function public.resubmit_rejected_listing(uuid) to authenticated;

-- Instant self-serve Featured payment via Dpay — see
-- migration_boost_payment_sessions.sql. Populated/updated only by the
-- create-boost-payment/verify-boost-payment/dpay-webhook Edge Functions
-- (service-role client bypasses RLS) — no insert/update policy for
-- authenticated, same lockdown model as the column revoke above.
-- listing_id is nullable and SET NULL on delete (not CASCADE) — see
-- migration_boost_payment_survives_listing_delete.sql. This is a financial
-- record; it must survive the listing it was for later being deleted,
-- rather than silently disappearing along with it.
create table if not exists boost_payment_sessions (
  id uuid primary key default gen_random_uuid(),
  dpay_session_id bigint not null unique,
  listing_id uuid references listings(id) on delete set null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  pay_method text not null check (pay_method in ('edfali', 'sadad', 'moamalat', 'masrefypay')),
  duration_days integer not null check (duration_days in (3, 7, 14)),
  amount numeric not null,
  status text not null default 'pending' check (status in ('pending', 'paid', 'failed', 'expired')),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

alter table boost_payment_sessions enable row level security;

create policy "owner can read own boost payment sessions" on boost_payment_sessions for select
  using (owner_id = auth.uid());

-- migration_admin_read_boost_payments.sql — lets admin accounts see every
-- seller's Featured payment history (not just their own), for the
-- admin-facing Payment History screen. A second permissive SELECT policy,
-- combined with the owner one above via OR — sellers keep reading their own
-- rows exactly as before.
create policy "admin can read all boost payment sessions" on boost_payment_sessions for select
  using (private.is_admin());

-- "Report this listing" — see migration_listing_reports.sql for the fuller
-- comment. No reporter-facing "my reports" screen, so insert-only for the
-- reporting account; only admin ever reads/triages these.
create table if not exists listing_reports (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references listings(id) on delete cascade,
  reporter_owner_id uuid not null references auth.users(id) on delete cascade,
  reason text not null check (reason in ('scam', 'duplicate', 'sold_elsewhere', 'wrong_info', 'other')),
  note text,
  status text not null default 'open' check (status in ('open', 'reviewed', 'dismissed')),
  created_at timestamptz not null default now()
);

alter table listing_reports enable row level security;

create policy "signed-in accounts can report a listing" on listing_reports for insert
  with check (auth.uid() is not null and reporter_owner_id = auth.uid());

create policy "admin can read all listing reports" on listing_reports for select
  using (private.is_admin());

create policy "admin can update listing reports" on listing_reports for update
  using (private.is_admin()) with check (private.is_admin());

-- "Verified agent" trust badge — see migration_agent_verified.sql for the
-- fuller comment on why the column-level lockdown below is necessary (same
-- self-approval bypass class as the listings column lockdown further up).
alter table agents add column if not exists verified boolean not null default false;

revoke insert, update on agents from authenticated;

grant insert (phone, name, owner_id) on agents to authenticated;
grant update (name) on agents to authenticated;

create or replace function public.admin_set_agent_verified(p_phone text, p_verified boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not private.is_admin() then
    raise exception 'Admin only';
  end if;

  update agents set verified = p_verified where phone = p_phone;

  if not found then
    raise exception 'Agent not found';
  end if;
end;
$$;

grant execute on function public.admin_set_agent_verified(text, boolean) to authenticated;
