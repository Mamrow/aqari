-- Aqari — make "sign in before you can see a seller's number" a rule the
-- database enforces, not just something the app politely does.
--
-- ⚠ RUN THIS BEFORE SHIPPING THE APP UPDATE THAT GOES WITH IT. The app's
-- signed-out listings query names `has_contact`, which this migration
-- creates; an old database plus a new app means anonymous browsing fails
-- outright. Migration first, then `eas update`. The reverse order is safe
-- too (an old app asks for `*` and still works), just not the other way.
--
-- THE PROBLEM
-- The anon key is inside the app bundle, where anyone can extract it — that
-- is by design, and RLS is what makes it safe. But RLS hides *rows*, not
-- *fields*. migration_listings_read_approved_only.sql stopped unapproved
-- listings being public; approved ones still carried agent_phone (and
-- agent_id, which holds the same number), so one unauthenticated request
-- could collect every seller's phone number in the marketplace. The app's
-- own "sign in first" check on the Call/WhatsApp buttons never runs for
-- someone talking to the API directly.
--
-- THE FIX
-- Column privileges, the only mechanism that works at field level. Two
-- things make this fiddlier than a one-line REVOKE:
--
--   1. A column-level revoke is NEVER honoured while a table-level grant
--      still stands — a privilege check passes if ANY grant allows it. This
--      is the same trap documented at length in
--      migration_fix_listings_column_lockdown.sql, where a column revoke on
--      INSERT/UPDATE had silently never been in effect. So: revoke SELECT on
--      the table from anon, then grant back the specific columns.
--
--   2. `select *` then fails for anon on the whole row rather than quietly
--      dropping the forbidden column, so the app has to name its columns.
--      See LISTING_PUBLIC_COLUMNS in src/lib/mappers.js — that list and the
--      grant below must stay in step.
--
-- `authenticated` is untouched: a signed-in account reads the full row
-- exactly as before, which is what keeps My Listings, the edit form, the
-- admin screens and the seller directory working unchanged.

-- The Call/WhatsApp buttons are hidden for a listing whose seller deleted
-- their account (delete-account blanks agent_phone). The screen decided that
-- by looking at the number itself, which signed-out visitors no longer have
-- — so the answer travels as its own boolean. Generated and stored, so it
-- can never drift from the column it describes, and it updates itself the
-- moment agent_phone is blanked.
alter table listings add column if not exists has_contact boolean
  generated always as (agent_phone is not null and agent_phone <> '') stored;

revoke select on listings from anon;

-- Everything except agent_phone and agent_id. Both hold a phone number:
-- agent_phone is the listing's contact, agent_id is the seller account's own
-- number (the app's human-facing "my listings" key), so withholding one
-- without the other would achieve nothing.
grant select (
  id,
  title,
  price,
  area,
  description,
  listing_type,
  property_type,
  rooms,
  images,
  amenities,
  audience_target,
  city,
  district,
  latitude,
  longitude,
  status,
  owner_id,
  created_at,
  is_featured,
  listing_state,
  expires_at,
  renewed_at,
  featured_until,
  has_contact
) on listings to anon;

-- Verify — as anon, the first succeeds and the second is denied:
--   set role anon;
--   select id, title, has_contact from listings limit 1;
--   select agent_phone from listings limit 1;  -- expect: permission denied
--   reset role;
select column_name, privilege_type
from information_schema.column_privileges
where table_name = 'listings' and grantee = 'anon' and privilege_type = 'SELECT'
order by column_name;
