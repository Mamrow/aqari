-- Aqari — "Report this listing" feature. Run once in the SQL Editor
-- (anon key can't run DDL). Same conventions as the rest of this schema:
-- real per-account auth.uid(), private.is_admin() for admin-only access.

create table if not exists listing_reports (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references listings(id) on delete cascade,
  -- The real account that filed the report — RLS enforces insert against
  -- this. No reporter-facing "my reports" screen exists, so there's
  -- deliberately no select policy scoped to the reporter themselves; only
  -- admin ever reads this table back (see the select policy below).
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
