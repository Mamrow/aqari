# Store screenshot flows (Maestro)

Automated capture flows for Aqari's App Store / Play Store screenshots. Each
flow drives the real, running app on a real emulator/device and calls
`takeScreenshot`, which satisfies both stores' "must be an actual capture of
the app" requirement — unlike a designed mockup.

## Prerequisites

- **Maestro CLI** installed (`curl -fsSL "https://get.maestro.mobile.dev" | bash`,
  needs Java + `unzip`). On Windows, run that from **Git Bash** — the install
  script and the CLI both work there against the Windows `adb`; WSL is not
  needed.
- An **Android emulator running** (`emulator -avd Medium_Phone`, or any AVD)
  with the Aqari dev-client build installed, or a physical device with USB
  debugging on and `adb devices` showing it.
- The build must point at a Supabase project with **at least one approved
  listing** with photos — [`supabase/seed_demo_listings.sql`](../../supabase/seed_demo_listings.sql)
  seeds ~39, weighted heavily toward Tripoli so the map has real clustering
  density in frame — `03_listing_detail.yaml` and the list/map views
  read much better in store screenshots with real content than an empty state.
- Language switching (`00_set_language_*.yaml`) calls `setLanguage`, which
  triggers `DevSettings.reload()` in [AppContext.js](../../src/context/AppContext.js#L293-L298)
  — **this only works on a debug/dev-client build**, not a release/production
  build, since `DevSettings.reload()` is a no-op there. Use `expo run:android`
  or the dev-client APK, not an EAS production build, to run these flows.

## Running the full set

Screenshots land in the working directory Maestro is run from, named
`<locale>_<flow>.png`. Run once per locale:

```bash
# Arabic is the app's default on a fresh install — no language switch needed
# unless the device is already on English from a previous run.
maestro test .maestro/screenshots/01_home_map.yaml -e LOCALE=ar
maestro test .maestro/screenshots/02_home_list.yaml -e LOCALE=ar
maestro test .maestro/screenshots/03_listing_detail.yaml -e LOCALE=ar
maestro test .maestro/screenshots/04_filter_rent.yaml -e LOCALE=ar

# Switch to English, then repeat.
maestro test .maestro/screenshots/00_set_language_en.yaml
maestro test .maestro/screenshots/01_home_map.yaml -e LOCALE=en
maestro test .maestro/screenshots/02_home_list.yaml -e LOCALE=en
maestro test .maestro/screenshots/03_listing_detail.yaml -e LOCALE=en
maestro test .maestro/screenshots/04_filter_rent.yaml -e LOCALE=en

# Switch back to Arabic for next time, if desired.
maestro test .maestro/screenshots/00_set_language_ar.yaml
```

Or run every flow in the directory at once (Maestro executes `.yaml` files in
alphabetical order, so `00_set_language_*` must be invoked as its own
explicit run, not swept in with the rest, since only one locale's worth of
`01-04` should run per language pass):

```bash
maestro test .maestro/screenshots/01_home_map.yaml .maestro/screenshots/02_home_list.yaml .maestro/screenshots/03_listing_detail.yaml .maestro/screenshots/04_filter_rent.yaml -e LOCALE=ar
```

## Why the flows restart the app

Every flow starts with `subflows/open_home_map.yaml`, which launches with
`clearState: false, stopApp: true`, and each flow selects its view mode by an
id that names the mode it switches *to* (`map-list-toggle-to-list` /
`map-list-toggle-to-map`).

Both of those exist because the flows originally shared one process
(`stopApp: false`) and blind-tapped a single `map-list-toggle` id. That made
every flow's result depend on the previous flow: `04_filter_rent` captured the
list view because `03` had left it in list mode, `02` timed out looking for a
toggle on a screen that doesn't render one, and the map's camera carried
drift from run to run so the framing changed between captures.

Restarting the process resets the React tree — view mode back to `map`, camera
back to its initial region — while `clearState: false` keeps AsyncStorage, so
the persisted language, onboarding-seen flag and auth session all survive.
If you add a flow, start it with the same subflow rather than repeating the
preamble.

## What's covered / not covered

Covered: home map (default + Rent filter), home list, listing detail — the
core public browsing flow, reachable without signing in.

**Not covered**: anything behind `requireAuth` (Favorites, Add Listing,
Settings' signed-in state) — screenshotting those needs a pre-authenticated
test account wired into the flow (a `signIn`-equivalent Maestro step), which
wasn't set up here since login flows were out of scope for this pass. Add a
flow with `inputText`/`tapOn` steps against `AuthModal`'s fields if you want
those screens covered too.

**iOS**: these flows work as-is against an iOS Simulator, but iOS Simulator
only runs on macOS. From Windows, run these either on a Mac, or via
[Maestro Cloud](https://cloud.mobile.dev) / a device farm (BrowserStack App
Automate, etc.) that hosts an iOS simulator for you.
