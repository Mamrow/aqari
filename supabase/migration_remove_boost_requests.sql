-- Aqari — removes the admin-approval Featured request flow (replaced by
-- instant self-serve payment via Dpay — see create-boost-payment/dpay-webhook
-- Edge Functions and the `featured_until` column from
-- migration_listing_lifecycle.sql). Same shape as migration_remove_auctions.sql.
-- Run once against the existing live project. Safe to re-run.

drop function if exists public.approve_boost_request(uuid, numeric);
drop function if exists public.reject_boost_request(uuid);
drop table if exists listing_boost_requests;
