-- Aqari — a semi-finished property can be sold, not rented.
--
-- "نص تشطيب" is an unfinished building sold as it stands for the buyer to
-- complete. There is nothing to live in yet, so a rental listing of one is
-- not a thing that exists. The filter sheet and the listing form no longer
-- offer the combination (propertyTypesForListingType in
-- src/data/propertyTypes.js); this is what stops a direct REST insert
-- creating it anyway, the same reasoning as the photo minimum.
--
-- Written as "if semi_finished then sale" rather than a list of allowed
-- pairs, so adding a property type never silently becomes a schema change.
-- listing_type also permits 'daily' at the column level, which this
-- excludes for the same reason it excludes 'rent'.

-- 1. Any existing rows that would break the rule. Expect none — the
--    combination has never been offered under Rent in the app.
select id, listing_type, property_type, created_at
from listings
where property_type = 'semi_finished' and listing_type <> 'sale'
order by created_at desc;

-- 2. NOT VALID, same as listings_min_photos: enforced for every write from
--    now on, existing rows left alone. If step 1 returned rows, decide what
--    they should be before validating rather than having a save fail under
--    someone weeks from now.
alter table listings
  add constraint listings_semi_finished_is_sale check (
    property_type <> 'semi_finished' or listing_type = 'sale'
  ) not valid;

-- 3. Once step 1 is empty:
-- alter table listings validate constraint listings_semi_finished_is_sale;

-- Verify:
select conname, convalidated, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'listings'::regclass and conname = 'listings_semi_finished_is_sale';
