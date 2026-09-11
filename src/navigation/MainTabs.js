import { Pressable, StyleSheet, View } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import HomeStack from './HomeStack';
import FavoritesStack from './FavoritesStack';
import MyListingsStack from './MyListingsStack';
import AddListingRedirect from '../screens/AddListingRedirect';
import SettingsStack from './SettingsStack';
import { tabIcon } from './tabIcon';
import { useT } from '../i18n/useT';
import { useThemeColors } from '../theme/useThemeColors';
import { useAppContext } from '../context/AppContext';
import GlassSurface, { isLiquidGlassAvailable } from '../components/GlassSurface';

const Tab = createBottomTabNavigator();

// Raised, accent-colored circle — the TikTok/Instagram-style "+" affordance.
// This tab never actually renders its own content — AddListingRedirect
// hands off to MyListingsStack's own AddListing screen the instant this tab
// gains focus (see that file for why this is a focus effect, not a
// tabPress-intercepting listener).
function AddListingTabButton({ children, onPress, onLongPress, accessibilityState, testID }) {
  const colors = useThemeColors();
  return (
    <View style={styles.addButtonWrapper}>
      <Pressable
        onPress={onPress}
        onLongPress={onLongPress}
        accessibilityState={accessibilityState}
        testID={testID}
        style={[styles.addButton, { backgroundColor: colors.accent }]}
      >
        {children}
      </Pressable>
    </View>
  );
}

export default function MainTabs() {
  const t = useT();
  const colors = useThemeColors();
  const { auth, requireAuth } = useAppContext();
  const glass = isLiquidGlassAvailable();

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarLabelPosition: 'below-icon',
        // Glass material on the bar, but the bar stays in the layout flow.
        //
        // position:'absolute' is what the floating iOS 26 look needs — content
        // scrolling under the bar — and it silently broke every screen that
        // doesn't reserve space for it: the bar stops taking up layout room,
        // so whatever is last on a screen ends up underneath it. ListingDetail
        // lost its Edit button that way, and auditing every scroll view in the
        // app for bottom padding is a much bigger change than it looks.
        //
        // So the bar keeps its slot and only its material changes. Less
        // dramatic than content sliding under frosted glass, and nothing can
        // hide behind it.
        ...(glass
          ? {
              tabBarStyle: {
                backgroundColor: 'transparent',
                borderTopWidth: 0,
                elevation: 0,
              },
              tabBarBackground: () => (
                <GlassSurface style={StyleSheet.absoluteFill} glassEffectStyle="regular" />
              ),
            }
          : null),
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeStack}
        options={{ title: t('tabHome'), tabBarIcon: tabIcon('home') }}
      />
      <Tab.Screen
        name="Favorites"
        component={FavoritesStack}
        options={{ title: t('tabFavorites'), tabBarIcon: tabIcon('heart') }}
        listeners={({ navigation }) => ({
          tabPress: (e) => {
            // A guest tapping this tab gets the sign-in popup instead of an
            // empty favorites screen — same requireAuth gate as the + tab.
            e.preventDefault();
            requireAuth(() => navigation.navigate('Favorites'));
          },
        })}
      />
      <Tab.Screen
        name="AddListingTab"
        component={AddListingRedirect}
        options={{
          tabBarLabel: () => null,
          tabBarIcon: () => <Ionicons name="add" size={28} color={colors.accentText} />,
          tabBarButton: (props) => <AddListingTabButton {...props} />,
        }}
        listeners={({ navigation }) => ({
          tabPress: (e) => {
            // A signed-in tap is untouched: let the default tab focus happen,
            // same as before — AddListingRedirect's own focus effect hands
            // off to AddListing immediately (a focus effect, not this
            // listener, specifically because a cross-tab navigate() from a
            // tabPress listener is what caused the earlier "GO_BACK not
            // handled" bug — see AddListingRedirect's comment).
            //
            // A guest tap is different: focusing this tab first (to show the
            // sign-in modal on top of it) left a blank white screen behind
            // the modal, because AddListingRedirect renders null. Preventing
            // the tab switch here and gating with requireAuth instead keeps
            // the guest on whatever screen they were already viewing, shows
            // the sign-in modal over *that*, and — same as Favorites/
            // MyListings' own gate below — lands them on AddListing the
            // moment sign-in finishes.
            if (auth.loggedIn) return;
            e.preventDefault();
            requireAuth(() => navigation.navigate('MyListings', { screen: 'AddListing' }));
          },
        })}
      />
      <Tab.Screen
        name="MyListings"
        component={MyListingsStack}
        options={{ title: t('tabMyListings'), tabBarIcon: tabIcon('business') }}
        listeners={({ navigation }) => ({
          tabPress: (e) => {
            // Same gate as Favorites — a guest gets the sign-in popup
            // instead of an empty "my listings" screen.
            e.preventDefault();
            requireAuth(() => navigation.navigate('MyListings'));
          },
        })}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsStack}
        options={{ title: t('tabSettings'), tabBarIcon: tabIcon('settings') }}
      />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  addButtonWrapper: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    marginTop: -18,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
});
