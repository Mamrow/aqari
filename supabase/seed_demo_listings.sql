-- Aqari — demo listing seed
--
-- Weighted deliberately: ~35 listings in Tripoli, because that's the city the
-- store screenshots are taken in and the map needs real density there for
-- clustering and the price pins to look like a working marketplace. Benghazi
-- and Misrata get two each — just enough to prove the city/district filters
-- actually filter, not enough to matter visually.
--
-- Run this in the Supabase SQL Editor. It runs as `postgres` there, which is
-- what makes it work at all: `status` is revoked from direct owner UPDATE by
-- RLS (see migration_fix_listings_column_lockdown.sql), so an ordinary
-- authenticated insert could never publish an approved listing. The SQL
-- Editor bypasses that.
--
-- ─── PHOTOS ──────────────────────────────────────────────────────────────
-- The image URLs below are generic stock photographs. They exercise the
-- map/list/detail UI, but they are NOT photographs of Libyan property.
--
-- Before any of this ends up in App Store / Play Store screenshots, swap
-- them for photos you own or have licensed. They're all in the `demo_photos`
-- CTE below — change them in that one place and every listing picks up the
-- new set.
--
-- ─── OWNER ───────────────────────────────────────────────────────────────
-- Every listing is attached to a real account, so RLS, "My listings", and
-- the call/WhatsApp buttons all behave like production. By default it grabs
-- the oldest profile in the table; to pin it to a specific account, replace
-- the `owner` CTE body with:
--     select auth_uid as owner_id, phone as agent_phone
--     from profiles where phone = '+218911234567'
--
-- ─── HOW DEMO ROWS ARE IDENTIFIED ────────────────────────────────────────
-- Every row is given a deterministic id in a reserved namespace
-- (d0d0d0d0-0000-4000-8000-...) rather than a visible marker in the title.
-- An earlier version prefixed every title with "[demo] ", which worked but
-- put the word "demo" in the middle of every store screenshot. The id
-- namespace is just as easy to select on and invisible in the UI. It also
-- makes re-running the seed a clean replace instead of a duplicate: the
-- delete below runs first, in the same statement batch.
--
-- To undo everything this inserts:
--     delete from listings where id::text like 'd0d0d0d0-0000-4000-8000-%';
-- ──────────────────────────────────────────────────────────────────────────

-- Re-runnable: clear any previous seed before inserting this one. The second
-- predicate catches rows from the first version of this file, which marked
-- demo listings with a '[demo] ' title prefix instead of an id namespace.
delete from listings
where id::text like 'd0d0d0d0-0000-4000-8000-%'
   or title like '[demo]%';

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
  -- ══ TRIPOLI · FOR SALE · APARTMENTS ════════════════════════════════════
  ('شقة مفروشة في حي الأندلس',
   'شقة واسعة بإطلالة مفتوحة، قريبة من الخدمات والمدارس. تشطيب ممتاز ومصعد وموقف خاص.',
   485000, 165, '3', 'sale', 'apartment', 'tripoli', 'hay_andalus', 32.8751, 13.1283, '{}'::text[], null),
  ('شقة بإطلالة بحرية في حي الأندلس',
   'الطابق الثامن بإطلالة مباشرة على البحر. مطبخ مجهز وتشطيب سوبر لوكس.',
   615000, 180, '3', 'sale', 'apartment', 'tripoli', 'hay_andalus', 32.8764, 13.1301, '{}'::text[], null),
  ('شقة في برج قرقارش',
   'شقة في برج حديث بمصعدين وحراسة على مدار الساعة ومواقف تحت الأرض.',
   720000, 200, '4', 'sale', 'apartment', 'tripoli', 'gargaresh', 32.8688, 13.1102, '{}'::text[], null),
  ('شقة واسعة في بن عاشور',
   'شقة بموقع مركزي قريب من المحلات والمطاعم. مناسبة للعائلات.',
   540000, 175, '3', 'sale', 'apartment', 'tripoli', 'ben_ashour', 32.8836, 13.2008, '{}'::text[], null),
  ('شقة في برج سكني بالظهرة',
   'شقة في الطابق السابع بإطلالة على المدينة، صيانة ممتازة ومولد احتياطي.',
   495000, 160, '3', 'sale', 'apartment', 'tripoli', 'dahra', 32.8907, 13.1951, '{}'::text[], null),
  ('شقة راقية في زاوية الدهماني',
   'شقة في منطقة هادئة وراقية، قريبة من السفارات والمرافق الخدمية.',
   680000, 190, '3', 'sale', 'apartment', 'tripoli', 'zawiyat_dahmani', 32.8942, 13.2069, '{}'::text[], null),
  ('بيت عربي في المدينة القديمة',
   'بيت تقليدي بفناء داخلي، محافظ على طابعه المعماري. فرصة للترميم أو الاستثمار السياحي.',
   275000, 210, '4', 'sale', 'apartment', 'tripoli', 'old_city', 32.8979, 13.1765, '{}'::text[], null),
  ('شقة في شارع ميزران',
   'شقة بموقع تجاري وسكني ممتاز، قريبة من كل الخدمات.',
   430000, 145, '2', 'sale', 'apartment', 'tripoli', 'mizran', 32.8880, 13.1837, '{}'::text[], null),
  ('شقة للبيع في فشلوم',
   'شقة في عمارة هادئة، تشطيب جيد وجاهزة للسكن الفوري.',
   365000, 140, '3', 'sale', 'apartment', 'tripoli', 'fashloum', 32.8893, 13.2031, '{}'::text[], null),
  ('شقة في سوق الجمعة',
   'شقة أرضية بمدخل مستقل، مناسبة للعائلات الصغيرة.',
   340000, 150, '3', 'sale', 'apartment', 'tripoli', 'souq_juma', 32.8839, 13.2565, '{}'::text[], null),

  -- ══ TRIPOLI · FOR SALE · VILLAS ════════════════════════════════════════
  ('فيلا حديثة في قرقارش',
   'فيلا دورين مع حديقة أمامية ومرآب لسيارتين. تشطيب حديث بالكامل، جاهزة للسكن.',
   1450000, 420, '5', 'sale', 'villa', 'tripoli', 'gargaresh', 32.8674, 13.1128, '{}'::text[], null),
  ('فيلا دورين في حي الأندلس',
   'فيلا بتصميم عصري وحديقة خلفية، في واحدة من أهدأ مناطق طرابلس.',
   1250000, 380, '5', 'sale', 'villa', 'tripoli', 'hay_andalus', 32.8739, 13.1268, '{}'::text[], null),
  ('فيلا بحديقة في جنزور',
   'فيلا مستقلة على أرض 400 متر، حديقة واسعة وبئر ماء ومولد.',
   980000, 350, '4', 'sale', 'villa', 'tripoli', 'janzour', 32.8261, 13.0248, '{}'::text[], null),
  ('فيلا مع مسبح في تاجوراء',
   'فيلا فخمة بمسبح وحديقة كبيرة، قريبة من الشاطئ. مثالية للعائلات الكبيرة.',
   1750000, 500, '6', 'sale', 'villa', 'tripoli', 'tajura', 32.8828, 13.3511, '{}'::text[], null),
  ('فيلا في سيدي المصري',
   'فيلا دورين في منطقة سكنية هادئة، قريبة من المدارس والمرافق.',
   1120000, 330, '4', 'sale', 'villa', 'tripoli', 'sidi_masri', 32.8698, 13.2113, '{}'::text[], null),

  -- ══ TRIPOLI · FOR SALE · LAND, SEMI-FINISHED, COMMERCIAL ═══════════════
  ('منزل نصف تشطيب في عين زارة',
   'منزل مستقل نصف تشطيب على أرض 300 متر، البنية التحتية مكتملة والصك جاهز للنقل.',
   620000, 300, '4', 'sale', 'semi_finished', 'tripoli', 'ain_zara', 32.7961, 13.2881, '{}'::text[], null),
  ('منزل نصف تشطيب في أبو سليم',
   'العظم مكتمل والكهرباء والماء موصولان. يحتاج تشطيبات داخلية فقط.',
   455000, 260, '4', 'sale', 'semi_finished', 'tripoli', 'abu_salim', 32.8502, 13.1719, '{}'::text[], null),
  ('أرض سكنية في قصر بن غشير',
   'أرض بموقع ممتاز على شارع مفتوح، مناسبة للبناء الفوري.',
   310000, 600, null, 'sale', 'land', 'tripoli', 'qasr_bin_ghashir', 32.8444, 13.2061, '{}'::text[], null),
  ('أرض سكنية في جنزور',
   'قطعة أرض سكنية على شارعين، منطقة هادئة ومخدومة بالكامل.',
   390000, 500, null, 'sale', 'land', 'tripoli', 'janzour', 32.8247, 13.0275, '{}'::text[], null),
  ('أرض واسعة في السواني',
   'أرض كبيرة مناسبة لمشروع سكني أو استثماري، أوراق كاملة.',
   275000, 750, null, 'sale', 'land', 'tripoli', 'sawani', 32.8514, 13.1438, '{}'::text[], null),
  ('محل تجاري في سوق الجمعة',
   'محل بواجهة زجاجية على شارع رئيسي، حركة تجارية عالية.',
   310000, 60, null, 'sale', 'shop', 'tripoli', 'souq_juma', 32.8828, 13.2577, '{}'::text[], null),
  ('محل على الشارع العام بالقرجي',
   'محل بموقع حيوي وواجهة واسعة، يصلح لمختلف الأنشطة التجارية.',
   265000, 55, null, 'sale', 'shop', 'tripoli', 'gorji', 32.8669, 13.1285, '{}'::text[], null),
  ('مكتب إداري في بن عاشور',
   'مكتب في مبنى إداري حديث، مقسّم إلى ثلاث غرف واستقبال. يشمل تكييف مركزي.',
   430000, 120, null, 'sale', 'office', 'tripoli', 'ben_ashour', 32.8825, 13.1990, '{}'::text[], null),
  ('مكتب في رأس حسن',
   'مكتب جاهز بمساحة مفتوحة وإطلالة جيدة، قريب من المرافق الحكومية.',
   380000, 105, null, 'sale', 'office', 'tripoli', 'ras_hassan', 32.8705, 13.2101, '{}'::text[], null),

  -- ══ TRIPOLI · FOR RENT ═════════════════════════════════════════════════
  ('شقة مفروشة للإيجار في زاوية الدهماني',
   'شقة مفروشة بالكامل، غرفتان وصالة. الإيجار شامل الماء والصيانة.',
   2400, 130, '2', 'rent', 'apartment', 'tripoli', 'zawiyat_dahmani', 32.8930, 13.2081, '{}'::text[], null),
  ('شقة عائلية في السياحية',
   'شقة أرضية بمدخل مستقل وحوش صغير، مناسبة للعائلات. قريبة من المحلات.',
   1800, 145, '3', 'rent', 'apartment', 'tripoli', 'siyahiya', 32.8551, 13.0718, '{}'::text[], null),
  ('شقة مفروشة في حي الأندلس',
   'شقة مفروشة بالكامل بأثاث حديث، مكيفات ومولد وإنترنت.',
   3200, 160, '3', 'rent', 'apartment', 'tripoli', 'hay_andalus', 32.8758, 13.1275, '{}'::text[], null),
  ('شقة بإطلالة في قرقارش',
   'شقة في الطابق الخامس بإطلالة مفتوحة، مصعد ومواقف خاصة.',
   3800, 175, '3', 'rent', 'apartment', 'tripoli', 'gargaresh', 32.8695, 13.1119, '{}'::text[], null),
  ('شقة للإيجار في بن عاشور',
   'شقة نظيفة في موقع مركزي، قريبة من كل الخدمات.',
   2200, 140, '2', 'rent', 'apartment', 'tripoli', 'ben_ashour', 32.8843, 13.2015, '{}'::text[], null),
  ('شقة للإيجار في النوفليين',
   'شقة بسعر مناسب في منطقة هادئة، تصلح للعائلات الصغيرة.',
   1650, 125, '2', 'rent', 'apartment', 'tripoli', 'nawfaliyeen', 32.8893, 13.2168, '{}'::text[], null),
  ('مكتب للإيجار في السراج',
   'مكتب جاهز بمساحة مفتوحة، يصلح لشركة ناشئة أو عيادة. موقف سيارات متاح.',
   3200, 95, null, 'rent', 'office', 'tripoli', 'serraj', 32.8335, 13.0824, '{}'::text[], null),
  ('محل للإيجار في ميزران',
   'محل في شارع تجاري مزدحم، جاهز للتشغيل الفوري.',
   2600, 65, null, 'rent', 'shop', 'tripoli', 'mizran', 32.8868, 13.1825, '{}'::text[], null),

  -- ══ TRIPOLI · FOR RENT · CHALETS / ISTIRAHA ════════════════════════════
  ('استراحة بمسبح في تاجوراء',
   'استراحة بمسبح كبير وحديقة واسعة ومولد كهربائي. متاحة للحجز اليومي للعائلات.',
   900, 800, '3', 'rent', 'chalet', 'tripoli', 'tajura', 32.8842, 13.3517,
   '{wifi,pool,generator}'::text[], 'families'),
  ('استراحة للشباب في الكريمية',
   'استراحة بمسبح ومنطقة جلوس خارجية، مجهزة للحجز اليومي. إنترنت متوفر.',
   750, 600, '2', 'rent', 'chalet', 'tripoli', 'kremia', 32.7758, 13.0841,
   '{wifi,pool}'::text[], 'youth'),
  ('استراحة عائلية في جنزور',
   'استراحة واسعة بمسبح وملعب وحديقة، مناسبة للمناسبات العائلية.',
   1100, 900, '4', 'rent', 'chalet', 'tripoli', 'janzour', 32.8269, 13.0256,
   '{wifi,pool,generator}'::text[], 'families'),

  -- ══ OTHER CITIES · filter coverage only, not for screenshots ═══════════
  ('فيلا في الفويهات',
   'فيلا دورين في منطقة راقية، حديقة خلفية ومرآب مغطى. قريبة من الجامعة.',
   1180000, 350, '5', 'sale', 'villa', 'benghazi', 'fuwayhat', 32.0771, 20.0883, '{}'::text[], null),
  ('شقة للإيجار في قاريونس',
   'شقة قريبة من جامعة بنغازي، مناسبة للعائلات الصغيرة أو الطلاب.',
   1500, 120, '2', 'rent', 'apartment', 'benghazi', 'qaryounis', 32.0472, 20.0409, '{}'::text[], null),
  ('شقة جديدة في مصراتة',
   'شقة في عمارة حديثة قرب وسط المدينة، تشطيب سوبر لوكس ولم تُسكن من قبل.',
   395000, 155, '3', 'sale', 'apartment', 'misrata', null, 32.3752, 15.0898, '{}'::text[], null),
  ('محل للإيجار في مصراتة',
   'محل في موقع حيوي بشارع رئيسي، جاهز للتشغيل الفوري.',
   2800, 70, null, 'rent', 'shop', 'misrata', null, 32.3739, 15.0917, '{}'::text[], null)
)
insert into listings (
  id, title, description, price, area, rooms,
  listing_type, property_type, city, district,
  latitude, longitude, amenities, audience_target,
  images, agent_phone, agent_id, owner_id,
  status, listing_state, expires_at
)
select
  -- Reserved id namespace, so the seed is identifiable (and removable)
  -- without putting a marker in any user-visible field.
  ('d0d0d0d0-0000-4000-8000-' || lpad((row_number() over ())::text, 12, '0'))::uuid,
  r.title,
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

-- Sanity check — Tripoli should dominate, the other two cities are token.
select city, listing_type, count(*)
from listings
where id::text like 'd0d0d0d0-0000-4000-8000-%'
group by city, listing_type
order by city, listing_type;
