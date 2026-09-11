-- Aqari — does the notification chain actually work end to end?
--
-- Run in the SQL Editor after deploying the functions and creating the
-- trigger. Each step prints something; read them in order.

-- ── 1. Is the placeholder still in the trigger? ───────────────────────────
-- If this says TRUE, migration_notification_webhooks.sql was pasted without
-- replacing <YOUR_WEBHOOK_SECRET>, and every call will come back 401. This
-- only reports whether the placeholder text is present — it doesn't print
-- the secret.
select
  position('<YOUR_WEBHOOK_SECRET>' in prosrc) > 0 as placeholder_still_unreplaced
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'private' and p.proname = 'notify_listing_change';

-- ── 2. Fire it ───────────────────────────────────────────────────────────
-- The trigger only fires on an actual status *change*, so setting an
-- already-approved listing to 'approved' does nothing. This takes one demo
-- listing out of approved and puts it back, which is one real transition in
-- each direction.
--
-- Safe to run on the seeded demo data. Don't run it on a real listing: the
-- owner gets a genuine "approved" push out of it.
do $$
declare
  test_id uuid;
begin
  select id into test_id
  from listings
  where id::text like 'd0d0d0d0-0000-4000-8000-%'
  order by created_at
  limit 1;

  if test_id is null then
    raise notice 'No demo listing found — run seed_demo_listings.sql, or change this query to pick one of your own.';
    return;
  end if;

  update listings set status = 'pending'  where id = test_id;
  update listings set status = 'approved' where id = test_id;
  raise notice 'Fired the trigger twice for listing %', test_id;
end;
$$;

-- ── 3. What came back ────────────────────────────────────────────────────
-- pg_net is asynchronous: give it a few seconds, then run this on its own.
-- Expect four rows (two functions × two transitions).
--
--   200  the whole chain works
--   401  the secret in the trigger doesn't match the DB_WEBHOOK_SECRET in
--        Edge Function secrets — or the function is still deployed with JWT
--        verification on, which rejects the call before the code runs
--   404  the function isn't deployed under that name
--   5xx  the function ran and threw; check its logs in the dashboard
select
  id,
  created,
  status_code,
  left(content, 200) as response
from net._http_response
order by created desc
limit 10;

-- ── 4. Put the demo listing back ─────────────────────────────────────────
-- Step 2 leaves it approved, which is where it started. Nothing to undo —
-- but if you ran it against a real listing, its owner just got two pushes.
