-- Aqari — adds "semi_finished" (نص تشطيب) as a Property Type value. Widens
-- the property_type check constraint on the already-created listings table.
-- Run once against the existing live project. Safe to re-run.

alter table listings drop constraint if exists listings_property_type_check;
alter table listings add constraint listings_property_type_check
  check (property_type in ('apartment', 'villa', 'office', 'land', 'shop', 'chalet', 'semi_finished'));
