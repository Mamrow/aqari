-- Aqari — tracks Dpay payment sessions opened for Featured-listing purchases.
-- Populated/updated only by the create-boost-payment, verify-boost-payment,
-- and dpay-webhook Edge Functions (service-role client, bypasses RLS) — no
-- insert/update policy for authenticated below, same lockdown model as
-- migration_listing_lifecycle.sql's column revoke on listings. Run once
-- against the existing live project. Safe to re-run.

create table if not exists boost_payment_sessions (
  id uuid primary key default gen_random_uuid(),
  -- Dpay's own session id (an integer on their side) — unique so a webhook
  -- delivery can look up which listing/duration a payment.paid event is for.
  dpay_session_id bigint not null unique,
  listing_id uuid not null references listings(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  pay_method text not null check (pay_method in ('edfali', 'sadad', 'moamalat')),
  duration_days integer not null check (duration_days in (3, 7, 14)),
  amount numeric not null,
  status text not null default 'pending' check (status in ('pending', 'paid', 'failed', 'expired')),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

alter table boost_payment_sessions enable row level security;

drop policy if exists "owner can read own boost payment sessions" on boost_payment_sessions;
create policy "owner can read own boost payment sessions" on boost_payment_sessions for select
  using (owner_id = auth.uid());
