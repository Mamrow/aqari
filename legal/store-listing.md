# App Store / Google Play Listing Copy

## Category
**Lifestyle** or **House & Home** (iOS) / **House & Home** (Google Play). Both stores also allow a secondary category — consider **Business** as secondary if listing agents/sellers is emphasized.

## App Name
Aqari

## Subtitle / Tagline (iOS: 30 chars max)
Buy, rent & list property — EN: "Buy, rent, list — Libya"
AR: "بيع وشراء وإيجار العقارات"

## Short Description (Google Play: 80 chars max)
EN: "Browse, save, and list properties for sale or rent near you."
AR: "تصفح واحفظ وأضف عقارات للبيع أو الإيجار بالقرب منك."

## Full Description

**English:**

Aqari is a real estate marketplace for browsing, saving, and listing properties for sale or rent.

- **Browse on a map** — see listings near you at a glance, filter by sale/rent, property type, and more.
- **Save favorites** — keep track of properties you're interested in.
- **List your own property** — add photos, set your price, and reach buyers directly. Every listing is reviewed before it goes live.
- **Chalet/istiraha rentals** — dedicated filters for short-term family/youth rentals.
- **Contact sellers directly** — call or WhatsApp straight from a listing.
- **Bilingual** — full Arabic and English support.

Whether you're looking for your next home or listing a property to sell or rent, Aqari makes it simple.

**Arabic:**

عقاري هو سوق عقاري لتصفح وحفظ ونشر العقارات للبيع أو الإيجار.

- **تصفح على الخريطة** — شاهد العقارات القريبة منك بسهولة، وصفّها حسب البيع/الإيجار ونوع العقار وغير ذلك.
- **احفظ المفضلة** — تتبع العقارات التي تهمك.
- **أضف عقارك الخاص** — أضف الصور، وحدد السعر، وتواصل مع المشترين مباشرة. تخضع جميع الإعلانات للمراجعة قبل نشرها.
- **إيجار الاستراحات** — فلاتر مخصصة لإيجارات العائلات والشباب قصيرة المدى.
- **تواصل مباشرة مع البائعين** — اتصل أو راسل عبر واتساب مباشرة من الإعلان.
- **ثنائي اللغة** — دعم كامل للعربية والإنجليزية.

سواء كنت تبحث عن منزلك القادم أو تريد نشر عقار للبيع أو الإيجار، عقاري يجعل الأمر بسيطًا.

## Keywords (iOS: 100 chars total, comma-separated, no spaces after commas needed)
`real estate,property,rent,sale,libya,tripoli,apartment,villa,chalet,istiraha,realty,homes`

## What's New (first release)
EN: "Welcome to Aqari — browse, save, and list properties for sale or rent."
AR: "مرحبًا بكم في عقاري — تصفح واحفظ وأضف عقارات للبيع أو الإيجار."

## Support URL
https://lyaqari.netlify.app/support/

## Marketing URL (optional, iOS)
https://lyaqari.netlify.app/

## Privacy Policy URL (required by both stores)
https://lyaqari.netlify.app/privacy/

## Terms of Service URL
https://lyaqari.netlify.app/terms/

## Account Deletion URL (required by Google Play; not required by Apple since deletion is also available in-app)
https://lyaqari.netlify.app/delete-account/ — has both in-app instructions and a real request mechanism (a form that opens a pre-filled email to aaqaaryy@gmail.com), not just descriptive text.

All four pages live at [legal/site/](site/) in this repo (source of truth — edit there, then re-zip and redeploy to Netlify to update). Bilingual EN/AR with a language toggle, no login required, verified live.

---

## Notes / Still Needed
- Screenshots: both stores require screenshots per device size class (iOS: 6.7" and 6.5" iPhone at minimum; Android: phone + optionally tablet). Take these from a real build once EAS build is done, not Expo Go.
- App icon: needs a proper 1024×1024 source (current assets are 554×554 — see conversation).
- Google Play "Data safety" form and Apple "App Privacy" (nutrition label) — fill these out based on the Information We Collect section in legal/privacy-policy.md: name, phone number, email, photos, location (collected but not stored/transmitted — mark as "used but not linked to identity, not stored").
- Privacy Policy / Terms / Support / Delete Account: ✅ done, hosted at https://lyaqari.netlify.app, verified live and publicly reachable. The app also provides native in-app versions and links to the corresponding public pages.
- Account deletion: ✅ done. The Edge Function removes the caller's avatar and listing media from the `listing-photos` bucket, blanks `agent_phone`/`agent_id` on their retained listings (so their real phone number stops being publicly dialable — contactActions.js and ListingDetailScreen both treat an empty phone as "seller no longer available"), then deletes the Auth account.
