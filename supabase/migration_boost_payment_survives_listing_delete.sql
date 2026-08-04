-- boost_payment_sessions is a financial record (what a seller paid, when,
-- for what) — it shouldn't disappear just because the listing it was for
-- later gets deleted. It previously CASCADE-deleted with the listing,
-- silently erasing payment history for both the seller and admin oversight.
-- Switch to SET NULL: the payment row survives, listing_id just goes null
-- (already handled by the client — PaymentHistoryScreen falls back to
-- "Deleted listing" via the embedded listings() join coming back empty).
alter table boost_payment_sessions
  drop constraint boost_payment_sessions_listing_id_fkey;

alter table boost_payment_sessions
  alter column listing_id drop not null;

alter table boost_payment_sessions
  add constraint boost_payment_sessions_listing_id_fkey
  foreign key (listing_id) references listings(id) on delete set null;
