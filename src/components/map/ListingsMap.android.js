import { forwardRef, useCallback, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { StyleSheet } from 'react-native';
import { Camera, Map, Marker, UserLocation } from '@maplibre/maplibre-react-native';
import { TRIPOLI_CENTER } from '../../data/constants';
import { getMapStyleUrl } from '../../theme/mapStyle';
import { CLUSTER_MAX_ZOOM, useListingClusters, useListingsById } from './useListingClusters';
import { ClusterBubble, PricePin } from './MapPins';

const TRIPOLI_CENTER_LNGLAT = [TRIPOLI_CENTER.longitude, TRIPOLI_CENTER.latitude];
const DEFAULT_ZOOM = 11;
const USER_LOCATION_ZOOM = 14;

// Seeded with a bbox roughly matching DEFAULT_ZOOM around Tripoli so the very
// first render has something to cluster against, before the Map's own first
// onRegionDidChange fires.
const INITIAL_BOUNDS = [12.0, 32.7, 13.6, 33.1];

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

  const clusters = useMemo(
    () => clusterIndex.getClusters(mapBounds, Math.round(mapZoom)),
    [clusterIndex, mapBounds, mapZoom]
  );

  const handleClusterPress = useCallback(
    (clusterId, coordinates) => {
      const expansionZoom = Math.min(
        clusterIndex.getClusterExpansionZoom(clusterId),
        CLUSTER_MAX_ZOOM + 1
      );
      cameraRef.current?.flyTo({ center: coordinates, zoom: expansionZoom, duration: 300 });
    },
    [clusterIndex]
  );

  return (
    <Map
      style={style ?? StyleSheet.absoluteFill}
      mapStyle={getMapStyleUrl(theme)}
      onRegionDidChange={handleRegionDidChange}
    >
      <Camera ref={cameraRef} initialViewState={{ center: TRIPOLI_CENTER_LNGLAT, zoom: DEFAULT_ZOOM }} />
      {showsUserLocation && <UserLocation />}

      {clusters.map((feature) => {
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
