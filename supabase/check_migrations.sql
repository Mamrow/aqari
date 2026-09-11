-- Aqari — which migrations have actually been applied?
--
-- There's no migration runner in this project (flat migration_*.sql files,
-- applied by hand in the SQL editor), so nothing records what's been run.
-- This checks for the thing each migration creates and reports on it.
--
-- Read-only. Run it in the SQL Editor whenever you're unsure.
--
-- A caveat worth knowing: this proves an *artifact* exists, not that the
-- whole file ran. A migration that creates three things and failed on the
-- third still shows as applied here. It's a good answer to "did I forget
-- one", not a substitute for reading the file when something looks wrong.
--
-- The ones this can't see at all, because they leave nothing behind to find:
--   migration_cleanup_users_for_phone_auth.sql   deletes accounts
--   migration_revoke_public_execute.sql          revokes EXECUTE grants
--   migration_reapply_column_revoke.sql          revokes column grants
--   migration_remove_*.sql                       drop things
--   migration_lock_down_reset_email_lookup*.sql  revokes on a now-dropped fn
-- Grants are checked separately at the bottom.

with checks(migration, kind, applied) as (
  values
    ('add_city',                 'listings.city',
      exists (select 1 from information_schema.columns where table_name='listings' and column_name='city')),
    ('add_district',             'listings.district',
      exists (select 1 from information_schema.columns where table_name='listings' and column_name='district')),
    ('agent_verified',           'agents.verified',
      exists (select 1 from information_schema.columns where table_name='agents' and column_name='verified')),
    ('blocked_sellers',          'table blocked_sellers',
      to_regclass('public.blocked_sellers') is not null),
    ('boost_payment_sessions',   'table boost_payment_sessions',
      to_regclass('public.boost_payment_sessions') is not null),
    ('featured_auctions',        'listings.is_featured',
      exists (select 1 from information_schema.columns where table_name='listings' and column_name='is_featured')),
    ('listing_lifecycle',        'listings.listing_state',
      exists (select 1 from information_schema.columns where table_name='listings' and column_name='listing_state')),
    ('listing_reports',          'table listing_reports',
      to_regclass('public.listing_reports') is not null),
    ('push_notifications',       'profiles.push_token',
      exists (select 1 from information_schema.columns where table_name='profiles' and column_name='push_token')),
    ('add_semi_finished',        'semi_finished property type',
      exists (select 1 from pg_constraint where conname like '%property_type%'
              and pg_get_constraintdef(oid) like '%semi_finished%')),
    -- The recent ones
    ('phone_auth_no_email',      'get_reset_email_for_phone dropped',
      to_regproc('public.get_reset_email_for_phone') is null),
    ('profile_email_optional',   'profiles.email',
      exists (select 1 from information_schema.columns where table_name='profiles' and column_name='email')),
    ('new_listing_alerts',       'profiles.notify_new_listings',
      exists (select 1 from information_schema.columns where table_name='profiles' and column_name='notify_new_listings')),
    ('notification_webhooks',    'trigger on_listing_status_change',
      exists (select 1 from pg_trigger where tgrelid='public.listings'::regclass
              and tgname='on_listing_status_change')),
    -- Functions the app calls; a missing one is a broken feature, not just
    -- an unapplied migration.
    ('fix_listings_column_lockdown', 'admin_set_listing_status()',
      to_regproc('public.admin_set_listing_status') is not null),
    ('renew_listing_blocks_sold',    'renew_listing()',
      to_regproc('public.renew_listing') is not null),
    ('resubmit_rejected_listing',    'resubmit_rejected_listing()',
      to_regproc('public.resubmit_rejected_listing') is not null),
    ('mark_listing_sold',            'mark_listing_sold()',
      to_regproc('public.mark_listing_sold') is not null),
    ('mark_listing_available',       'mark_listing_available()',
      to_regproc('public.mark_listing_available') is not null),
    ('security_fixes',               'am_i_admin()',
      to_regproc('public.am_i_admin') is not null),
    ('remove_auctions',              'approve_boost_request dropped',
      to_regproc('public.approve_boost_request') is null)
)
select
  migration,
  kind as looked_for,
  case when applied then '✅ applied' else '❌ MISSING' end as status
from checks
order by applied, migration;

-- ── Grants: migration_revoke_public_execute.sql ───────────────────────────
-- These SECURITY DEFINER functions must NOT be executable by PUBLIC. Rows
-- here mean that migration hasn't been run — or that a later CREATE OR
-- REPLACE silently re-granted it, which Postgres does on every new function.
--
-- am_i_admin() is excluded on purpose and is not a finding. It takes no
-- arguments and reports whether *the caller* is an admin, so an anonymous
-- caller learns only that they aren't one. schema.sql grants it to anon and
-- authenticated deliberately, and migration_revoke_public_execute.sql leaves
-- it alone for the same reason.
select
  p.proname as function_still_public,
  '❌ EXECUTE granted to PUBLIC' as status
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.prosecdef
  and has_function_privilege('public', p.oid, 'EXECUTE')
  and p.proname <> 'am_i_admin'
order by p.proname;

-- ── Column lockdown: migration_fix_listings_column_lockdown.sql ───────────
-- Owners must not be able to UPDATE these directly — they go through
-- SECURITY DEFINER functions instead. Rows here mean the revoke is missing.
select
  column_name as listings_column_writable_by_owner,
  '❌ UPDATE granted' as status
from information_schema.column_privileges
where table_name = 'listings'
  and privilege_type = 'UPDATE'
  and grantee in ('authenticated', 'anon', 'PUBLIC')
  and column_name in ('status', 'is_featured', 'listing_state', 'featured_until', 'expires_at')
order by column_name;
