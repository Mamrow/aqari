-- Aqari — fires the notify-listing-status Edge Function when a listing's
-- status changes (admin approve/reject), so the owning agent gets a push.
--
-- Uses pg_net + Vault rather than the dashboard's "Database Webhooks" UI:
-- the UI stores the auth header inline in the trigger definition, which
-- would put the shared secret into anything that dumps the schema. Reading
-- it out of Vault at call time keeps the actual value out of this file (and
-- therefore out of git) entirely.
--
-- One-time setup this file assumes has already happened:
--   1. `supabase secrets set DB_WEBHOOK_SECRET=<value>` (Edge Function side)
--   2. `select vault.create_secret('<same value>', 'db_webhook_secret', ...)`
-- Both were run with a freshly generated random value.

create or replace function private.notify_listing_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  webhook_secret text;
begin
  -- Only a genuine status transition into approved/rejected is worth a
  -- push — editing a listing's title or price shouldn't re-notify. The
  -- Edge Function double-checks this too; this just avoids the HTTP call.
  if new.status is not distinct from old.status then
    return new;
  end if;
  if new.status not in ('approved', 'rejected') then
    return new;
  end if;

  select decrypted_secret into webhook_secret
  from vault.decrypted_secrets
  where name = 'db_webhook_secret';

  if webhook_secret is null then
    -- Never block the actual status change over a missing notification
    -- secret — the approve/reject itself is what matters.
    raise warning 'db_webhook_secret not found in vault; skipping push notification';
    return new;
  end if;

  perform net.http_post(
    url := 'https://dttbszywzdsxntzbzoqu.supabase.co/functions/v1/notify-listing-status',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Webhook-Secret', webhook_secret
    ),
    body := jsonb_build_object(
      'record', to_jsonb(new),
      'old_record', to_jsonb(old)
    ),
    timeout_milliseconds := 5000
  );

  return new;
end;
$$;

drop trigger if exists on_listing_status_change on listings;

create trigger on_listing_status_change
  after update on listings
  for each row
  execute function private.notify_listing_status_change();
