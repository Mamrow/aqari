-- renew_listing had no guard against a listing already marked sold — the UI
-- never offers Renew on a sold listing, but that's not a security boundary;
-- a direct RPC call could silently flip listing_state back to 'active',
-- contradicting mark_listing_sold's own "one-way, no unsold RPC" comment.
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
  where id = p_listing_id and owner_id = auth.uid() and listing_state != 'sold';

  if not found then
    raise exception 'Listing not found, not owned by you, or already marked sold';
  end if;
end;
$$;
