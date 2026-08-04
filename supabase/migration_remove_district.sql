-- Aqari — removes the Tripoli district/city feature entirely (filter dropdown
-- and Add Listing picker were removed from the app; see src/data/districts.js,
-- now deleted). Run once against the existing live project. Safe to re-run.

alter table listings drop column if exists district;
