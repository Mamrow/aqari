-- Aqari — the two notification webhooks, built directly on pg_net.
--
-- The obvious way to do this is Dashboard → Database → Webhooks, which wires
-- triggers to supabase_functions.http_request. That schema only exists once
-- you've clicked "Enable webhooks" in that screen, and a migration that fails
-- with `schema "supabase_functions" does not exist` unless someone clicked a
-- button first isn't much of a migration. pg_net is the same machinery one
-- layer down, available without the dashboard, and it means the payload shape
-- is ours rather than something we have to match.
--
-- ── BEFORE RUNNING ────────────────────────────────────────────────────────
-- 1. Deploy both functions (Dashboard → Edge Functions → Deploy a new
--    function, or `supabase functions deploy <name>`):
--       notify-listing-status
--       notify-new-listing
--    Paste the WHOLE file each time — a truncated paste fails to deploy with
--    "Unexpected eof", which looks like a code error and isn't.
-- 2. Set the shared secret (Project Settings → Edge Functions → Secrets, or
--    `supabase secrets set DB_WEBHOOK_SECRET=<random-value>`).
-- 3. Replace BOTH copies of <YOUR_WEBHOOK_SECRET> below with that value.
--    Both functions reject any request whose X-Webhook-Secret doesn't match,
--    so a typo here shows up as silence, not an error.
--
-- The secret is typed into the SQL editor, not committed: this file ships a
-- placeholder. Same reasoning as everywhere else in this project — schema.sql
-- is in git, so no real credential belongs in it.
-- ──────────────────────────────────────────────────────────────────────────

create extension if not exists pg_net with schema extensions;

create or replace function private.notify_listing_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  base_url text := 'https://dttbszywzdsxntzbzoqu.supabase.co/functions/v1/';
  headers jsonb := jsonb_build_object(
    'Content-Type', 'application/json',
    'X-Webhook-Secret', '<YOUR_WEBHOOK_SECRET>'
  );
  -- The shape Supabase's own webhooks send, because that's what both
  -- functions already read: payload.record and payload.old_record.
  payload jsonb := jsonb_build_object(
    'type', 'UPDATE',
    'table', 'listings',
    'schema', 'public',
    'record', to_jsonb(new),
    'old_record', to_jsonb(old)
  );
begin
  -- Both functions get every status change and each ignores the transitions
  -- it doesn't care about: notify-listing-status wants approved *or*
  -- rejected and notifies the owner; notify-new-listing wants the single
  -- transition into approved and notifies everyone following that city.
  perform net.http_post(
    url := base_url || 'notify-listing-status',
    headers := headers,
    body := payload
  );
  perform net.http_post(
    url := base_url || 'notify-new-listing',
    headers := headers,
    body := payload
  );
  return new;
end;
$$;

-- Idempotent: re-running replaces the trigger instead of quietly adding a
-- second one and doubling every notification.
drop trigger if exists on_listing_status_change on public.listings;

create trigger on_listing_status_change
  after update on public.listings
  for each row
  -- Only an actual status transition. Without this every price edit posts
  -- two HTTP requests that both functions then discard.
  when (old.status is distinct from new.status)
  execute function private.notify_listing_change();

-- Verify the trigger exists:
select tgname
from pg_trigger
where tgrelid = 'public.listings'::regclass
  and tgname = 'on_listing_status_change';

-- After approving a listing, check delivery here — pg_net records every
-- request and the response it got back:
--   select id, created, status_code, content
--   from net._http_response
--   order by created desc
--   limit 10;
-- 401 means the secret doesn't match; 404 means the function isn't deployed
-- under that name.
