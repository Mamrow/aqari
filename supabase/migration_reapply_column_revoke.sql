-- schema.sql has documented this revoke since migration_listing_lifecycle.sql,
-- and every RPC/Edge Function built since (renew_listing, mark_listing_sold,
-- create-boost-payment) assumes it's in effect. It verifiably was not: a
-- live check (has_column_privilege) showed 'authenticated' still had UPDATE
-- on status/is_featured/featured_until/listing_state/expires_at/renewed_at.
-- Concretely, without this, any signed-in seller could call the client SDK
-- directly to set is_featured=true on their own listing (bypassing Dpay
-- payment entirely) or self-approve status='approved' (bypassing admin
-- review entirely) — RLS's "owner or admin can update listings" is a
-- row-level policy that permits an owner to touch ANY column on their own
-- row; only this column-level revoke closes that.
revoke update (status, is_featured, featured_until, listing_state, expires_at, renewed_at)
  on listings from authenticated, anon;
