-- Aqari — stop publishing listings that are still in moderation, or that
-- moderation rejected. Run once in the SQL Editor.
--
-- The policy this replaces was `using (true)`: every row in `listings` was
-- readable by anyone holding the anon key, whatever its status. Writes to
-- `status` have always been locked down properly (the column-level revoke in
-- migration_fix_listings_column_lockdown.sql, plus admin_set_listing_status),
-- but nothing ever restricted reads — so a listing was public from the
-- moment it was submitted, before an admin had seen it, and stayed public
-- after being rejected as a scam. The seller's phone number went with it,
-- since agent_phone is a column on the same row.
--
-- Three readers, one policy:
--   * anyone (signed in or not) sees approved listings — that's the public
--     marketplace, and what the map/list already filtered down to client-side;
--   * the owner sees their own rows in every state, which is what My Listings,
--     the edit form and the rejected/resubmit flow all need;
--   * admin sees everything, which is the Approvals queue.
--
-- Nothing in the app has to change: HomeMapScreen, FavoritesScreen,
-- SellerProfileScreen and ListingDetailScreen all apply the same
-- approved/not-expired/not-sold test in the client already. This makes the
-- server agree with them instead of trusting them.
--
-- Lifecycle state (expired/sold) is deliberately NOT part of this. Those rows
-- still belong to their owner, admin still reviews them, and a buyer who has
-- one saved should see it disappear from the app's own filters rather than
-- from the API — hiding them here would also hide them from the seller's own
-- My Listings, which is where Renew lives.

drop policy if exists "anyone can read listings" on listings;

create policy "approved listings are public" on listings for select
  using (
    status = 'approved'
    or owner_id = auth.uid()
    or private.is_admin()
  );

-- Verify:
--   set role anon;  -- then, as anon:
--   select count(*) from listings where status <> 'approved';  -- expect 0
--   reset role;
select polname, pg_get_expr(polqual, polrelid) as using_expression
from pg_policy
where polrelid = 'listings'::regclass and polcmd = 'r';
