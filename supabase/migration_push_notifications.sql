-- Aqari — push notification token storage. Run once in the SQL Editor.
--
-- Just a column — no RLS changes needed, the existing "can update own
-- profile"/"own profile is readable" policies on profiles already cover
-- writing/reading any column on the caller's own row, and the
-- notify-listing-status Edge Function reads this via the service role
-- (bypasses RLS entirely, same as every other Edge Function in this project).
alter table profiles add column if not exists push_token text;
