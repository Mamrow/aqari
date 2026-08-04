-- Aqari — schedules the lifecycle-cron Edge Function to run daily.
--
-- One-time manual setup required first (Supabase dashboard → Database →
-- Extensions): enable "pg_cron" and "pg_net". Project ref (dttbszywzdsxntzbzoqu)
-- is already filled in below — you still need to replace this one
-- placeholder before running this in the SQL Editor:
--   <SERVICE_ROLE_KEY>       — Project Settings → API → service_role key
--                               (this is stored in pg_cron's job list in
--                               plain text, same trust level as any other
--                               service-role key already in this project's
--                               Edge Function secrets)
-- Safe to re-run — unschedules any existing job with the same name first.

select cron.unschedule('aqari-lifecycle-cron') where exists (
  select 1 from cron.job where jobname = 'aqari-lifecycle-cron'
);

select cron.schedule(
  'aqari-lifecycle-cron',
  '0 3 * * *', -- daily at 03:00 UTC
  $$
  select net.http_post(
    url := 'https://dttbszywzdsxntzbzoqu.supabase.co/functions/v1/lifecycle-cron',
    headers := jsonb_build_object(
      'Authorization', 'Bearer <SERVICE_ROLE_KEY>',
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);
