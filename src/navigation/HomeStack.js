import { createNativeStackNavigator } from '@react-navigation/native-stack';
import HomeMapScreen from '../screens/HomeMapScreen';
import ListingDetailScreen from '../screens/ListingDetailScreen';
import { useT } from '../i18n/useT';

const Stack = createNativeStackNavigator();

export default function HomeStack() {
  const t = useT();

  return (
    <Stack.Navigator
      // Labelled back button — see SettingsStack.js for why.
      screenOptions={{ headerBackTitle: t('back'), headerBackButtonDisplayMode: 'default' }}
    >
      <Stack.Screen
        name="HomeMap"
        component={HomeMapScreen}
        options={{ headerShown: false, title: t('tabHome') }}
      />
      <Stack.Screen
        name="ListingDetail"
        component={ListingDetailScreen}
        options={{ title: t('listingDetailTitle') }}
      />
    </Stack.Navigator>
  );
}
