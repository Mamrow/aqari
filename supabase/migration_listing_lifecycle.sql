-- Aqari — listing lifecycle (30-day expiry, free renewal, auto-expire/cleanup)
-- and locks down the columns that drive it (plus is_featured/status) so only
-- security-definer RPCs / service-role Edge Functions can ever change them.
-- Run once against the existing live project. Safe to re-run.

-- `now()` is volatile, so Postgres computes this default per existing row at
-- ALTER TIME (not just for future inserts) — every current listing gets a
-- real 30-day expiry from the moment this migration runs, no separate
-- backfill statement needed.
alter table listings add column if not exists listing_state text not null default 'active'
  check (listing_state in ('active', 'expired'));
alter table listings add column if not exists expires_at timestamptz not null default (now() + interval '30 days');
alter table listings add column if not exists renewed_at timestamptz;
alter table listings add column if not exists featured_until timestamptz;

-- Column-level lockdown: today's "owner or admin can update listings" RLS
-- policy lets an owner set ANY column on their own row — including status,
-- meaning a seller could currently self-approve their own listing via a raw
-- REST call, bypassing the admin approve/reject screen entirely. RLS is
-- row-level only, so the fix is Postgres's own column-level privilege system,
-- not another policy. The app's normal edit-listing save (mappers.js's
-- listingToRow) never sends these columns, and every legitimate change goes
-- through a security-definer RPC or a service-role Edge Function — both run
-- as the function/role owner and are unaffected by a revoke targeted at
-- `authenticated`.
revoke update (status, is_featured, featured_until, listing_state, expires_at, renewed_at)
  on listings from authenticated;

-- Free renewal — resets the 30-day clock and clears 'expired' back to
-- 'active'. security definer so it can touch the now-locked-down columns;
-- still owner-gated internally, same shape as approve_boost_request.
create or replace function public.renew_listing(p_listing_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update listings
  set expires_at = now() + interval '30 days',
      listing_state = 'active',
      renewed_at = now()
  where id = p_listing_id and owner_id = auth.uid();

  if not found then
    raise exception 'Listing not found or not owned by you';
  end if;
end;
$$;

grant execute on function public.renew_listing(uuid) to authenticated;
