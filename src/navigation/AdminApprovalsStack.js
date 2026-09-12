import { createNativeStackNavigator } from '@react-navigation/native-stack';
import AdminApprovalsScreen from '../screens/AdminApprovalsScreen';
import AdminAgentsScreen from '../screens/AdminAgentsScreen';
import AdminSellerListingsScreen from '../screens/AdminSellerListingsScreen';
import AdminReportsScreen from '../screens/AdminReportsScreen';
import ListingDetailScreen from '../screens/ListingDetailScreen';
import { useT } from '../i18n/useT';

const Stack = createNativeStackNavigator();

export default function AdminApprovalsStack() {
  const t = useT();

  return (
    <Stack.Navigator
      // Labelled back button — see SettingsStack.js for why.
      screenOptions={{ headerBackTitle: t('back'), headerBackButtonDisplayMode: 'default' }}
    >
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
      <Stack.Screen
        name="AdminReports"
        component={AdminReportsScreen}
        options={{ title: t('reportsTitle') }}
      />
      <Stack.Screen
        name="ListingDetail"
        component={ListingDetailScreen}
        options={{ title: t('listingDetailTitle') }}
      />
    </Stack.Navigator>
  );
}
