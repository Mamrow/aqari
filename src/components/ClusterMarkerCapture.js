import { StyleSheet, Text, View } from 'react-native';
import ViewShot from 'react-native-view-shot';

// Same technique as PriceMarkerCapture.js — renders a cluster's count badge
// off-screen and captures it to a real PNG via react-native-view-shot, so it
// can be used as a Marker `image` on Android without hitting the Fabric
// custom-View-marker bug (see HomeMapScreen.js's renderAndroidCluster).
// Cached by count, not by cluster id — every cluster showing "5" looks
// identical, so there's no need to re-capture per specific group of listings.
export default function ClusterMarkerCapture({ count, colors, onCaptured }) {
  return (
    <ViewShot
      options={{ format: 'png', quality: 1 }}
      captureMode="mount"
      onCapture={onCaptured}
      style={styles.hidden}
    >
      <View style={[styles.badge, { backgroundColor: colors.accent }]}>
        <Text style={styles.text}>{count}</Text>
      </View>
    </ViewShot>
  );
}

const styles = StyleSheet.create({
  hidden: {
    position: 'absolute',
    top: 0,
    start: 0,
    opacity: 0,
  },
  badge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  text: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 14,
  },
});
