-- Aqari — adds a city tag to listings, alongside the existing district tag
-- (see src/data/districts.js — CITIES + DISTRICTS, each district now scoped
-- to a city). No check constraint, by design, same reasoning as district:
-- the city/district lists are expected to grow over time from that JS file
-- alone. Run once against the existing live project. Safe to re-run.

alter table listings add column if not exists city text;
