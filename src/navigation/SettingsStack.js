import { createNativeStackNavigator } from '@react-navigation/native-stack';
import SettingsScreen from '../screens/SettingsScreen';
import PaymentHistoryScreen from '../screens/PaymentHistoryScreen';
import { useT } from '../i18n/useT';

const Stack = createNativeStackNavigator();

export default function SettingsStack() {
  const t = useT();

  return (
    <Stack.Navigator>
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
        name="PaymentHistory"
        component={PaymentHistoryScreen}
        options={{ title: t('paymentHistoryTitle') }}
      />
    </Stack.Navigator>
  );
}
