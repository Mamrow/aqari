import { forwardRef, useCallback, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Dimensions, StyleSheet } from 'react-native';
// No `provider` prop anywhere in this file — that's what makes it Apple Maps.
// Passing PROVIDER_GOOGLE here would pull in Google's SDK and the API key /
// billing account that switching to MapLibre on Android was meant to escape.
import MapView, { Marker } from 'react-native-maps';
import { TRIPOLI_MAP_DEFAULT } from '../../data/constants';
import {
  CLUSTER_MAX_ZOOM,
  longitudeDeltaFromZoom,
  useListingClusters,
  useListingsById,
  useMapFeatures,
  zoomFromLongitudeDelta,
} from './useListingClusters';
import { ClusterBubble, PricePin } from './MapPins';

const DEFAULT_ZOOM = TRIPOLI_MAP_DEFAULT.zoom;
const USER_LOCATION_ZOOM = 15;

// react-native-maps speaks in lat/lng deltas, supercluster in zoom levels;
// the conversion needs the viewport width, so it lives in useListingClusters
// alongside the MapLibre one. Read at module scope rather than through
// useWindowDimensions: the map is full-bleed and this only seeds the initial
// camera, so a rotation mid-session doesn't need to move it.
const VIEWPORT_WIDTH = Dimensions.get('window').width;

const regionForZoom = (latitude, longitude, zoom) => {
  const longitudeDelta = longitudeDeltaFromZoom(zoom, VIEWPORT_WIDTH);
  return { latitude, longitude, latitudeDelta: longitudeDelta, longitudeDelta };
};

const INITIAL_REGION = regionForZoom(
  TRIPOLI_MAP_DEFAULT.latitude,
  TRIPOLI_MAP_DEFAULT.longitude,
  DEFAULT_ZOOM
);

/**
 * Apple Maps implementation of the listings map.
 *
 * Metro resolves this file on iOS and ListingsMap.android.js on Android —
 * screens just `import ListingsMap from '../components/map/ListingsMap'` and
 * never branch on Platform themselves.
 */
const ListingsMap = forwardRef(function ListingsMap(
  { listings, selectedId, onSelectListing, theme, colors, showsUserLocation, style },
  ref
) {
  const mapRef = useRef(null);
  const [region, setRegion] = useState(INITIAL_REGION);

  const clusterIndex = useListingClusters(listings);
  const listingsById = useListingsById(listings);

  useImperativeHandle(ref, () => ({
    centerOn(latitude, longitude, zoom = USER_LOCATION_ZOOM) {
      mapRef.current?.animateToRegion(regionForZoom(latitude, longitude, zoom), 400);
    },
  }));

  const bbox = useMemo(
    () => [
      region.longitude - region.longitudeDelta / 2,
      region.latitude - region.latitudeDelta / 2,
      region.longitude + region.longitudeDelta / 2,
      region.latitude + region.latitudeDelta / 2,
    ],
    [region]
  );
  const features = useMapFeatures(
    listings,
    bbox,
    zoomFromLongitudeDelta(region.longitudeDelta, VIEWPORT_WIDTH)
  );

  const handleClusterPress = useCallback(
    (clusterId, latitude, longitude) => {
      const expansionZoom = Math.min(
        clusterIndex.getClusterExpansionZoom(clusterId),
        CLUSTER_MAX_ZOOM + 1
      );
      mapRef.current?.animateToRegion(regionForZoom(latitude, longitude, expansionZoom), 300);
    },
    [clusterIndex]
  );

  return (
    <MapView
      ref={mapRef}
      style={style ?? StyleSheet.absoluteFill}
      initialRegion={INITIAL_REGION}
      onRegionChangeComplete={setRegion}
      showsUserLocation={showsUserLocation}
      userInterfaceStyle={theme}
    >
      {features.map((feature) => {
        const [longitude, latitude] = feature.geometry.coordinates;

        if (feature.properties.cluster) {
          const clusterId = feature.properties.cluster_id;
          return (
            <Marker
              key={`cluster-${clusterId}`}
              coordinate={{ latitude, longitude }}
              onPress={() => handleClusterPress(clusterId, latitude, longitude)}
            >
              <ClusterBubble count={feature.properties.point_count} colors={colors} />
            </Marker>
          );
        }

        const listing = listingsById[feature.properties.listingId];
        if (!listing) return null;
        return (
          <Marker
            key={listing.id}
            coordinate={{ latitude, longitude }}
            onPress={() => onSelectListing(listing.id)}
          >
            <PricePin listing={listing} selected={selectedId === listing.id} colors={colors} />
          </Marker>
        );
      })}
    </MapView>
  );
});

export default ListingsMap;
