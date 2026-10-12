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
      // TextureView, not the default GLSurfaceView. This map sits inside a
      // scrolling screen, and a SurfaceView draws in its own window layer
      // behind the app's: on a Huawei P30 lite (Mali GPU) everything above
      // and around it on the listing and add-listing screens rendered solid
      // black, leaving only the map. A TextureView composites like any other
      // view. The full-screen browse map keeps the faster SurfaceView, since
      // nothing scrolls over it. Both renderers ship in the same native
      // library, so this needs no new build.
      androidView="texture"
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
