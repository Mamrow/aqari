import { StyleSheet, Text, View } from 'react-native';
import ViewShot from 'react-native-view-shot';

// Renders the price pill off-screen and captures it to a real PNG file via
// react-native-view-shot — a genuine static image, not a live View, which is
// what lets it work as a Marker `image` on Android without hitting the
// Fabric custom-View-marker bug (see HomeMapScreen.js).
export default function PriceMarkerCapture({ priceText, colors, onCaptured }) {
  return (
    <ViewShot
      options={{ format: 'png', quality: 1 }}
      captureMode="mount"
      onCapture={onCaptured}
      style={styles.hidden}
    >
      <View style={[styles.pin, { borderColor: colors.accent, backgroundColor: colors.surface }]}>
        <Text style={[styles.text, { color: colors.accent }]}>{priceText}</Text>
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
  pin: {
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  text: {
    fontWeight: '700',
    fontSize: 12,
  },
});
