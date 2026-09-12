import { useEffect, useState } from 'react';
import { I18nManager } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'expo-status-bar';
import { initCrashReporting } from './src/lib/crashReporting';
import { AppProvider, useAppContext } from './src/context/AppContext';
import RootNavigator from './src/navigation/RootNavigator';
import AuthModal from './src/components/AuthModal';
import ErrorBoundary from './src/components/ErrorBoundary';
import OnboardingScreen from './src/components/OnboardingScreen';
import { LANGUAGE_STORAGE_KEY } from './src/i18n/constants';
import { lightColors, darkColors } from './src/theme/colors';

// Before any component mounts, so a crash during the very first render is
// still reported. No-op unless EXPO_PUBLIC_SENTRY_DSN was set at build time.
initCrashReporting();

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
  const { theme, hydrated, showOnboarding, completeOnboarding } = useAppContext();

  // Onboarding lives inside AppProvider (it needs theme + translations) but
  // outside NavigationContainer — it's a pre-app gate, not a route, so it
  // shouldn't end up in anyone's back stack.
  if (!hydrated) {
    return null;
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
      <NavigationContainer theme={buildNavigationTheme(theme)}>
        <RootNavigator />
      </NavigationContainer>
      <AuthModal />
      <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />
    </>
  );
}

export default function App() {
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
      I18nManager.forceRTL(lang === 'ar');
      setReady(true);
    })();
  }, []);

  if (!ready) {
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
}
   