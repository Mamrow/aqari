-- Aqari — the two notification webhooks, as SQL instead of dashboard forms.
--
-- "Database Webhooks" in the Supabase dashboard are ordinary Postgres
-- triggers calling supabase_functions.http_request under the hood, so they
-- can be created here like anything else. Doing it in SQL means the two hooks
-- are written down and repeatable rather than living only as clicks someone
-- has to remember.
--
-- ── BEFORE RUNNING ────────────────────────────────────────────────────────
-- 1. Dashboard → Database → Webhooks → **Enable webhooks** (once per
--    project). That's what installs the supabase_functions schema this file
--    calls; without it every statement below fails with "schema
--    supabase_functions does not exist".
-- 2. Deploy both functions (Dashboard → Edge Functions → Deploy a new
--    function, or `supabase functions deploy <name>`):
--       notify-listing-status
--       notify-new-listing
-- 3. Set the shared secret, if it isn't set already:
--       supabase secrets set DB_WEBHOOK_SECRET=<random-value>
--    or Project Settings → Edge Functions → Secrets.
-- 4. Replace <YOUR_WEBHOOK_SECRET> below with that same value. Both
--    functions reject any request whose X-Webhook-Secret doesn't match.
--
-- Both triggers fire on the same table and event. That's fine and
-- intentional: each function ignores the transitions it doesn't care about —
-- notify-listing-status wants status changes on a listing's owner,
-- notify-new-listing wants the single transition into 'approved'.
-- ──────────────────────────────────────────────────────────────────────────

-- Idempotent: re-running this file replaces the triggers rather than
-- erroring or silently creating duplicates that double every notification.
drop trigger if exists on_listing_status_change on public.listings;
drop trigger if exists on_listing_approved on public.listings;

create trigger on_listing_status_change
  after update on public.listings
  for each row
  execute function supabase_functions.http_request(
    'https://dttbszywzdsxntzbzoqu.supabase.co/functions/v1/notify-listing-status',
    'POST',
    '{"Content-Type":"application/json","X-Webhook-Secret":"<YOUR_WEBHOOK_SECRET>"}',
    '{}',
    '5000'
  );

create trigger on_listing_approved
  after update on public.listings
  for each row
  execute function supabase_functions.http_request(
    'https://dttbszywzdsxntzbzoqu.supabase.co/functions/v1/notify-new-listing',
    'POST',
    '{"Content-Type":"application/json","X-Webhook-Secret":"<YOUR_WEBHOOK_SECRET>"}',
    '{}',
    '5000'
  );

-- Verify both exist:
select tgname
from pg_trigger
where tgrelid = 'public.listings'::regclass
  and tgname in ('on_listing_status_change', 'on_listing_approved');
