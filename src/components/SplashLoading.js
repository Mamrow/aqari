import { ActivityIndicator, Image, StyleSheet, View } from 'react-native';

// Deliberately matches app.json's `splash` block — same image, same
// backgroundColor, same contain fit. This renders the instant the native
// splash is dismissed, so the handover is invisible: the logo doesn't move
// and the background doesn't change, only a spinner fades in underneath it.
//
// Hardcoded rather than themed. The native splash has one fixed colour and
// can't know the user's theme, so matching it is the whole point — reading
// colors.background here would make the seam visible in dark mode, which is
// the opposite of what this component is for.
const SPLASH_BACKGROUND = '#0066FF';

export default function SplashLoading() {
  return (
    <View style={styles.container}>
      <Image
        source={require('../../assets/aqari-splash.png')}
        style={styles.logo}
        resizeMode="contain"
      />
      <ActivityIndicator size="small" color="#FFFFFF" style={styles.spinner} />
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
  // 'contain' inside a box the size of the screen, which is what the native
  // splash does with resizeMode: 'contain'.
  logo: {
    width: '100%',
    height: '100%',
    position: 'absolute',
  },
  // Low enough to sit clear of a centred logo without being pinned to the
  // very bottom edge, where it reads as part of the system UI.
  spinner: {
    position: 'absolute',
    bottom: '18%',
  },
});
