import { StyleSheet, View } from 'react-native';
// Apple Maps — see the note in ListingsMap.ios.js about deliberately not
// passing a `provider`.
import MapView, { Marker } from 'react-native-maps';

const DEFAULT_ZOOM = 14;
const longitudeDeltaFromZoom = (zoom) => 360 / 2 ** zoom;

/**
 * A single-pin map: read-only on the listing detail screen, tap-to-place on
 * the add-listing screen. Apple Maps implementation.
 */
export default function SimpleMap({ latitude, longitude, onPress, theme, colors, zoom = DEFAULT_ZOOM, style }) {
  const delta = longitudeDeltaFromZoom(zoom);
  return (
    <MapView
      style={style}
      initialRegion={{ latitude, longitude, latitudeDelta: delta, longitudeDelta: delta }}
      onPress={onPress ? (event) => onPress(event.nativeEvent.coordinate) : undefined}
      userInterfaceStyle={theme}
    >
      <Marker coordinate={{ latitude, longitude }}>
        <View style={[styles.pin, { backgroundColor: colors.accent }]} />
      </Marker>
    </MapView>
  );
}

const styles = StyleSheet.create({
  pin: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 3,
    borderColor: '#fff',
  },
});
