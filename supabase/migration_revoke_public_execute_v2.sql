-- Aqari — closes the Supabase linter's "Public Can Execute SECURITY DEFINER
-- Function" warnings (lint 0028) for every RPC that anon has no business
-- calling.
--
-- Supersedes migration_revoke_public_execute.sql, which covered six of these
-- but, judging by the linter still reporting them, was never actually run.
-- Re-stating those revokes here is harmless: REVOKE on a grant that isn't
-- there is a no-op, so this is safe whether or not the earlier file ran.
--
-- None of these were exploitable. Each checks private.is_admin() or
-- owner_id = auth.uid() internally and raises otherwise — anon calling one
-- got an exception, not a result. But Postgres grants EXECUTE to PUBLIC on
-- every new function, so Postgres itself was letting the call through to
-- that internal check instead of refusing it at the door. This is the same
-- "revoke the default, then grant only the intended role" pattern already
-- used for the listings and agents column grants.
--
-- Run once in the SQL Editor.

-- Admin-gated.
revoke execute on function public.admin_set_agent_verified(text, boolean) from public, anon;
revoke execute on function public.admin_set_listing_status(uuid, text) from public, anon;

-- Owner-gated (the caller must own the listing).
revoke execute on function public.mark_listing_available(uuid) from public, anon;
revoke execute on function public.mark_listing_sold(uuid) from public, anon;
revoke execute on function public.renew_listing(uuid) from public, anon;
revoke execute on function public.resubmit_rejected_listing(uuid) from public, anon;

-- am_i_admin() was left public on purpose when it was written — it only ever
-- returns a boolean, and for anon that boolean is always false, so exposing
-- it leaked nothing. It's still pointless to expose: AppContext calls it only
-- from the effect that runs when authUid becomes non-null, i.e. only ever as
-- `authenticated`. One fewer anonymous endpoint, no behaviour change.
revoke execute on function public.am_i_admin() from public, anon;

-- Each of the seven already has `grant execute ... to authenticated` from the
-- migration that introduced it, so signed-in callers are unaffected. Restated
-- here so this file alone describes the intended end state.
grant execute on function public.admin_set_agent_verified(text, boolean) to authenticated;
grant execute on function public.admin_set_listing_status(uuid, text) to authenticated;
grant execute on function public.mark_listing_available(uuid) to authenticated;
grant execute on function public.mark_listing_sold(uuid) to authenticated;
grant execute on function public.renew_listing(uuid) to authenticated;
grant execute on function public.resubmit_rejected_listing(uuid) to authenticated;
grant execute on function public.am_i_admin() to authenticated;

-- NOT revoked, deliberately: public.get_seller_profile(uuid). Listings are
-- readable without signing in, so the seller card above them has to be too,
-- and the function already returns only name/avatar/verified/joined-month for
-- accounts that have an approved listing — no phone, no email, no push token.
-- The linter will keep reporting it; that's the lint noticing the intent,
-- not finding a hole. See migration_seller_profiles.sql.

-- If schema.sql is ever re-run from scratch it will re-grant am_i_admin() to
-- anon (line 51 there, `grant execute ... to anon, authenticated`). Re-run
-- this file after any full schema reload.

-- Verify — should return only get_seller_profile once this has run.
-- coalesce(proacl, acldefault(...)) matters: a function nobody has revoked
-- anything from has a NULL proacl, and aclexplode(NULL) returns no rows, so
-- the naive version of this query reports "all clear" for exactly the
-- functions that are still wide open.
--   select p.proname, r.rolname
--   from pg_proc p
--   join pg_namespace n on n.oid = p.pronamespace
--   cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
--   left join pg_roles r on r.oid = a.grantee
--   where n.nspname = 'public'
--     and p.prosecdef
--     and a.privilege_type = 'EXECUTE'
--     and coalesce(r.rolname, 'PUBLIC') in ('anon', 'PUBLIC');
