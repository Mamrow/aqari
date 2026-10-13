import { useRef } from 'react';
import { Animated, Platform, StyleSheet } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';

// The launch screen, continued in JavaScript.
//
// iOS and Android show the native splash (app.json's `expo.splash`) only
// until React mounts its first view. After that the app owns the screen —
// and App.js/AppShell deliberately render nothing until the language has
// been read and the session restored, so what the person actually saw was
// the logo for an instant and then a bare blue rectangle for as long as
// startup took. A tester read that as the app hanging, which is a fair
// reading: nothing on screen said otherwise.
//
// So the loading state looks exactly like the launch screen instead. Same
// image, same resizeMode, same background colour, which makes the handoff
// from native splash to React invisible — the logo simply stays put until
// there's something to replace it with.
//
// These three values are a deliberate copy of `expo.splash` in app.json and
// have to move with it. There's no way to read that config from JS without
// adding expo-constants plumbing for three constants, and a mismatch shows
// up immediately as a visible jump on every launch.
const SPLASH_BACKGROUND = '#0066FF';
const SPLASH_IMAGE = require('../../assets/aqari-splash.png');

// The native splash can't match that, though. Since Android 12 the system
// splash is a small centred icon on the background colour, never a
// full-screen picture, and before expo-splash-screen was installed nothing
// held it up: Android dropped it as soon as the window existed, before the
// JS bundle had loaded, and showed the bare window — dark grey in dark mode —
// until this view arrived. App.js now calls preventAutoHideAsync() at load,
// so the native splash stays until this view has laid out; then it goes and
// the full image fades in over the same blue, instead of jumping in.
//
// The Android system splash is deliberately blank — plain #0066FF with an
// empty icon (app.json's expo-splash-screen `android` block,
// assets/splash-android-blank.png). Squeezed into the icon slot, the full
// splash image showed as a rough square with the logo in it, then jumped to
// the real thing. Blank blue, then this image fading in, reads as one splash.
// iOS keeps the legacy `expo.splash` config, which shows the full image.
//
// iOS is different: its native launch screen already shows the full image,
// so there the picture starts visible and the handoff stays invisible.
//
// App.js and AppShell each render their own SplashView, one after the other.
// Only the first fades; the second starts fully visible, or the picture would
// blink out and fade back in when the first gate opens.
let revealed = Platform.OS !== 'android';
const FADE_MS = 300;

export default function SplashView() {
  const opacity = useRef(new Animated.Value(revealed ? 1 : 0)).current;

  const handleLayout = () => {
    SplashScreen.hideAsync().catch(() => {});
    if (revealed) return;
    revealed = true;
    Animated.timing(opacity, { toValue: 1, duration: FADE_MS, useNativeDriver: true }).start();
  };

  return (
    <Animated.View style={styles.container} onLayout={handleLayout}>
      <Animated.Image source={SPLASH_IMAGE} style={[styles.image, { opacity }]} resizeMode="cover" />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: SPLASH_BACKGROUND,
  },
  // Fills the screen the way `resizeMode: 'cover'` does natively, rather
  // than sitting in the middle of it.
  image: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
});
