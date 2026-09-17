import { createNativeStackNavigator } from '@react-navigation/native-stack';
import FavoritesScreen from '../screens/FavoritesScreen';
import ListingDetailScreen from '../screens/ListingDetailScreen';
import SellerProfileScreen from '../screens/SellerProfileScreen';
import { useT } from '../i18n/useT';

const Stack = createNativeStackNavigator();

export default function FavoritesStack() {
  const t = useT();

  return (
    <Stack.Navigator
      // Plain system back button — see SettingsStack.js for why.
      screenOptions={{ headerBackButtonDisplayMode: 'minimal' }}
    >
      <Stack.Screen
        name="FavoritesList"
        component={FavoritesScreen}
        options={{ title: t('tabFavorites') }}
      />
      <Stack.Screen
        name="ListingDetail"
        component={ListingDetailScreen}
        options={{ title: t('listingDetailTitle') }}
      />
      <Stack.Screen
        name="SellerProfile"
        component={SellerProfileScreen}
        options={{ title: t('sellerProfileTitle') }}
      />
    </Stack.Navigator>
  );
}
