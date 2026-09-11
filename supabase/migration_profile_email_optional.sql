-- Aqari — an optional contact email on the profile.
--
-- This is NOT a return of the old auth email. That one was mandatory, was
-- the only way to recover an account, and was mailed to by an Edge Function
-- (see migration_phone_auth_no_email.sql for what was removed). Auth stays
-- phone + password + one-time code; nothing here can sign anyone in.
--
-- ⚠ PRIVACY LABEL: collecting this again means "Email Address" has to be
-- declared as collected in App Store Connect → App Privacy and in Google
-- Play's Data safety form. Both were filled in on the basis that no email
-- is collected anywhere. Update them before the next submission, or the
-- labels contradict the app — which is one of the things review checks.
--
-- Nullable with no default: an account that never fills it in has no email,
-- which is the normal case.

alter table profiles add column if not exists email text;

comment on column profiles.email is
  'Optional contact email the account entered themselves. Not used for auth, not used for recovery, never mailed to automatically. Declared in both stores privacy labels.';

-- Verify:
select column_name, is_nullable, data_type
from information_schema.columns
where table_name = 'profiles' and column_name = 'email';
