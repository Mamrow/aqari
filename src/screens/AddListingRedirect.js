import { useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { useAppContext } from '../context/AppContext';

// The center "+" tab's actual screen is never meant to be seen — on focus
// (which happens the instant the tab is tapped, whether or not the user is
// signed in) it immediately hands off to MyListingsStack's own AddListing
// screen, a real stack screen with proper back-navigation history. Doing
// this via focus rather than intercepting tabPress is what actually fixes
// the "GO_BACK not handled" bug: navigating cross-tab via a tabPress
// listener left this tab's own bare screen as the focused route with no
// stack under it, so submitting a listing had nowhere to go back to.
export default function AddListingRedirect({ navigation }) {
  const { requireAuth } = useAppContext();

  useFocusEffect(
    useCallback(() => {
      requireAuth(() => {
        navigation.navigate('MyListings', { screen: 'AddListing' });
      });
    }, [navigation, requireAuth])
  );

  return null;
}
