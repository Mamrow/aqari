import { forwardRef, useCallback, useImperativeHandle, useRef, useState } from 'react';
import { StyleSheet } from 'react-native';
import { Camera, Map, Marker, UserLocation } from '@maplibre/maplibre-react-native';
import { TRIPOLI_MAP_DEFAULT } from '../../data/constants';
import { getMapStyleUrl } from '../../theme/mapStyle';
import {
  CLUSTER_MAX_ZOOM,
  MAPLIBRE_ZOOM_OFFSET,
  useListingClusters,
  useListingsById,
  useMapFeatures,
} from './useListingClusters';
import { ClusterBubble, PricePin } from './MapPins';

const DEFAULT_CENTER_LNGLAT = [TRIPOLI_MAP_DEFAULT.longitude, TRIPOLI_MAP_DEFAULT.latitude];
// TRIPOLI_MAP_DEFAULT.zoom, like every zoom outside this file, is on the
// standard 256px-tile scale; MapLibre wants its own 512px-tile scale.
const DEFAULT_ZOOM = TRIPOLI_MAP_DEFAULT.zoom - MAPLIBRE_ZOOM_OFFSET;
const USER_LOCATION_ZOOM = 15 - MAPLIBRE_ZOOM_OFFSET;

// Seeded with a bbox roughly matching DEFAULT_ZOOM around DEFAULT_CENTER so
// the very first render has something to cluster against, before the Map's
// own first onRegionDidChange fires.
const INITIAL_BOUNDS = [13.144, 32.808, 13.226, 32.948];

/**
 * MapLibre + MapTiler implementation of the listings map.
 *
 * Metro resolves this file on Android and ListingsMap.ios.js on iOS — screens
 * just `import ListingsMap from '../components/map/ListingsMap'` and never
 * branch on Platform themselves.
 */
const ListingsMap = forwardRef(function ListingsMap(
  { listings, selectedId, onSelectListing, theme, colors, showsUserLocation, style },
  ref
) {
  const cameraRef = useRef(null);
  const [mapBounds, setMapBounds] = useState(INITIAL_BOUNDS);
  const [mapZoom, setMapZoom] = useState(DEFAULT_ZOOM);

  const clusterIndex = useListingClusters(listings);
  const listingsById = useListingsById(listings);
  const features = useMapFeatures(listings, mapBounds, mapZoom + MAPLIBRE_ZOOM_OFFSET);

  useImperativeHandle(ref, () => ({
    centerOn(latitude, longitude, zoom = USER_LOCATION_ZOOM) {
      cameraRef.current?.flyTo({ center: [longitude, latitude], zoom, duration: 400 });
    },
  }));

  // MapLibre hands back bounds already in supercluster's own
  // [west, south, east, north] order, so no conversion is needed here — the
  // iOS side has to derive both bbox and zoom from lat/lng deltas instead.
  const handleRegionDidChange = useCallback((event) => {
    const { bounds, zoom } = event.nativeEvent;
    setMapBounds(bounds);
    setMapZoom(zoom);
  }, []);

  const handleClusterPress = useCallback(
    (clusterId, coordinates) => {
      const expansionZoom = Math.min(
        clusterIndex.getClusterExpansionZoom(clusterId),
        CLUSTER_MAX_ZOOM + 1
      );
      cameraRef.current?.flyTo({
        center: coordinates,
        zoom: expansionZoom - MAPLIBRE_ZOOM_OFFSET,
        duration: 300,
      });
    },
    [clusterIndex]
  );

  return (
    <Map
      style={style ?? StyleSheet.absoluteFill}
      mapStyle={getMapStyleUrl(theme)}
      onRegionDidChange={handleRegionDidChange}
    >
      <Camera ref={cameraRef} initialViewState={{ center: DEFAULT_CENTER_LNGLAT, zoom: DEFAULT_ZOOM }} />
      {showsUserLocation && <UserLocation />}

      {features.map((feature) => {
        const [longitude, latitude] = feature.geometry.coordinates;

        if (feature.properties.cluster) {
          const clusterId = feature.properties.cluster_id;
          return (
            <Marker
              key={`cluster-${clusterId}`}
              id={`cluster-${clusterId}`}
              lngLat={[longitude, latitude]}
              onPress={() => handleClusterPress(clusterId, [longitude, latitude])}
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
            id={listing.id}
            lngLat={[longitude, latitude]}
            onPress={() => onSelectListing(listing.id)}
          >
            <PricePin listing={listing} selected={selectedId === listing.id} colors={colors} />
          </Marker>
        );
      })}
    </Map>
  );
});

export default ListingsMap;
