# First Google Play release

Android builds have been running since the start; what has never happened is
a **Play Console release**. This is the runbook for that, and — like
`ios-first-build.md` — it only contains things checked against this project,
not repeated from Expo's docs.

## What's already true

- **`eas.json`'s `production` profile builds an `.aab`**, which is the format
  Play requires. No `android.buildType` is set there on purpose: the
  `development` and `preview` profiles override it to `apk` for sideloading,
  and production inherits EAS's app-bundle default.
- **Version codes are managed remotely.** `cli.appVersionSource` is `remote`
  and the production profile sets `autoIncrement: true`, so EAS bumps the
  Android `versionCode` itself on every production build. Don't hand-set one
  in `app.json` — it would start fighting the remote counter. The *user-facing*
  version (`expo.version`, currently 1.0.0) is still manual, and bumping it is
  what severs old builds from new EAS updates (see CLAUDE.md on
  `runtimeVersion`).
- **`edgeToEdgeEnabled: true`** is already set, which Android 15 (API 35)
  enforces for apps targeting it.
- **Permissions are narrower than the local `android/` folder suggests.** That
  directory is a gitignored prebuild artifact and is stale; EAS regenerates it
  from `app.json` on every cloud build. The real build asks for location
  (`ACCESS_FINE_LOCATION` / `ACCESS_COARSE_LOCATION`), photo access via
  expo-image-picker, and `POST_NOTIFICATIONS` — the last one merged in from
  expo-notifications' own library manifest rather than listed in `app.json`,
  which is why it isn't in the `android.permissions` array. Camera and
  microphone are explicitly disabled in the expo-image-picker plugin config,
  so they are not requested.
- **There is no Android build workflow.** `.github/workflows/` covers iOS
  TestFlight builds and EAS updates only. Android production builds are run by
  hand: `eas build --platform android --profile production`.

## The one-time Play Console setup

**1. Create the app in Play Console** (if it isn't there yet) with package
name `com.mamrow.aqari` — it must match `android.package` in `app.json`
exactly and can never be changed afterwards.

**2. Upload the first build by hand.** The Play Developer API refuses to
accept a bundle for an app that has never had one, so `eas submit` cannot do
the very first upload however well it is configured. Build, download the
`.aab`, and upload it in the console once. Every submission after that can be
`eas submit`.

**3. Create a service account** so `eas submit` can authenticate later:

- Play Console → Setup → API access → create a new Google Cloud project (or
  link one), then create a service account.
- Grant it the *Release manager* role, scoped to this app.
- In Google Cloud → IAM & Admin → Service Accounts, create a **JSON key** and
  download it.
- Save it in the repo root as `play-service-account.json`. It is gitignored,
  which is deliberate: it is a real credential that can publish to your store
  listing. It exists only on your machine — if EAS ever needs it in CI, it
  goes in as an EAS secret, never a commit.

`eas.json` already points at that path and targets the `internal` track, so
once the file exists:

```bash
eas build --platform android --profile production
eas submit --platform android --profile production
```

Promote from internal testing to production in the console when you're ready —
`eas submit` deliberately doesn't push straight to production.

## Forms that block the release

These are Play Console questionnaires with no equivalent in this repo, and a
release cannot go out until each is complete:

- **Data safety.** Must match what the app actually collects: name, phone
  number, an optional contact email (see `migration_profile_email_optional.sql`
  — this one is easy to get wrong, because the app was originally labelled as
  collecting no email at all), photos and video the user uploads, saved
  listings, approximate location, and a notification token. Apple's App
  Privacy answers need the same correction.
- **Content rating** questionnaire.
- **Target audience** — this is a marketplace for adults; answering that
  children are in the audience pulls in Families policy requirements that
  don't apply.
- **Store listing**: title, short and full description, feature graphic, and
  phone screenshots. `.maestro/screenshots/` automates the screenshot run, and
  its README covers the Arabic/English sequence — note those flows need a
  **debug/dev-client** build, not a release one, because they call
  `DevSettings.reload()`.
- **App access.** The app requires a phone number and a one-time code to sign
  in, which a reviewer cannot get through. Provide test credentials, or a note
  explaining that browsing listings needs no account and only contacting a
  seller does.

## Worth knowing

- **Play's target API floor moves every August.** SDK 54 targets a version
  that is current as of this release, but an app that sits unreleased for a
  year will be rejected on that alone.
- **App signing**: let Play manage the signing key (the default). EAS holds
  the upload key; losing it is recoverable, losing an unmanaged app signing
  key is not.
