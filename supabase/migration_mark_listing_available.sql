-- Reverses mark_listing_sold — same owner-gated security-definer pattern.
-- Refreshes expires_at to a fresh 30 days too (not left alone): a listing
-- that sat marked sold for a while could otherwise come back as 'active'
-- with an expires_at already in the past, which lifecycle-cron would just
-- flip to 'expired' again on its next run — confusing right after a seller
-- deliberately made it available again.
create or replace function public.mark_listing_available(p_listing_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update listings
  set listing_state = 'active',
      expires_at = now() + interval '30 days'
  where id = p_listing_id and owner_id = auth.uid() and listing_state = 'sold';

  if not found then
    raise exception 'Listing not found, not owned by you, or not currently marked sold';
  end if;
end;
$$;

grant execute on function public.mark_listing_available(uuid) to authenticated;
