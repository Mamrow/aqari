-- Aqari — unify buyer/agent into one role (any signed-in account can list).
-- Run this once against the existing live project (SQL Editor → New query →
-- paste → Run). schema.sql has already been updated to match. Safe to re-run.

-- Revert the listings INSERT policy back to "any signed-in owner" — the
-- role = 'agent' requirement added in the earlier security-audit pass is
-- deliberately removed now: any signed-in account can submit a listing.
drop policy if exists "agent sessions can submit their own listing" on listings;
drop policy if exists "signed-in sessions can submit their own listing" on listings;
create policy "signed-in sessions can submit their own listing" on listings for insert
  with check (auth.uid() is not null and owner_id = auth.uid());

-- profiles.role and its check constraint are left in place untouched (no
-- destructive schema change) — the app just stops reading/setting it
-- meaningfully going forward. Every account keeps the column's default.
