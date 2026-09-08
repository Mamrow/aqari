-- Aqari — drop everything the email-based password reset needed.
--
-- Auth is now phone + password, with a one-time code (SMS or WhatsApp,
-- delivered by Supabase's own phone provider via Twilio) proving the number
-- at sign-up and again for "forgot password". Nothing in the app collects,
-- stores or sends an email address any more:
--
--   * profiles.email existed only so send-password-reset could mail a
--     recovery link somewhere real — the synthetic phone.aqari.dev address
--     the account was registered under could never receive mail.
--   * get_reset_email_for_phone existed only to look that address up from
--     the Edge Function, which is deleted.
--   * private.password_reset_attempts was that function's per-phone rate
--     limiter. Supabase's own OTP rate limits replace it, and unlike this
--     table they're enforced before a message is paid for.
--
-- Dropping the column is also what makes the App Store privacy label honest:
-- "Email Address" is declared as not collected, and a column holding one
-- would contradict that.
--
-- Run AFTER migration_cleanup_users_for_phone_auth.sql (which clears the
-- accounts that only had a synthetic-email identity) and after deploying the
-- app build that stops writing profiles.email — an older build still running
-- on someone's phone will error on insert if the column disappears first.

begin;

alter table profiles drop column if exists email;

drop function if exists public.get_reset_email_for_phone(text);

drop table if exists private.password_reset_attempts;

commit;

-- Verify: none of the three should come back.
select column_name from information_schema.columns
where table_name = 'profiles' and column_name = 'email';

select routine_name from information_schema.routines
where routine_schema = 'public' and routine_name = 'get_reset_email_for_phone';

select tablename from pg_tables
where schemaname = 'private' and tablename = 'password_reset_attempts';
