import * as Sentry from '@sentry/react-native';

// Set as an EAS environment variable (eas env:create) so builds pick it up.
// Absent — as it is on a local dev machine that hasn't opted in — every
// function here becomes a no-op and nothing is sent anywhere.
const DSN = process.env.EXPO_PUBLIC_SENTRY_DSN;

export const crashReportingEnabled = Boolean(DSN);

/**
 * Starts crash reporting, if a DSN was configured at build time.
 *
 * The reason this exists at all: a release build gives you nothing when it
 * dies. The price-slider crash took reading a .ips file out of iPhone
 * Settings, and even then React Native had destroyed the original error on
 * the way down — that only worked because there was one user and he was
 * motivated. It doesn't scale to a dozen testers, let alone real users.
 *
 * Guarded on the DSN rather than on __DEV__ so a dev build can opt in when
 * you're chasing something, and so a release build without a DSN configured
 * fails quietly rather than at startup.
 */
export function initCrashReporting() {
  if (!DSN) return;

  Sentry.init({
    dsn: DSN,
    // Crashes and handled errors only. Tracing samples ordinary navigation
    // and network activity, which is a different product decision with its
    // own privacy story — one this app's policy doesn't currently describe.
    tracesSampleRate: 0,
    // No screenshots, no view hierarchy, no request bodies. This app's
    // screens contain phone numbers and people's contact details, and a
    // crash report is not a place for them to end up.
    attachScreenshot: false,
    attachViewHierarchy: false,
    sendDefaultPii: false,
    beforeSend(event) {
      // Belt and braces: the SDK doesn't collect these by default, but a
      // future upgrade changing that default shouldn't quietly start
      // shipping user data.
      delete event.user;
      delete event.request;
      return event;
    },
  });
}

/**
 * Reports an error we caught ourselves — the render-crash boundary, mainly.
 * Safe to call whether or not reporting is on.
 */
export function reportError(error, context) {
  if (!DSN) return;
  Sentry.captureException(error, context ? { extra: context } : undefined);
}
