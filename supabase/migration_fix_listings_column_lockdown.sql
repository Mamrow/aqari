-- Supersedes migration_reapply_column_revoke.sql, which turned out not to
-- be enough on its own: 'authenticated'/'anon' both hold a broad TABLE-level
-- INSERT/UPDATE grant on listings (Supabase's default), and a column-level
-- REVOKE can never restrict what a table-level GRANT already covers — a
-- privilege check passes if ANY applicable grant allows it, table-level or
-- column-level. The only real fix is to revoke the table-level grant and
-- re-grant only the specific columns a seller should ever set directly.
--
-- Concretely, without this: any signed-in seller could call the client SDK
-- directly to set is_featured=true on their own listing (bypassing Dpay
-- payment), self-approve status='approved' on an update OR set it straight
-- to 'approved' on a brand-new insert (bypassing admin review entirely), or
-- freely rewrite listing_state/expires_at/renewed_at/featured_until.

-- anon should never insert or update a listing at all — RLS already
-- requires auth.uid() is not null for insert and can never match a row on
-- update for an anonymous caller, so there's no legitimate case for it to
-- hold the raw privilege in the first place.
revoke insert, update on listings from anon;

revoke insert, update on listings from authenticated;

-- Everything a seller's own listing form actually sends. All six locked-down
-- columns (status, is_featured, listing_state, expires_at, renewed_at,
-- featured_until) have safe defaults ('pending', false, 'active', now()+30d,
-- null, null) and are otherwise only ever touched by SECURITY DEFINER RPCs
-- (renew_listing, mark_listing_sold, admin_set_listing_status below) or
-- service-role Edge Functions (create/verify-boost-payment, dpay-webhook,
-- lifecycle-cron) — none of which are affected by revoking the calling
-- role's own column privilege, since SECURITY DEFINER runs as the function
-- owner and service-role bypasses grants/RLS entirely.
grant insert (
  title, price, area, description, agent_phone, listing_type, property_type,
  rooms, images, latitude, longitude, agent_id, amenities, audience_target,
  owner_id, district, city
) on listings to authenticated;

-- Same list minus owner_id — mappers.js's listingToRow already documents
-- owner_id as insert-only and never sends it on update; this makes that the
-- enforced behavior, not just a client-side convention.
grant update (
  title, price, area, description, agent_phone, listing_type, property_type,
  rooms, images, latitude, longitude, agent_id, amenities, audience_target,
  district, city
) on listings to authenticated;

-- approveListing/rejectListing (AppContext.js) currently run a plain client
-- update({status}) using admin's own authenticated session — the one
-- legitimate authenticated-side write to status that the lockdown above
-- would otherwise also block. Moves it to a security-definer RPC instead,
-- same admin-gated pattern as private.is_admin() is used everywhere else.
create or replace function public.admin_set_listing_status(p_listing_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not private.is_admin() then
    raise exception 'Admin only';
  end if;
  if p_status not in ('pending', 'approved', 'rejected') then
    raise exception 'Invalid status';
  end if;

  update listings set status = p_status where id = p_listing_id;

  if not found then
    raise exception 'Listing not found';
  end if;
end;
$$;

grant execute on function public.admin_set_listing_status(uuid, text) to authenticated;
