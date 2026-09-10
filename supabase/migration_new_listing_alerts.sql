-- Aqari — per-city alerts for new listings.
--
-- Two columns rather than one, because "do you want alerts" and "about
-- where" are genuinely separate answers: someone can leave alerts on while
-- changing which cities they follow, and turning alerts off shouldn't
-- silently discard the cities they picked.
--
-- Default OFF. Apple and Google both treat a push about someone else's new
-- listing as promotional rather than transactional — it has to be opted
-- into, not out of, and the app has to work fully without it.

alter table profiles
  add column if not exists notify_new_listings boolean not null default false,
  add column if not exists notify_cities text[] not null default '{}';

comment on column profiles.notify_new_listings is
  'Opted in to alerts about new approved listings. Off by default — this is promotional push, not transactional.';
comment on column profiles.notify_cities is
  'City keys (src/data/districts.js CITIES) this account wants alerts for. Empty with alerts on means every city.';

-- Sending a batch of alerts means reading other people's rows — which RLS
-- correctly forbids to everyone. The notify-new-listing Edge Function uses
-- the service role for exactly that and nothing else; no client-side path
-- can enumerate tokens.
--
-- An index because the send query filters on it every time a listing is
-- approved, and it's a tiny partial index: only rows that opted in.
create index if not exists profiles_notify_new_listings_idx
  on profiles (notify_new_listings)
  where notify_new_listings;

-- Verify:
select column_name, data_type, column_default
from information_schema.columns
where table_name = 'profiles'
  and column_name in ('notify_new_listings', 'notify_cities');
