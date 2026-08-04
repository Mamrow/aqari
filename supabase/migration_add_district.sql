-- Aqari — adds a district tag to listings (Abu Salim, Ain Zara, Serraj,
-- Tajura, Qasr Bin Ghashir — see src/data/districts.js for the full list and
-- coordinates). Run once against the existing live project. Safe to re-run.

alter table listings add column if not exists district text;
