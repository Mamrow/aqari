-- Aqari — remove the Auction ("Mazad") feature, keeping Featured listings.
-- Run this once against the existing live project. Safe to re-run.

drop function if exists public.get_auction_bids_detailed(uuid);
drop function if exists public.finalize_auction_if_expired(uuid);
drop function if exists public.end_auction_now(uuid);
drop function if exists public.place_bid(uuid, numeric);
drop function if exists public.get_current_highest_bid(uuid);
drop table if exists auction_bids;
drop table if exists auctions;

-- listing_boost_requests only ever handles Featured now — drop the
-- auction-only columns.
alter table listing_boost_requests drop column if exists request_type;
alter table listing_boost_requests drop column if exists reserve_price;
alter table listing_boost_requests drop column if exists requested_ends_at;

-- Re-created without the auction branch.
create or replace function public.approve_boost_request(p_request_id uuid, p_commission_percent numeric default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request listing_boost_requests%rowtype;
begin
  if not private.is_admin() then
    raise exception 'Not authorized';
  end if;

  select * into v_request from listing_boost_requests where id = p_request_id;
  if not found then
    raise exception 'Request not found';
  end if;
  if v_request.status <> 'pending' then
    raise exception 'Request already decided';
  end if;

  update listings set is_featured = true where id = v_request.listing_id;

  update listing_boost_requests
  set status = 'approved', decided_at = now(), commission_percent = p_commission_percent
  where id = p_request_id;
end;
$$;

grant execute on function public.approve_boost_request(uuid, numeric) to authenticated;
