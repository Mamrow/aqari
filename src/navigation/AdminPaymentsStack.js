import { createNativeStackNavigator } from '@react-navigation/native-stack';
import PaymentHistoryScreen from '../screens/PaymentHistoryScreen';
import { useT } from '../i18n/useT';

const Stack = createNativeStackNavigator();

// Admin's own tab (not nested under Settings, unlike the seller-facing
// entry point in SettingsStack.js) — every seller's Featured payment
// history is admin-level oversight, not a personal-account setting.
export default function AdminPaymentsStack() {
  const t = useT();

  return (
    <Stack.Navigator>
      <Stack.Screen
        name="AdminPaymentsHome"
        component={PaymentHistoryScreen}
        options={{ title: t('paymentHistoryTitle') }}
      />
    </Stack.Navigator>
  );
}
