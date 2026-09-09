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
const USER_LOCATION_ZOOM = 15;

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
    // `zoom` is on the standard 256px-tile scale, same as everywhere else
    // outside this file — converted here rather than at the call sites, so
    // callers never have to know which map library is underneath.
    centerOn(latitude, longitude, zoom = USER_LOCATION_ZOOM) {
      cameraRef.current?.flyTo({
        center: [longitude, latitude],
        zoom: zoom - MAPLIBRE_ZOOM_OFFSET,
        duration: 600,
      });
    },
    /**
     * Move to somewhere without yanking the zoom in. `maxZoom` is a ceiling,
     * not a target: already looking at the whole country? stay there, just
     * shift across. Already zoomed past it? come out to the ceiling so the
     * area is actually legible. Picking a city should feel like the map
     * slides over, not like it dives.
     */
    moveTo(latitude, longitude, maxZoom) {
      cameraRef.current?.flyTo({
        center: [longitude, latitude],
        zoom: Math.min(mapZoom + MAPLIBRE_ZOOM_OFFSET, maxZoom) - MAPLIBRE_ZOOM_OFFSET,
        duration: 700,
      });
    },
  }), [mapZoom]);

  // MapLibre hands back bounds already in supercluster's own
  // [west, south, east, north] order, so no conversion is needed here — the
  // iOS side has to derive both bbox and zoom from lat/lng deltas instead.
  const handleRegionDidChange = useCallback((event) => {
    const { bounds, zoom } = event.nativeEvent;
    // Mid-gesture and mid-animation events can arrive without usable bounds.
    // Writing those into state emptied the viewport filter and every pin
    // vanished until the next good event — which read as listings randomly
    // disappearing while zooming. Keeping the last known good bounds is
    // always better than believing a broken one.
    if (!Array.isArray(bounds) || bounds.length !== 4 || bounds.some((n) => !Number.isFinite(n))) {
      return;
    }
    setMapBounds(bounds);
    if (Number.isFinite(zoom)) setMapZoom(zoom);
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
