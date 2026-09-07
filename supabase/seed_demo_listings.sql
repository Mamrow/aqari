-- Aqari — demo listing seed (Tripoli, Benghazi, Misrata)
--
-- Run this in the Supabase SQL Editor. It runs as `postgres` there, which is
-- what makes it work at all: `status` is revoked from direct owner UPDATE by
-- RLS (see migration_fix_listings_column_lockdown.sql), so an ordinary
-- authenticated insert could never publish an approved listing. The SQL
-- Editor bypasses that.
--
-- ─── PHOTOS ──────────────────────────────────────────────────────────────
-- The image URLs below are generic stock photographs. They exercise the
-- map/list/detail UI and give clustering something to cluster, but they are
-- NOT photographs of Libyan property.
--
-- Before any of this ends up in App Store / Play Store screenshots, swap
-- them for photos you own or have licensed. They're all in the `demo_photos`
-- CTE below — change them in that one place and every listing picks up the
-- new set.
--
-- ─── OWNER ───────────────────────────────────────────────────────────────
-- Every listing is attached to a real account, so RLS, "My listings", and
-- the call/WhatsApp buttons all behave like production. By default it grabs
-- the first profile in the table; to pin it to a specific account, replace
-- the `owner` CTE body with:
--     select auth_uid as owner_id, phone as agent_phone
--     from profiles where phone = '+218911234567'
--
-- To undo everything this inserts:
--     delete from listings where title like '[demo]%';
-- ──────────────────────────────────────────────────────────────────────────

with owner as (
  select auth_uid as owner_id, phone as agent_phone
  from profiles
  where auth_uid is not null   -- a profile with no auth row can't own a listing
  order by created_at
  limit 1
),
demo_photos as (
  select
    'https://picsum.photos/seed/aqari-a/1200/800' as p1,
    'https://picsum.photos/seed/aqari-b/1200/800' as p2,
    'https://picsum.photos/seed/aqari-c/1200/800' as p3,
    'https://picsum.photos/seed/aqari-d/1200/800' as p4,
    'https://picsum.photos/seed/aqari-e/1200/800' as p5,
    'https://picsum.photos/seed/aqari-f/1200/800' as p6
),
rows (title, description, price, area, rooms, listing_type, property_type,
      city, district, latitude, longitude, amenities, audience_target) as (
  values
  -- ── Tripoli · for sale ────────────────────────────────────────────────
  ('شقة مفروشة في حي الأندلس',
   'شقة واسعة بإطلالة مفتوحة، قريبة من الخدمات والمدارس. تشطيب ممتاز ومصعد وموقف خاص.',
   485000, 165, '3', 'sale', 'apartment', 'tripoli', 'hay_andalus', 32.8753, 13.1291,
   '{}'::text[], null),

  ('فيلا حديثة في قرقارش',
   'فيلا دورين مع حديقة أمامية ومرآب لسيارتين. تشطيب حديث بالكامل، جاهزة للسكن.',
   1450000, 420, '5', 'sale', 'villa', 'tripoli', 'gargaresh', 32.8688, 13.1102,
   '{}'::text[], null),

  ('منزل نصف تشطيب في عين زارة',
   'منزل مستقل نصف تشطيب على أرض 300 متر، البنية التحتية مكتملة والصك جاهز للنقل.',
   620000, 300, '4', 'sale', 'semi_finished', 'tripoli', 'ain_zara', 32.7961, 13.2881,
   '{}'::text[], null),

  ('أرض سكنية في جنزور',
   'قطعة أرض سكنية على شارعين، منطقة هادئة ومخدومة بالكامل. مناسبة للبناء الفوري.',
   390000, 500, null, 'sale', 'land', 'tripoli', 'janzour', 32.8261, 13.0248,
   '{}'::text[], null),

  ('شقة في برج سكني — الظهرة',
   'شقة في الطابق السابع بمصعدين وحراسة على مدار الساعة. إطلالة على المدينة.',
   540000, 190, '3', 'sale', 'apartment', 'tripoli', 'dahra', 32.8907, 13.1951,
   '{}'::text[], null),

  ('محل تجاري في سوق الجمعة',
   'محل بواجهة زجاجية على شارع رئيسي، حركة تجارية عالية. مناسب لمختلف الأنشطة.',
   310000, 60, null, 'sale', 'shop', 'tripoli', 'souq_juma', 32.8841, 13.2563,
   '{}'::text[], null),

  ('مكتب إداري في بن عاشور',
   'مكتب في مبنى إداري حديث، مقسّم إلى ثلاث غرف واستقبال. يشمل تكييف مركزي.',
   430000, 120, null, 'sale', 'office', 'tripoli', 'ben_ashour', 32.8836, 13.2008,
   '{}'::text[], null),

  ('بيت عربي في المدينة القديمة',
   'بيت تقليدي بفناء داخلي، محافظ على طابعه المعماري. فرصة للترميم أو الاستثمار السياحي.',
   275000, 210, '4', 'sale', 'apartment', 'tripoli', 'old_city', 32.8979, 13.1765,
   '{}'::text[], null),

  -- ── Tripoli · for rent ────────────────────────────────────────────────
  ('شقة للإيجار في زاوية الدهماني',
   'شقة مفروشة بالكامل، غرفتان وصالة. الإيجار شامل الماء والصيانة.',
   2400, 130, '2', 'rent', 'apartment', 'tripoli', 'zawiyat_dahmani', 32.8942, 13.2069,
   '{}'::text[], null),

  ('شقة عائلية في السياحية',
   'شقة أرضية بمدخل مستقل وحوش صغير، مناسبة للعائلات. قريبة من المحلات.',
   1800, 145, '3', 'rent', 'apartment', 'tripoli', 'siyahiya', 32.8551, 13.0718,
   '{}'::text[], null),

  ('مكتب للإيجار في السراج',
   'مكتب جاهز بمساحة مفتوحة، يصلح لشركة ناشئة أو عيادة. موقف سيارات متاح.',
   3200, 95, null, 'rent', 'office', 'tripoli', 'serraj', 32.8335, 13.0824,
   '{}'::text[], null),

  ('استراحة بمسبح في تاجوراء',
   'استراحة بمسبح كبير وحديقة واسعة ومولد كهربائي. متاحة للحجز اليومي للعائلات.',
   900, 800, '3', 'rent', 'chalet', 'tripoli', 'tajura', 32.8842, 13.3517,
   '{wifi,pool,generator}'::text[], 'families'),

  ('استراحة للشباب في الكريمية',
   'استراحة بمسبح ومنطقة جلوس خارجية، مجهزة للحجز اليومي. إنترنت متوفر.',
   750, 600, '2', 'rent', 'chalet', 'tripoli', 'kremia', 32.7758, 13.0841,
   '{wifi,pool}'::text[], 'youth'),

  -- ── Benghazi ──────────────────────────────────────────────────────────
  ('فيلا في الفويهات',
   'فيلا دورين في منطقة راقية، حديقة خلفية ومرآب مغطى. قريبة من الجامعة.',
   1180000, 350, '5', 'sale', 'villa', 'benghazi', 'fuwayhat', 32.0771, 20.0883,
   '{}'::text[], null),

  ('شقة للإيجار في قاريونس',
   'شقة قريبة من جامعة بنغازي، مناسبة للعائلات الصغيرة أو الطلاب.',
   1500, 120, '2', 'rent', 'apartment', 'benghazi', 'qaryounis', 32.0472, 20.0409,
   '{}'::text[], null),

  ('أرض تجارية في البركة',
   'أرض على شارع تجاري رئيسي، مناسبة لمشروع استثماري. مساحة كبيرة وواجهة واسعة.',
   860000, 750, null, 'sale', 'land', 'benghazi', 'baraka', 32.0981, 20.0738,
   '{}'::text[], null),

  -- ── Misrata ───────────────────────────────────────────────────────────
  ('شقة جديدة في مصراتة',
   'شقة في عمارة حديثة قرب وسط المدينة، تشطيب سوبر لوكس ولم تُسكن من قبل.',
   395000, 155, '3', 'sale', 'apartment', 'misrata', null, 32.3752, 15.0898,
   '{}'::text[], null),

  ('محل للإيجار في مصراتة',
   'محل في موقع حيوي بشارع رئيسي، جاهز للتشغيل الفوري.',
   2800, 70, null, 'rent', 'shop', 'misrata', null, 32.3739, 15.0917,
   '{}'::text[], null)
)
insert into listings (
  title, description, price, area, rooms,
  listing_type, property_type, city, district,
  latitude, longitude, amenities, audience_target,
  images, agent_phone, agent_id, owner_id,
  status, listing_state, expires_at
)
select
  '[demo] ' || r.title,
  r.description,
  r.price,
  r.area,
  r.rooms,
  r.listing_type,
  r.property_type,
  r.city,
  r.district,
  r.latitude,
  r.longitude,
  r.amenities,
  r.audience_target,
  -- Two or three photos each, rotated so neighbouring cards don't look identical.
  case (row_number() over ()) % 3
    when 0 then array[p.p1, p.p2, p.p3]
    when 1 then array[p.p4, p.p5]
    else        array[p.p6, p.p1, p.p4]
  end,
  o.agent_phone,
  o.agent_phone,
  o.owner_id,
  'approved',
  'active',
  now() + interval '30 days'
from rows r
cross join owner o
cross join demo_photos p;

-- Sanity check — should return one row per city with the counts you expect.
select city, listing_type, count(*)
from listings
where title like '[demo]%'
group by city, listing_type
order by city, listing_type;
