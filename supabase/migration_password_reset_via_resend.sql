-- Aqari — password reset now goes through the send-password-reset Edge
-- Function (see supabase/functions), not supabase.auth.resetPasswordForEmail
-- directly. Run this once in the SQL Editor. Safe to re-run.

-- get_reset_email_for_phone is now only ever called server-side (by the
-- Edge Function, using the service role, which bypasses grants entirely) —
-- the client no longer calls it directly, so revoke public access to close
-- off the small "does this phone have an account" probe it exposed.
revoke execute on function public.get_reset_email_for_phone(text) from anon, authenticated;
