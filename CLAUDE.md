# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

```bash
npm start                    # expo start — Metro bundler / dev server
npm run android               # expo start --android
npm run ios                   # expo start --ios
npm run typecheck:mobile       # tsc --noEmit (app code; tsconfig excludes supabase/functions)
npm run typecheck:functions    # deno check supabase/functions/*/index.ts (edge functions)
npm run build:android:check    # expo export --platform android — catches bundler-breaking errors before an EAS build
```

There is no lint script and no test runner configured — don't assume `npm test`/`npm run lint` exist.

Environment: copy `.env.example` to `.env` and set `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` (from the Supabase project's Settings → API) and `EXPO_PUBLIC_MAPTILER_KEY` (free tier at maptiler.com, no card required).

Store-screenshot automation lives in `.maestro/screenshots/` (Maestro CLI flows + a README covering the AR/EN locale-switch sequence) — a debug/dev-client build only, not a release build, since it depends on `DevSettings.reload()`.

Supabase edge functions (`supabase/functions/*`) are deployed separately via the Supabase CLI, not through the Expo build — they're plain Deno, typechecked with `deno check`.

## Architecture

**Entry point:** `index.js` → `App.js`. `App()` blocks on an async bootstrap (reads/sets the persisted language in `AsyncStorage`, then calls `I18nManager.forceRTL`) before rendering anything, because the app defaults to Arabic/RTL and the RTL flag must be applied before layout — get this ordering wrong and you get mismatched text-direction bugs on first launch. Render tree: `SafeAreaProvider > ErrorBoundary > AppProvider > AppShell`. `AppShell` (in `App.js`) is a pre-navigation gate: it shows `OnboardingScreen` on first run, `ResetPasswordScreen` if a password-recovery deep link (`aqari://reset-password#...`) was just handled, otherwise mounts `NavigationContainer` with `RootNavigator` + the always-mounted `AuthModal`.

**Single global context — `src/context/AppContext.js` (~980 lines).** This is the one thing to understand before touching almost any screen or component: `useAppContext()` is called from nearly every screen/component in the tree and is the de facto integration point for five concerns that live in one file/hook:
- auth session + profile (wraps `src/lib/supabase.js`, `src/utils/phoneAuth.js`, `src/utils/otp.js`)
- Supabase row ↔ app-shape mapping via `src/lib/mappers.js` (`listingFromRow`, `listingToRow`, `profileFromRow`, `agentFromRow`, `boostPaymentFromRow`, `listingReportFromRow`)
- `isAdmin` (server-side allowlist, re-checked via the `am_i_admin` RPC whenever the auth uid changes — never trust a locally-cached admin flag)
- language/theme/onboarding-seen persistence (`src/i18n/constants.js` storage keys)
- push notification registration (`src/utils/pushNotifications.js`)

New global state almost always belongs as an addition to this context rather than a new one — that's the existing convention, not a suggestion to split it.

**Auth is phone-number UX over Supabase's email/password auth.** Supabase's own phone/SMS provider was deliberately avoided (cost/complexity). Each phone number is mapped to a synthetic address via `phoneToInternalEmail()` (`src/utils/phoneAuth.js`) — Supabase treats it as an ordinary email/password account; the UI never shows this address. Password reset can't use Supabase's built-in email delivery (nothing can receive mail at the synthetic address), so it's a custom flow: `admin.generateLink` mints a recovery token server-side, the `send-password-reset` edge function emails it via Resend to the account's real `profiles.email`, and the reset link is a deep link the app parses itself (`AppContext.handleAuthDeepLink`) — PKCE flow, `detectSessionInUrl: false` since RN has no browser URL to read. Session storage (`src/lib/supabase.js`) is a custom `LargeSecureStore`: a random AES key lives in `expo-secure-store` (small, but real Keychain/Keystore), the actual session ciphertext lives in `AsyncStorage` (unbounded size, but not secure storage) — plaintext tokens never touch disk.

**Roles: no buyer/agent split.** Any signed-in account can browse, list, and save. The only role branch is `isAdmin`, decided server-side; `RootNavigator` renders `AdminTabs` or `MainTabs` on that one flag.

**Listings have two independent status dimensions** (`supabase/schema.sql`, `supabase/migration_listing_lifecycle.sql`): moderation `status` (`pending` / `approved` / `rejected`, admin-controlled) is separate from lifecycle (`listing_state`, `expires_at`, `renewed_at`, 30-day auto-expiry with free renewal via `renew_listing()`, plus `is_featured`/`featured_until` for boosted listings). Both sets of columns are revoked from direct owner `UPDATE` via RLS — an owner's plain `update()` can't touch them; changes go through `SECURITY DEFINER` functions like `admin_set_listing_status`, `renew_listing`, `resubmit_rejected_listing`. The same revoke-column/gate-via-RPC pattern is used repo-wide, not just for listings — e.g. `agents.verified` (the agent trust badge) is only settable through `admin_set_agent_verified` (`supabase/migration_agent_verified.sql`).

**Boost/featured payments** run through four Libyan payment gateways (Edfali, Sadad, Moamalat, MasrefyPay) via a third-party processor (Dpay), orchestrated by `src/components/BoostListingSection.js` and three edge functions: `create-boost-payment` (server looks up the LYD price — never trust a client-supplied price — and opens a `boost_payment_sessions` row), `verify-boost-payment` (submits the OTP the user got from their wallet app, server-to-server), and `dpay-webhook` (Dpay's signed `payment.*` callback — the *only* confirmation path for Moamalat, which has no OTP/verify step, and an idempotent backstop for the others if `verify-boost-payment`'s response never reached the app).

**Supabase edge functions** (`supabase/functions/*`, Deno) are the only place the service-role key is allowed to exist — used for account deletion (`delete-account`), the cron-driven listing lifecycle sweep (`lifecycle-cron`, auth'd by comparing the caller's bearer token to the service-role key itself since it's only ever invoked by `pg_cron`/`pg_net`), and the listing-approved/rejected push notification (`notify-listing-status`, triggered by a **dashboard-configured** Database Webhook — there's no way to create one from a SQL migration). Each function has substantial rationale comments explaining *why* — read them before changing auth/webhook logic there, the reasoning usually isn't obvious from the code alone.

**Database migrations** are flat, unnumbered `supabase/migration_*.sql` files plus a base `supabase/schema.sql` — there's no migration-runner/ordering convention beyond file naming and git history. Check `schema.sql` for current table shape rather than assuming a migration file is the latest word on a column.

**i18n**: `src/i18n/translations.js` is a flat `{ ar: {...}, en: {...} }` key→string dict (Arabic is the default/fallback in `useT()`, not English). `useT()` itself depends on `useAppContext()` for the current `language`, so anything needing translated strings transitively depends on `AppContext.js`.

**RTL layout is auto-mirrored by Yoga/Fabric even for values you'd expect to be physical.** Verified live on-device (RN 0.81, `newArchEnabled: true`) with `I18nManager.isRTL` confirmed `true`: `alignItems: 'flex-end'`/`'flex-start'` on a column's cross axis, and a `Text`'s own `textAlign: 'left'`/`'right'`, both get mirrored under RTL — setting `writingDirection`/`direction: 'rtl'` alongside them does **not** exempt them. So in RTL-specific style branches (see `OnboardingScreen.js`'s `copyBlockBandRTL`/`titleRTL`/`bodyRTL`), `'flex-start'`/`'left'` is what actually renders visually-right under `isRTL: true` — the intuitive-looking `'flex-end'`/`'right'` renders backwards. Don't "fix" these back to the intuitive values without re-verifying live on an RTL device/emulator.

**Store-guideline feature flags** (`src/config/features.js`): a compliance-driven kill switch, not a generality — e.g. `BOOST_PURCHASES_ENABLED` hides every visible trace of the Boost/Featured billing flow (purchase UI, featured badges, payment-history screens) without removing the underlying edge functions/tables, because Apple/Google IAP rules don't have a realistic path for the existing Libyan DPay gateways yet. Read the comment on a flag before assuming it's dead code to delete.

**Maps run on MapLibre (`@maplibre/maplibre-react-native`), not react-native-maps/Google Maps.** Switched over because Google's Maps Platform gates the Android SDK key behind a Cloud Billing account (which itself gated behind a mandatory prepayment on this project's account) and Mapbox gates signup behind a payment method — MapLibre + MapTiler's free tier needed neither. Style comes from `src/theme/mapStyle.js`'s `getMapStyleUrl(theme)` (MapTiler-hosted `streets-v2`/`streets-v2-dark`, keyed by `EXPO_PUBLIC_MAPTILER_KEY`). Clustering is hand-rolled with `supercluster` directly in `HomeMapScreen.js` (`clusterIndex`/`mapClusters`) — MapLibre has no `react-native-map-clustering`-style wrapper. MapLibre's `Marker` renders a real native View on both platforms (Android: native Views on the map projection; iOS: `MLNPointAnnotation`), unlike react-native-maps' Fabric-snapshot-to-bitmap approach — so the price-pill/cluster-bubble `Marker` children here are live Views on both platforms, no `react-native-view-shot` capture-to-PNG workaround needed (that workaround, and the Google-specific `darkMapStyle.js`/`mapPinDefault.png`/`mapPinSelected.png` it depended on, are gone — check git history if you need the react-native-maps-era version for reference).

**Block/report (App Store Guideline 1.2 UGC safety)**: buyers can block a seller by phone number (`blocked_sellers` table, `supabase/migration_blocked_sellers.sql` — keyed on `owner_id`/`blocked_phone`, not a FK to `agents`, since a phone stays blockable after its directory entry is gone) on top of the pre-existing listing-report flow. `src/utils/contactActions.js` centralizes the `tel:`/`wa.me` deep links so both the block check and the "no app installed" error feedback happen once for every call site (buyer and admin).
