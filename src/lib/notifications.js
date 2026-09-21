import Constants from 'expo-constants';

// The receiving half of push. src/utils/pushNotifications.js registers this
// device's token; nothing until now did anything with a notification once it
// arrived — which meant two silent gaps: a push that landed while the app was
// open was dropped without ever being drawn (Expo shows nothing in the
// foreground unless a handler says to), and every notify-* Edge Function
// sends `data.listingId` that no code read, so tapping "your listing was
// approved" just opened the map.
//
// Same lazy-require guard as pushNotifications.js: expo-notifications must
// not be imported at module scope, because merely touching it inside Expo Go
// on Android red-boxes on every launch (remote push support was dropped
// there in SDK 53). Every function here no-ops instead of throwing, so a
// failure in notification plumbing can never take a screen down with it.
function loadNotifications() {
  if (Constants.appOwnership === 'expo') return null;
  try {
    return require('expo-notifications');
  } catch (error) {
    console.warn('expo-notifications unavailable', error);
    return null;
  }
}

// Without this, a notification arriving while the app is in the foreground is
// delivered to JS but never presented — the user sees nothing at all.
export function configureForegroundNotifications() {
  const Notifications = loadNotifications();
  if (!Notifications) return;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      // No badge: nothing in the app clears one, and a count that only ever
      // grows is worse than no count.
      shouldSetBadge: false,
    }),
  });
}

function listingIdFrom(response) {
  const data = response?.notification?.request?.content?.data;
  const listingId = data?.listingId;
  return typeof listingId === 'string' && listingId ? listingId : null;
}

/**
 * Calls `onListing(listingId)` when a notification is tapped. Covers both
 * cases: the app was already running (the subscription), and the app was
 * launched by the tap itself (getLastNotificationResponseAsync — the
 * subscription never fires for that one, which is the usual reason a
 * cold-start tap appears to do nothing).
 *
 * Returns an unsubscribe function, or a no-op when notifications aren't
 * available in this build.
 */
export function addNotificationTapListener(onListing) {
  const Notifications = loadNotifications();
  if (!Notifications) return () => {};

  let cancelled = false;
  Notifications.getLastNotificationResponseAsync()
    .then((response) => {
      const listingId = listingIdFrom(response);
      if (!cancelled && listingId) onListing(listingId);
    })
    .catch((error) => console.warn('getLastNotificationResponseAsync failed', error));

  const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
    const listingId = listingIdFrom(response);
    if (listingId) onListing(listingId);
  });

  return () => {
    cancelled = true;
    subscription.remove();
  };
}
