import { Image, StyleSheet, View } from 'react-native';

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

export default function SplashView() {
  return (
    <View style={styles.container}>
      <Image source={SPLASH_IMAGE} style={styles.image} resizeMode="cover" />
    </View>
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
