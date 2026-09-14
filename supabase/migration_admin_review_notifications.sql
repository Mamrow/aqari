-- Aqari — notify the admins when a listing needs reviewing.
--
-- Pairs with the notify-admin-review Edge Function. A listing enters the
-- review queue two ways, and both are covered:
--   1. a new listing is inserted with status 'pending'
--   2. a rejected listing is resubmitted (resubmit_rejected_listing sets it
--      back to 'pending')
--
-- ── BEFORE RUNNING ────────────────────────────────────────────────────────
-- 1. The function must be deployed:
--      supabase functions deploy notify-admin-review --no-verify-jwt
-- 2. Replace <YOUR_WEBHOOK_SECRET> below with the same DB_WEBHOOK_SECRET the
--    other two notification functions use. A ready-to-paste copy with the
--    real value filled in is generated at
--    supabase/.temp/admin-review-notifications.sql (gitignored) — use that
--    one instead of editing this file.
-- ──────────────────────────────────────────────────────────────────────────

-- ── Who to notify ────────────────────────────────────────────────────────
-- private.admins isn't exposed through the API, and it shouldn't be. This
-- hands the Edge Function exactly the admins' push tokens and nothing else,
-- and only the service role can call it: revoked from PUBLIC, anon and
-- authenticated, because Postgres grants EXECUTE on a new function to PUBLIC
-- by default — see migration_revoke_public_execute.sql for the time that
-- default bit this project.
create or replace function public.admin_push_tokens()
returns table (push_token text)
language sql
security definer
set search_path = public
stable
as $$
  select p.push_token
  from private.admins a
  join profiles p on p.auth_uid = a.uid
  where p.push_token is not null;
$$;

revoke execute on function public.admin_push_tokens() from public, anon, authenticated;
grant execute on function public.admin_push_tokens() to service_role;

-- ── The trigger ──────────────────────────────────────────────────────────
-- Its own function rather than a third call added to
-- private.notify_listing_change: that one only fires on UPDATE, and a new
-- listing arrives by INSERT. The function decides which transitions count,
-- the same way the other two do.
create or replace function private.notify_listing_review()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform net.http_post(
    url := 'https://dttbszywzdsxntzbzoqu.supabase.co/functions/v1/notify-admin-review',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Webhook-Secret', '<YOUR_WEBHOOK_SECRET>'
    ),
    body := jsonb_build_object(
      'type', tg_op,
      'table', 'listings',
      'schema', 'public',
      'record', to_jsonb(new),
      'old_record', case when tg_op = 'UPDATE' then to_jsonb(old) else null end
    )
  );
  return new;
end;
$$;

drop trigger if exists on_listing_submitted_for_review on public.listings;
create trigger on_listing_submitted_for_review
  after insert on public.listings
  for each row
  when (new.status = 'pending')
  execute function private.notify_listing_review();

drop trigger if exists on_listing_resubmitted_for_review on public.listings;
create trigger on_listing_resubmitted_for_review
  after update on public.listings
  for each row
  -- Only the move into 'pending'. Editing a listing that's already pending
  -- must not page the admins again.
  when (old.status is distinct from new.status and new.status = 'pending')
  execute function private.notify_listing_review();

-- ── Verify ───────────────────────────────────────────────────────────────
select tgname
from pg_trigger
where tgrelid = 'public.listings'::regclass
  and tgname in ('on_listing_submitted_for_review', 'on_listing_resubmitted_for_review');

-- Admins who will actually receive a push. Empty means no admin has a push
-- token yet — sign in as the admin on a phone and allow notifications.
select count(*) as admins_with_push from public.admin_push_tokens();

-- After submitting a test listing, check delivery:
--   select id, created, status_code, content
--   from net._http_response order by created desc limit 5;
-- 200 with {"push":1,...} is working. 401 is a secret mismatch.
