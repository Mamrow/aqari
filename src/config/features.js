// Everything to do with Boost/Featured billing is hidden from the mobile app
// for launch — not just the purchase flow (src/components/BoostListingSection.js)
// but every visible trace of it: the featured badge/border/carousel on
// listings (ListingCard.js, HomeMapScreen.js) and the payment-history screens
// (seller-facing row in SettingsScreen.js, the admin Payments tab in
// AdminTabs.js). Apple/Google in-app purchase rules generally require native
// IAP for a digital entitlement unlocked purely in-app, but neither storefront
// has a realistic path to being payable by Libyan users the way the existing
// DPay gateways (Edfali, Sadad, Moamalat, MasrefyPay) already are. None of the
// underlying code is removed — edge functions, boost_payment_sessions, the RLS
// lockdown on is_featured/featured_until, PaymentHistoryScreen itself — only
// unreferenced from the UI. Flip this back to true once a compliant, actually
// payable path exists.
export const BOOST_PURCHASES_ENABLED = false;

// A hidden way to prove crash reporting actually works in a *release* build,
// which is the only build where it matters: dev builds symbolicate locally
// and never exercise the source-map upload. Long-press the version row in
// Settings (see SettingsScreen.js) — no label, no chevron, nothing a real
// user would find by accident.
//
// TURN THIS OFF BEFORE THE APP STORE SUBMISSION. It's a deliberate crash
// sitting in a shipped binary; the fact that it's hard to reach is not a
// reason to leave it there.
export const CRASH_TEST_ENABLED = true;
