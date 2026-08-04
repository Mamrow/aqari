import { createNativeStackNavigator } from '@react-navigation/native-stack';
import FavoritesScreen from '../screens/FavoritesScreen';
import ListingDetailScreen from '../screens/ListingDetailScreen';
import { useT } from '../i18n/useT';

const Stack = createNativeStackNavigator();

export default function FavoritesStack() {
  const t = useT();

  return (
    <Stack.Navigator>
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
    </Stack.Navigator>
  );
}
