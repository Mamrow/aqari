-- Aqari — silences the Supabase linter's "Public Can Execute SECURITY
-- DEFINER Function" warnings for the owner-/admin-gated RPCs below. None of
-- these were actually exploitable — each checks private.is_admin() or
-- owner_id = auth.uid() internally and raises an exception otherwise — but
-- Postgres grants EXECUTE to PUBLIC by default on function creation, and
-- none of these migrations ever revoked that, so anon could still invoke
-- them and hit the internal check rather than being turned away by Postgres
-- itself first. This is defense in depth, same "revoke then grant only the
-- intended role" pattern already used for listings/agents columns elsewhere
-- in this schema — not a fix for a real vulnerability.
--
-- am_i_admin() is deliberately excluded — it's intentionally public (see its
-- own comment in schema.sql). Run once in the SQL Editor.

revoke execute on function public.admin_set_agent_verified(text, boolean) from public;
revoke execute on function public.admin_set_listing_status(uuid, text) from public;
revoke execute on function public.mark_listing_available(uuid) from public;
revoke execute on function public.mark_listing_sold(uuid) from public;
revoke execute on function public.renew_listing(uuid) from public;
revoke execute on function public.resubmit_rejected_listing(uuid) from public;

-- Each already has its own `grant execute ... to authenticated` from the
-- migration that introduced it, so signed-in callers are unaffected.
