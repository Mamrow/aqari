-- Aqari — narrow new-listing alerts from a city to its districts.
--
-- A city is too coarse to be useful where it matters most: Tripoli runs from
-- Janzour to Tajura, roughly 35km end to end, and someone watching for a
-- house in Serraj doesn't want to hear about one in Tajura. Benghazi and
-- Misrata have the same problem at a smaller scale.
--
-- Districts are stored as "city:district" composite keys — 'tripoli:serraj',
-- not 'serraj'. Two reasons:
--
--   1. District keys aren't globally unique, and a bare one would match the
--      wrong city the first time two cities share a district name.
--   2. The Edge Function that sends these has no district→city map and no
--      reason to grow one. A composite key lets it decide everything from
--      the listing's own city and district: does this person's list contain
--      any key starting with "<city>:"? Then they've narrowed that city and
--      the listing has to match exactly. Otherwise the whole city counts.
--
-- That last rule is what keeps the existing behaviour intact: a profile that
-- follows cities and picks no districts keeps getting the whole city, which
-- is what everyone opted into before this column existed.

alter table profiles
  add column if not exists notify_districts text[] not null default '{}';

comment on column profiles.notify_districts is
  'District keys as "city:district" (src/data/districts.js DISTRICTS). Empty for a followed city means the whole city. Narrows notify_cities, never widens it.';

-- Verify:
select column_name, data_type, column_default
from information_schema.columns
where table_name = 'profiles' and column_name = 'notify_districts';
