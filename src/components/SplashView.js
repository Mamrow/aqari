import { Image, Platform, StyleSheet, View } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';

// The launch screen, continued in JavaScript.
//
// App.js and AppShell render nothing useful until the language has been read
// and the session restored, which on a slow connection is seconds. This view
// fills that time by looking exactly like the native launch screen, so the
// handoff from native splash to React can't be seen: one splash, held until
// there's something to replace it with.
//
// "Exactly like" differs per platform, because the native splashes differ:
//
// - iOS shows the full splash image (the legacy `expo.splash` config, which
//   app.json's expo-splash-screen block deliberately leaves to iOS), so this
//   view shows the same image, same resizeMode, same background.
//
// - Android 12+ can't show a full-screen image at all: the system splash is
//   a background colour plus an icon, clipped to a 192dp circle inside a
//   288dp slot. The full image squeezed into that slot looked like a rough
//   square, then jumped to the real splash. So Android gets a clean cut-out
//   of the logo (assets/splash-logo.png) on flat #0066FF, `imageWidth` 136dp
//   in app.json, and this view draws the same logo at the same 136dp in the
//   middle of the screen. Those three values have to move together.
//
// App.js calls preventAutoHideAsync() at load, so the native splash stays up
// until this view has laid out; it hides it then. Without expo-splash-screen
// nothing held the native splash, and Android showed the bare window (dark
// grey in dark mode) between the two.
const SPLASH_BACKGROUND = '#0066FF';
const SPLASH_IMAGE = require('../../assets/aqari-splash.png');
const SPLASH_LOGO = require('../../assets/splash-logo.png');
const ANDROID_LOGO_DP = 136;

export default function SplashView() {
  const handleLayout = () => {
    SplashScreen.hideAsync().catch(() => {});
  };

  return (
    <View style={styles.container} onLayout={handleLayout}>
      {Platform.OS === 'android' ? (
        <Image source={SPLASH_LOGO} style={styles.logo} resizeMode="contain" />
      ) : (
        <Image source={SPLASH_IMAGE} style={styles.image} resizeMode="cover" />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: SPLASH_BACKGROUND,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Fills the screen the way `resizeMode: 'cover'` does natively, rather
  // than sitting in the middle of it.
  image: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  logo: {
    width: ANDROID_LOGO_DP,
    height: ANDROID_LOGO_DP,
  },
});
