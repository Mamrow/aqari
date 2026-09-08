# First iOS build

The app has only ever been built for Android. This is the runbook for the
first iOS build, and the notes are the ones that aren't obvious from the Expo
docs — everything here was checked against this project, not assumed.

## What's already true

- **No `ios/` directory, and there shouldn't be one.** Both `ios/` and
  `android/` are gitignored; this is a Continuous Native Generation project, so
  EAS runs `expo prebuild` in the cloud from `app.json` on every build. Don't
  run `expo prebuild` locally to "prepare" — a committed `ios/` directory would
  override the config plugins and start drifting from `app.json`. (Running it
  locally on Windows can't finish anyway: CocoaPods doesn't run there.)
- **iOS gets Apple Maps, and no Google Maps SDK comes with it.**
  `react-native-maps` ships two podspecs — `react-native-maps.podspec` (Apple
  Maps) and `react-native-google-maps.podspec` (Google) — and autolinking only
  picks the one matching the package name. The Google one is opt-in through a
  Podfile edit this project doesn't make, so there's no Google Maps pod, no API
  key, and no billing account in the iOS build. `ListingsMap.ios.js` passes no
  `provider` prop, which is the other half of the same guarantee.
- **The iOS bundle is verified.** `expo export --platform ios` succeeds, and
  the resulting bundle contains `AIRMap` (react-native-maps) with no MapLibre
  or MapTiler strings in it — the Android bundle is exactly the reverse. So
  Metro's platform-extension resolution is doing what the `.ios.js` / `.android.js`
  split intends. Native compilation is still unproven until a build runs.
- **`expo-doctor` passes all 18 checks**, and the icon is 1024×1024 with no
  alpha channel, which is what App Store Connect requires.
- **iPad is off** (`ios.supportsTablet: false`). The layouts have never been
  seen on an iPad, and leaving it on would both invite a review rejection for a
  broken tablet layout and require a separate set of iPad screenshots at
  submission. Turn it back on only after actually testing on an iPad.

## Running the build

The build itself is one command, but it can't be run unattended the first
time: EAS has to sign in to Apple, and that means an Apple ID, a password and
a 2FA code typed in live.

```bash
eas build --platform ios --profile production
```

On this first run EAS will ask to create, and then store for you:

- an **App Store distribution certificate**
- a **provisioning profile** for `com.mamrow.aqari`
- an **APNs key** for push notifications (the app uses `expo-notifications`)

Say yes to all three — EAS manages them from then on, and later builds are
non-interactive. It will also offer to register the bundle identifier in the
Apple Developer portal if it isn't there yet.

`production` (not `preview`) is the right profile for a first build. iOS
internal distribution is ad-hoc: it only installs on devices whose UDIDs were
registered *before* the build, which is a detour. A production build uploads
to TestFlight, and TestFlight is how you get it onto a real iPhone.

## Then

```bash
eas submit --platform ios --latest
```

EAS will offer to create the App Store Connect app record if it doesn't exist.
`ITSAppUsesNonExemptEncryption: false` is already in `app.json`, so no export
compliance question on each upload.

Note that `eas.json` sets `"appVersionSource": "remote"` with
`"autoIncrement": true` on the production profile, so the build number is
managed by EAS and doesn't need bumping by hand — `version` in `app.json`
(the marketing version) still does.

## Known unknowns

Nothing here proves the *native* iOS build compiles. The things most likely to
surface on that first run:

- `@maplibre/maplibre-react-native` installs its pods on iOS even though no iOS
  JS imports it (the native module is linked regardless of which platform's JS
  uses it). Harmless, but it's iOS native code this project has never compiled.
- New Architecture (`newArchEnabled: true`) is proven on Android only.
- Permission strings are Arabic-only (`expo-location`, `expo-image-picker`).
  That's allowed — Apple doesn't require English — but an English-speaking
  reviewer sees the Arabic string. Worth adding localized strings if a
  rejection ever cites the purpose strings.
