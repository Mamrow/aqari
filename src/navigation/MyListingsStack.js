import { createNativeStackNavigator } from '@react-navigation/native-stack';
import MyListingsScreen from '../screens/MyListingsScreen';
import AddListingScreen from '../screens/AddListingScreen';
import ListingDetailScreen from '../screens/ListingDetailScreen';
import { useT } from '../i18n/useT';

const Stack = createNativeStackNavigator();

export default function MyListingsStack() {
  const t = useT();

  return (
    <Stack.Navigator
      // Labelled back button — see SettingsStack.js for why.
      screenOptions={{ headerBackTitle: t('back'), headerBackButtonDisplayMode: 'default' }}
    >
      <Stack.Screen
        name="MyListingsHome"
        component={MyListingsScreen}
        options={{ title: t('tabMyListings') }}
      />
      {/* Same detail screen the buyer-facing Home/Favorites stacks use —
          tapping a listing here now opens its details first, with an Edit
          button on screen, rather than jumping straight into the edit form. */}
      <Stack.Screen
        name="ListingDetail"
        component={ListingDetailScreen}
        options={{ title: t('listingDetailTitle') }}
      />
      <Stack.Screen
        name="AddListing"
        component={AddListingScreen}
        options={{ title: t('addListingTitle') }}
      />
    </Stack.Navigator>
  );
}
