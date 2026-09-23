-- Aqari — make the photo minimum a rule, not a disabled button.
--
-- AddListingScreen won't let you submit below the minimum for the property
-- type (MIN_PHOTOS_BY_PROPERTY_TYPE in src/data/propertyTypes.js), but that
-- is the app declining to ask. The anon key is in the bundle, so a row can
-- be inserted straight over the REST API with one photo or none, and until
-- now the database would take it — same class of gap as the seller phone
-- number before migration_hide_seller_phone_from_anon.sql, just less
-- sensitive.
--
-- The tiers, which must stay in step with that file:
--   5  apartment, villa, chalet  — somewhere people live or stay
--   3  office, shop, semi_finished — one commercial or unfinished space
--   1  land
-- Anything else falls to 5, matching the client's own fallback: a property
-- type added later should ask for more photos than it needs, not fewer.
--
-- coalesce() is load-bearing. array_length() on an empty array returns NULL,
-- not 0, and `NULL >= 5` is NULL, which a CHECK constraint treats as a pass
-- — so without it this would happily accept a listing with no photos at all,
-- which is the exact case it exists to stop.
--
-- Counts media, not strictly photographs: the app puts listing videos in the
-- same `images` column, and a video of the property is worth at least as
-- much as a still of it.

-- 1. Look before you leap — any existing rows this would reject. The old
--    rule was 5 for every type, so this should come back empty.
select id, property_type, coalesce(array_length(images, 1), 0) as media_count, created_at
from listings
where coalesce(array_length(images, 1), 0) < case property_type
    when 'land' then 1
    when 'office' then 3
    when 'shop' then 3
    when 'semi_finished' then 3
    else 5
  end
order by created_at desc;

-- 2. NOT VALID: enforced for every insert and update from this moment, but
--    existing rows are not re-checked. Deliberate — a listing that predates
--    the rule should keep working, and its owner shouldn't discover the
--    change as a failure to save an unrelated price edit. (Note that editing
--    such a row WILL be checked, since the update itself has to satisfy the
--    constraint.)
alter table listings
  add constraint listings_min_photos check (
    coalesce(array_length(images, 1), 0) >= case property_type
      when 'land' then 1
      when 'office' then 3
      when 'shop' then 3
      when 'semi_finished' then 3
      else 5
    end
  ) not valid;

-- 3. Only once step 1 comes back empty, promote it to cover the whole table.
--    Safe to leave un-run: the constraint already guards every new write.
-- alter table listings validate constraint listings_min_photos;

-- Verify:
select conname, convalidated, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'listings'::regclass and conname = 'listings_min_photos';
