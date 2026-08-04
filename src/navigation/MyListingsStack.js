import { createNativeStackNavigator } from '@react-navigation/native-stack';
import MyListingsScreen from '../screens/MyListingsScreen';
import AddListingScreen from '../screens/AddListingScreen';
import { useT } from '../i18n/useT';

const Stack = createNativeStackNavigator();

export default function MyListingsStack() {
  const t = useT();

  return (
    <Stack.Navigator>
      <Stack.Screen
        name="MyListingsHome"
        component={MyListingsScreen}
        options={{ title: t('tabMyListings') }}
      />
      <Stack.Screen
        name="AddListing"
        component={AddListingScreen}
        options={{ title: t('addListingTitle') }}
      />
    </Stack.Navigator>
  );
}
