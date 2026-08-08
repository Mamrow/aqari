-- AddListingScreen's "resubmit a rejected listing puts it back in front of
-- admin" feature relied on the owner directly setting status='pending' via
-- a plain client update — now blocked by migration_fix_listings_column_
-- lockdown.sql's revoke on that column, correctly. Owner-gated
-- security-definer RPC instead, same pattern as renew_listing/
-- mark_listing_sold: only moves rejected -> pending, nothing else.
create or replace function public.resubmit_rejected_listing(p_listing_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update listings
  set status = 'pending'
  where id = p_listing_id and owner_id = auth.uid() and status = 'rejected';

  if not found then
    raise exception 'Listing not found, not owned by you, or not currently rejected';
  end if;
end;
$$;

grant execute on function public.resubmit_rejected_listing(uuid) to authenticated;
