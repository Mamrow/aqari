import { StyleSheet, View } from 'react-native';
import { Camera, Map, Marker } from '@maplibre/maplibre-react-native';
import { getMapStyleUrl } from '../../theme/mapStyle';

const DEFAULT_ZOOM = 14;

/**
 * A single-pin map: read-only on the listing detail screen, tap-to-place on
 * the add-listing screen. MapLibre + MapTiler implementation.
 */
export default function SimpleMap({ latitude, longitude, onPress, theme, colors, zoom = DEFAULT_ZOOM, style }) {
  return (
    <Map
      style={style}
      mapStyle={getMapStyleUrl(theme)}
      onPress={
        onPress
          ? (event) => {
              const [lng, lat] = event.nativeEvent.lngLat;
              onPress({ latitude: lat, longitude: lng });
            }
          : undefined
      }
    >
      <Camera initialViewState={{ center: [longitude, latitude], zoom }} />
      <Marker id="simple-map-pin" lngLat={[longitude, latitude]}>
        <View style={[styles.pin, { backgroundColor: colors.accent }]} />
      </Marker>
    </Map>
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
