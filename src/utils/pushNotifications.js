import Constants from 'expo-constants';
import { Platform } from 'react-native';

// Returns this device's Expo push token, or null if anything along the way
// didn't work out — running in Expo Go, permission denied, not a real
// device, or (the likely case right now) no EAS project id configured yet,
// since getExpoPushTokenAsync needs one and this project hasn't run
// `eas init`/`eas build:configure` yet. Never throws: push registration is
// a nice-to-have, it should never be able to break sign-in.
export async function registerForPushNotificationsAsync() {
  try {
    // Expo Go dropped Android remote-push support in SDK 53, and just
    // touching the module there logs a red-box console error on every
    // launch. Bail out before importing it at all rather than letting that
    // noise into the one environment this app is actually developed in.
    // `expo` here means "running inside Expo Go" — a real dev/production
    // build reports 'standalone' (or null on newer SDKs) and proceeds.
    if (Constants.appOwnership === 'expo') return null;

    // Required lazily, not at module scope: a top-level import would pull
    // expo-notifications in (and trip the error above) even for callers
    // that never get past the Expo Go check.
    const Notifications = require('expo-notifications');

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') return null;

    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    if (!projectId) {
      // Expected until this project's first `eas init`/`eas build:configure`
      // run writes a real project id into app config — not a real error.
      console.warn('registerForPushNotificationsAsync: no EAS projectId configured yet');
      return null;
    }

    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    return token;
  } catch (error) {
    console.warn('registerForPushNotificationsAsync error', error);
    return null;
  }
}
