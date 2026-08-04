import { createNativeStackNavigator } from '@react-navigation/native-stack';
import AdminApprovalsScreen from '../screens/AdminApprovalsScreen';
import AdminAgentsScreen from '../screens/AdminAgentsScreen';
import AdminSellerListingsScreen from '../screens/AdminSellerListingsScreen';
import { useT } from '../i18n/useT';

const Stack = createNativeStackNavigator();

export default function AdminApprovalsStack() {
  const t = useT();

  return (
    <Stack.Navigator>
      <Stack.Screen
        name="AdminApprovals"
        component={AdminApprovalsScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="AdminAgents"
        component={AdminAgentsScreen}
        options={{ title: t('registeredAgentsTitle') }}
      />
      <Stack.Screen name="AdminSellerListings" component={AdminSellerListingsScreen} />
    </Stack.Navigator>
  );
}
