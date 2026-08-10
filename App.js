import { useEffect, useState } from 'react';
import { I18nManager, Linking } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'expo-status-bar';
import { AppProvider, useAppContext } from './src/context/AppContext';
import RootNavigator from './src/navigation/RootNavigator';
import AuthModal from './src/components/AuthModal';
import ErrorBoundary from './src/components/ErrorBoundary';
import ResetPasswordScreen from './src/screens/ResetPasswordScreen';
import { LANGUAGE_STORAGE_KEY } from './src/i18n/constants';
import { lightColors, darkColors } from './src/theme/colors';

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
  const { theme, isPasswordRecovery, handleAuthDeepLink } = useAppContext();

  // Catches the "reset password" email link (aqari://reset-password#...) both
  // while the app is already running and when it's launched fresh by tapping
  // the link — see AppContext.handleAuthDeepLink for the actual token parsing.
  useEffect(() => {
    const subscription = Linking.addEventListener('url', ({ url }) => handleAuthDeepLink(url));
    Linking.getInitialURL().then((url) => {
      if (url) handleAuthDeepLink(url);
    });
    return () => subscription.remove();
  }, [handleAuthDeepLink]);

  return (
    <>
      <NavigationContainer theme={buildNavigationTheme(theme)}>
        {isPasswordRecovery ? <ResetPasswordScreen /> : <RootNavigator />}
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
      const lang = (await AsyncStorage.getItem(LANGUAGE_STORAGE_KEY)) ?? 'ar';
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
   