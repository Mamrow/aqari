-- Aqari — re-adds the Tripoli district/city tag to listings (see
-- src/data/districts.js for the full list and coordinates). The feature was
-- previously fully removed (see migration_remove_district.sql) and is now
-- being reintroduced with dropdown pickers for both submitting and browsing
-- listings. No check constraint, by design — the district list is expected
-- to grow over time from that JS file alone, without a schema migration
-- each time. Run once against the existing live project. Safe to re-run.

alter table listings add column if not exists district text;
