-- 'sold' covers both "sold" (sale listings) and "rented" (rent listings) —
-- the app picks the display word from listing_type, so one state value
-- covers both rather than needing sold/rented as separate states.
alter table listings drop constraint listings_listing_state_check;
alter table listings add constraint listings_listing_state_check
  check (listing_state in ('active', 'expired', 'sold'));

-- One-way from the seller's side (no "unsold" RPC) — same security-definer,
-- owner-gated pattern as renew_listing. Deliberately doesn't touch
-- expires_at/featured_until: a sold listing keeps whatever countdown it had,
-- it just no longer matters once it's excluded from buyer-facing queries.
create or replace function public.mark_listing_sold(p_listing_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update listings
  set listing_state = 'sold'
  where id = p_listing_id and owner_id = auth.uid();

  if not found then
    raise exception 'Listing not found or not owned by you';
  end if;
end;
$$;

grant execute on function public.mark_listing_sold(uuid) to authenticated;
