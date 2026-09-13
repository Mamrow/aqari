import { useEffect, useState } from 'react';
import { I18nManager } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { initCrashReporting } from './src/lib/crashReporting';
import { AppProvider, useAppContext } from './src/context/AppContext';
import RootNavigator from './src/navigation/RootNavigator';
import AuthModal from './src/components/AuthModal';
import ErrorBoundary from './src/components/ErrorBoundary';
import OnboardingScreen from './src/components/OnboardingScreen';
import SplashLoading from './src/components/SplashLoading';
import { LANGUAGE_STORAGE_KEY } from './src/i18n/constants';
import { lightColors, darkColors } from './src/theme/colors';
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

// Hold the native splash until there's something real to show.
//
// By default it dismisses the moment React renders its first frame — and the
// first frame here is `null`, because the language has to be read off disk
// and applied before anything can lay out. That's what produced the flash:
// splash for a fraction of a second, then a blank screen, then a spinner
// appearing on its own once the listings request was still in flight. Three
// different things in the first second and a half of an app launch.
//
// Failing is fine and deliberately swallowed: if the splash has already gone
// (a hot reload, a module reloaded out of order), the app should carry on
// rather than refuse to start over a cosmetic call.
SplashScreen.preventAutoHideAsync().catch(() => {});

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
  const { theme, language, hydrated, dataLoading, listings, showOnboarding, completeOnboarding } =
    useAppContext();

  // One continuous screen from launch to first paint, rather than a flash of
  // splash and a spinner arriving separately. SplashLoading is pixel-matched
  // to the native splash, so dismissing the native one under it isn't
  // visible — the logo stays put and a spinner fades in beneath it.
  //
  // `listings.length === 0` narrows this to the very first load. A later
  // refetch (pull to refresh, a language change) has listings on screen
  // already and must not throw the user back to a splash; HomeMapScreen's
  // own LoadingView still covers those.
  const booting = !hydrated || (dataLoading && listings.length === 0);

  // Onboarding lives inside AppProvider (it needs theme + translations) but
  // outside NavigationContainer — it's a pre-app gate, not a route, so it
  // shouldn't end up in anyone's back stack.
  if (booting) {
    return <SplashLoading />;
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

  // Once the language is applied, AppShell renders SplashLoading — which
  // looks identical to the native splash — so the handover has something to
  // land on. Hiding any earlier shows the blank frame this exists to avoid.
  useEffect(() => {
    if (!ready) return;
    SplashScreen.hideAsync().catch(() => {});
  }, [ready]);

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
      setReady(true);
    })();
  }, []);

  if (!ready) {
    // Nothing: the native splash is still up and covering this frame.
    return null;
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
