import { createNativeStackNavigator } from '@react-navigation/native-stack';
import SettingsScreen from '../screens/SettingsScreen';
import PaymentHistoryScreen from '../screens/PaymentHistoryScreen';
import BlockedSellersScreen from '../screens/BlockedSellersScreen';
import PersonalInfoScreen from '../screens/PersonalInfoScreen';
import LegalInfoScreen from '../screens/LegalInfoScreen';
import { useT } from '../i18n/useT';

const Stack = createNativeStackNavigator();

export default function SettingsStack() {
  const t = useT();

  return (
    <Stack.Navigator
      screenOptions={{
        // The back button carries the word, not just the chevron: an arrow
        // alone is ambiguous in an RTL layout, where it points the way the
        // reading runs rather than the way iOS normally draws "back". iOS
        // would otherwise label it with the previous screen's title, or with
        // the system's own localised "Back" in the *device's* language,
        // which isn't necessarily the language the app is running in.
        //
        // iOS-only, by the platform's own convention: Android's back
        // affordance is an unlabelled arrow throughout the OS, and
        // react-native-screens renders no label there.
        headerBackTitle: t('back'),
        headerBackButtonDisplayMode: 'default',
      }}
    >
      {/* Every screen below SettingsHome uses the native stack header. It
          was three different back affordances before — a black "رجوع" row on
          Personal info, a plain native chevron on Blocked sellers, and a blue
          "رجوع" on the legal pages — because two screens drew their own and
          one didn't. The native header also puts the chevron on the correct
          side in Arabic without anyone thinking about it. */}
      <Stack.Screen
        name="SettingsHome"
        component={SettingsScreen}
        // SettingsScreen renders its own heading + top safe-area padding —
        // the stack's default native header would just duplicate that.
        // PaymentHistory below has neither, so it keeps the default header
        // (title + auto back button).
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="PersonalInfo"
        component={PersonalInfoScreen}
        options={{ title: t('personalInfoRow') }}
      />
      <Stack.Screen
        name="PaymentHistory"
        component={PaymentHistoryScreen}
        options={{ title: t('paymentHistoryTitle') }}
      />
      <Stack.Screen
        name="BlockedSellers"
        component={BlockedSellersScreen}
        options={{ title: t('blockedSellersTitle') }}
      />
      <Stack.Screen
        name="PrivacyPolicy"
        component={LegalInfoScreen}
        initialParams={{ type: 'privacy' }}
        options={{ title: t('privacyPolicyRow') }}
      />
      <Stack.Screen
        name="TermsOfService"
        component={LegalInfoScreen}
        initialParams={{ type: 'terms' }}
        options={{ title: t('termsOfServiceRow') }}
      />
      <Stack.Screen
        name="Support"
        component={LegalInfoScreen}
        initialParams={{ type: 'support' }}
        options={{ title: t('supportRow') }}
      />
    </Stack.Navigator>
  );
}
