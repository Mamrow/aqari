-- Aqari — expiry reminders, and the 30 days counted from approval.
--
-- Three parts, all safe to re-run:
--   1. Two columns notify-listing-expiry uses to send each notice once.
--   2. Approval restarts a listing's 30 days.
--   3. A daily pg_cron job that calls notify-listing-expiry.
--
-- ── BEFORE RUNNING ────────────────────────────────────────────────────────
-- 1. Deploy the function, with JWT verification off (the caller is pg_net,
--    not a signed-in user):
--       supabase functions deploy notify-listing-expiry --no-verify-jwt
--    or Dashboard → Edge Functions → Deploy a new function, name it
--    notify-listing-expiry, paste the WHOLE of
--    supabase/functions/notify-listing-expiry/index.ts, and turn
--    "Verify JWT" off in its settings.
-- 2. It reuses the DB_WEBHOOK_SECRET secret the other notify-* functions
--    already have; nothing new to set.
-- 3. Replace <YOUR_WEBHOOK_SECRET> in part 3 below with that same value
--    (the one already typed into migration_notification_webhooks.sql). The
--    secret is typed into the SQL editor, never committed.
-- ──────────────────────────────────────────────────────────────────────────


-- ── 1. Which expiry each notice was sent for ─────────────────────────────
-- Each holds the expires_at value its notice went out for. Renewing moves
-- expires_at, so the new expiry is due fresh notices without anything having
-- to reset these, and renew_listing / mark_listing_available stay as they are.
--
-- Owners can't write them: listings UPDATE is granted column by column
-- (migration_fix_listings_column_lockdown.sql), and these aren't in the
-- list. Only the service role sets them.
alter table public.listings add column if not exists expiry_warned_for timestamptz;
alter table public.listings add column if not exists expiry_notified_for timestamptz;


-- ── 2. The 30 days start at approval ─────────────────────────────────────
-- expires_at defaults to 30 days from insert, so time spent waiting for
-- review came out of the seller's 30 days: a listing approved after three
-- days was live for 27. Approval now restarts the clock.
--
-- A listing that waited so long it was already marked expired (lifecycle-
-- cron expires by date, whatever the review status) comes back to active
-- with it. A sold listing is left sold.
create or replace function private.listing_approval_restarts_expiry()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = 'approved' and old.status is distinct from 'approved' then
    new.expires_at := now() + interval '30 days';
    if new.listing_state = 'expired' then
      new.listing_state := 'active';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists listing_approval_restarts_expiry on public.listings;

create trigger listing_approval_restarts_expiry
  before update of status on public.listings
  for each row
  execute function private.listing_approval_restarts_expiry();


-- ── 3. Daily run ─────────────────────────────────────────────────────────
-- 09:00 UTC is 11:00 in Libya: late enough not to wake anyone, and well
-- after lifecycle-cron's 03:00 UTC run has marked that night's expiries.
create extension if not exists pg_net with schema extensions;

select cron.unschedule('aqari-expiry-reminders') where exists (
  select 1 from cron.job where jobname = 'aqari-expiry-reminders'
);

select cron.schedule(
  'aqari-expiry-reminders',
  '0 9 * * *',
  $$
  select net.http_post(
    url := 'https://dttbszywzdsxntzbzoqu.supabase.co/functions/v1/notify-listing-expiry',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Webhook-Secret', '<YOUR_WEBHOOK_SECRET>'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Check it's scheduled:
--   select jobname, schedule from cron.job where jobname = 'aqari-expiry-reminders';
--
-- Run it once now instead of waiting for 11:00 (same call the job makes),
-- then read the reply a few seconds later:
--   select net.http_post(
--     url := 'https://dttbszywzdsxntzbzoqu.supabase.co/functions/v1/notify-listing-expiry',
--     headers := jsonb_build_object('Content-Type', 'application/json',
--                                   'X-Webhook-Secret', '<YOUR_WEBHOOK_SECRET>'),
--     body := '{}'::jsonb);
--   select status_code, content from net._http_response order by created desc limit 1;
-- 401 means the secret doesn't match; 404 means the function isn't deployed
-- under that name.
