-- Correction to migration_lock_down_reset_email_lookup.sql — that migration
-- revoked EXECUTE from anon/authenticated specifically, but Postgres grants
-- EXECUTE on a new function to the PUBLIC pseudo-role by default, not to
-- individual roles. Every role (including anon) implicitly has whatever's
-- granted to PUBLIC, so the earlier revoke did nothing — confirmed live via
-- a direct REST call to /rest/v1/rpc/get_reset_email_for_phone as anon,
-- which still returned a real email address after that migration ran.
-- Revoking from PUBLIC itself is what actually removes it.
revoke execute on function public.get_reset_email_for_phone(text) from public;
