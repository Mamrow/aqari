import { useCallback, useEffect, useRef, useState } from 'react';
import { I18nManager, Linking } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  NavigationContainer,
  DefaultTheme,
  DarkTheme,
  createNavigationContainerRef,
} from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'expo-status-bar';
import { initCrashReporting } from './src/lib/crashReporting';
import { AppProvider, useAppContext } from './src/context/AppContext';
import RootNavigator from './src/navigation/RootNavigator';
import AuthModal from './src/components/AuthModal';
import ErrorBoundary from './src/components/ErrorBoundary';
import OnboardingScreen from './src/components/OnboardingScreen';
import SplashView from './src/components/SplashView';
import { LANGUAGE_STORAGE_KEY } from './src/i18n/constants';
import { listingIdFromUrl } from './src/utils/listingLink';
import { lightColors, darkColors } from './src/theme/colors';
import {
  addNotificationTapListener,
  configureForegroundNotifications,
} from './src/lib/notifications';
import * as Sentry from '@sentry/react-native';

// Before any component mounts, so a crash during the very first render is
// still reported. No-op unless EXPO_PUBLIC_SENTRY_DSN was set at build time.
//
// This is the only Sentry.init in the app, and it belongs in
// src/lib/crashReporting.js rather than here. `npx @sentry/wizard` will add
// a second one at the top of this file if it's ever run again — delete it.
// Its defaults are wrong for this app: sendDefaultPii, session replay (which
// records the screen), and console logs, in a product whose screens are full
// of people's phone numbers.
initCrashReporting();

// Also before any component mounts: a notification can arrive (or have
// launched the app) before the first render, and without a handler set by
// then it is never presented. No-op in Expo Go — see src/lib/notifications.js.
configureForegroundNotifications();

// Notification taps arrive outside React's tree, so the navigator is reached
// through a ref rather than a screen's own navigation prop.
const navigationRef = createNavigationContainerRef();

// Remembers which language a direction-fixing reload was already tried for,
// so a reload that somehow doesn't apply the direction can't loop.
const RTL_RELOAD_KEY = 'rtl-reload-attempted';

// Same tiers as AppContext's setLanguage: expo-updates in release builds,
// required lazily because a client built without it throws on import;
// DevSettings in development. Resolves false if neither could reload.
async function reloadApp() {
  try {
    const Updates = require('expo-updates');
    await Updates.reloadAsync();
    return true;
  } catch (error) {
    console.warn('Updates.reloadAsync unavailable, falling back', error);
  }
  const { DevSettings } = require('react-native');
  if (DevSettings?.reload) {
    DevSettings.reload();
    return true;
  }
  return false;
}

function buildNavigationTheme(theme) {
  const base = theme === 'dark' ? DarkTheme : DefaultTheme;
  const colors = theme === 'dark' ? darkColors : lightColors;
  return {
    ...base,
    colors: {
      ...base.colors,
      primary: colors.accent,
      background: colors.background,
      card: colors.surface,
      text: colors.text,
      border: colors.border,
    },
  };
}

function AppShell() {
  const { theme, language, hydrated, showOnboarding, completeOnboarding, isAdmin } = useAppContext();

  // Read through a ref so the tap handler below stays referentially stable.
  // Re-subscribing would re-run the cold-start check in
  // addNotificationTapListener and open the same listing a second time the
  // moment the admin check comes back from the server.
  const isAdminRef = useRef(isAdmin);
  useEffect(() => {
    isAdminRef.current = isAdmin;
  }, [isAdmin]);

  // A tap that launched the app resolves before the navigator exists, so it's
  // parked here and replayed from onReady below.
  const pendingListingIdRef = useRef(null);

  const goToListing = useCallback((listingId) => {
    if (!navigationRef.isReady()) {
      pendingListingIdRef.current = listingId;
      return;
    }
    // ListingDetail exists in both tab trees, under a different parent in
    // each (see HomeStack / AdminApprovalsStack).
    navigationRef.navigate(isAdminRef.current ? 'Approvals' : 'Home', {
      screen: 'ListingDetail',
      params: { listingId },
    });
  }, []);

  useEffect(() => addNotificationTapListener(goToListing), [goToListing]);

  // A shared listing link (aqari://listing/<id>, handed off by the website's
  // /l/ page) opens that listing, through the same path a notification tap
  // takes. getInitialURL covers a link that launched the app; the listener
  // covers one tapped while it was already running.
  useEffect(() => {
    let cancelled = false;
    Linking.getInitialURL()
      .then((url) => {
        const listingId = listingIdFromUrl(url);
        if (!cancelled && listingId) goToListing(listingId);
      })
      .catch(() => {});
    const subscription = Linking.addEventListener('url', ({ url }) => {
      const listingId = listingIdFromUrl(url);
      if (listingId) goToListing(listingId);
    });
    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, [goToListing]);

  const handleNavigationReady = useCallback(() => {
    const listingId = pendingListingIdRef.current;
    pendingListingIdRef.current = null;
    if (listingId) goToListing(listingId);
  }, [goToListing]);

  // Onboarding lives inside AppProvider (it needs theme + translations) but
  // outside NavigationContainer — it's a pre-app gate, not a route, so it
  // shouldn't end up in anyone's back stack.
  //
  // Hydration waits on the stored session and, when there is one, a profile
  // read over the network — so on a slow connection this is seconds, not
  // milliseconds. Rendering nothing meant the native splash handed over to
  // an empty blue screen for that whole time. Keep the launch screen up
  // instead: same image, no seam.
  if (!hydrated) {
    return <SplashView />;
  }

  if (showOnboarding) {
    return (
      <>
        <OnboardingScreen onDone={completeOnboarding} />
        <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />
      </>
    );
  }

  return (
    <>
      {/* The native stack header takes its direction from here and nowhere
          else — react-navigation's useLocale() is what decides which side the
          back button sits on and which way its chevron points, and the native
          header ignores I18nManager for that. The container's own default
          reads I18nManager.getConstants().isRTL, which is a *launch-time*
          snapshot; the app's language is the thing that's actually true right
          now, so drive it from that. Arabic is the only RTL language here. */}
      <NavigationContainer
        ref={navigationRef}
        onReady={handleNavigationReady}
        theme={buildNavigationTheme(theme)}
        direction={language === 'ar' ? 'rtl' : 'ltr'}
      >
        <RootNavigator />
      </NavigationContainer>
      <AuthModal />
      <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />
    </>
  );
}

// Sentry.wrap gives the SDK the native app-start timing it can't get from
// JS alone. It doesn't report anything by itself — init decides that.
export default Sentry.wrap(function App() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      // Persist the default on first launch instead of only falling back to
      // it in memory. AppContext derives its own initial language from
      // I18nManager.isRTL and then only overrides it `if (storedLang)` — so
      // with nothing stored, the two disagreed on a fresh install: this line
      // forced RTL for the 'ar' default while AppContext still read 'en' off
      // the not-yet-applied isRTL flag, rendering English text in an RTL
      // layout (Skip on the wrong side, reversed onboarding dots).
      let lang = await AsyncStorage.getItem(LANGUAGE_STORAGE_KEY);
      if (!lang) {
        lang = 'ar';
        await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
      }
      // allowRTL as well as forceRTL, and the pair is load-bearing.
      //
      // forceRTL(false) only means "don't force it" — it leaves the app
      // inheriting UIKit's direction, which comes from the *device's*
      // language. On an Arabic iPhone that's RTL, so the English app was
      // laying its navigation bar out right-to-left: the back button sat on
      // the right, reading "Back >".
      //
      // The direction prop on NavigationContainer doesn't save us here.
      // react-native-screens only applies it when it *changes*, and its
      // declared default is already 'ltr' — so passing 'ltr' on first mount
      // is a no-op and the inherited direction stands. 'rtl' differs from
      // that default, which is why Arabic looked right and English didn't.
      //
      // allowRTL(false) is the one that says "this app is LTR, whatever the
      // phone is set to", and it applies natively at launch.
      I18nManager.allowRTL(lang === 'ar');
      I18nManager.forceRTL(lang === 'ar');

      // forceRTL only takes effect at the next launch: the native layout
      // direction is read once, at startup. So on a fresh install (the 'ar'
      // default just written above) or on a phone whose own language pulls
      // the other way, this whole session would render Arabic in an LTR
      // layout — tab bar, rows and headers backwards. setLanguage already
      // reloads to apply a change; do the same here, once. The flag stops a
      // loop if a reload ever fails to apply the direction.
      const wantRTL = lang === 'ar';
      if (I18nManager.isRTL !== wantRTL) {
        const attempted = await AsyncStorage.getItem(RTL_RELOAD_KEY);
        if (attempted !== lang) {
          await AsyncStorage.setItem(RTL_RELOAD_KEY, lang);
          if (await reloadApp()) return;
        }
      } else {
        await AsyncStorage.removeItem(RTL_RELOAD_KEY);
      }
      setReady(true);
    })();
  }, []);

  // Same reasoning as AppShell below — this gate is brief (one AsyncStorage
  // read) but it is the very first thing after the native splash, so
  // rendering nothing here is what starts the blue gap.
  if (!ready) {
    return <SplashView />;
  }

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <AppProvider>
          <AppShell />
        </AppProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
});
