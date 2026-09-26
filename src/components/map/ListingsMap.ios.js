import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Dimensions, StyleSheet } from 'react-native';
// No `provider` prop anywhere in this file — that's what makes it Apple Maps.
// Passing PROVIDER_GOOGLE here would pull in Google's SDK and the API key /
// billing account that switching to MapLibre on Android was meant to escape.
import MapView, { Marker } from 'react-native-maps';
import { TRIPOLI_MAP_DEFAULT } from '../../data/constants';
import {
  boundsOfListings,
  CLUSTER_MAX_ZOOM,
  CLUSTERING_ENABLED,
  longitudeDeltaFromZoom,
  useListingClusters,
  useListingsById,
  useMapFeatures,
  zoomFromLongitudeDelta,
} from './useListingClusters';
import { ClusterBubble, PricePin } from './MapPins';

const DEFAULT_ZOOM = TRIPOLI_MAP_DEFAULT.zoom;
// Where the map lands when it follows the device's location on open.
// Street level (15) put you in the middle of your own block with nothing
// else in frame — technically "your location", useless as a property search.
// This is roughly a district: near enough to recognise where you are, wide
// enough that the listings around you are already on screen.
const USER_LOCATION_ZOOM = 13;

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
  {
    listings,
    selectedId,
    onSelectListing,
    theme,
    colors,
    showsUserLocation,
    style,
    // Called with how many listings are inside the current viewport, so the
    // screen can say "nothing here" without needing to know anything about
    // regions, bounds or zoom — all of which live in this file precisely
    // because the two platforms express them differently.
    onVisibleCountChange,
  },
  ref
) {
  const mapRef = useRef(null);
  const [region, setRegion] = useState(INITIAL_REGION);

  const clusterIndex = useListingClusters(listings);
  const listingsById = useListingsById(listings);

  useImperativeHandle(
    ref,
    () => ({
      centerOn(latitude, longitude, zoom = USER_LOCATION_ZOOM) {
        mapRef.current?.animateToRegion(regionForZoom(latitude, longitude, zoom), 400);
      },
      /**
       * Move without yanking the zoom in — `maxZoom` is a ceiling, not a
       * target. See the Android twin for the reasoning.
       */
      moveTo(latitude, longitude, maxZoom) {
        const current = zoomFromLongitudeDelta(region.longitudeDelta, VIEWPORT_WIDTH);
        const zoom = Math.min(current, maxZoom);
        mapRef.current?.animateToRegion(regionForZoom(latitude, longitude, zoom), 500);
      },
      /**
       * Frames every listing currently on the map, with `padding` (points)
       * kept clear for whatever floats over the map's edges. This is what
       * "Show all" does: zoom out only as far as the listings need, rather
       * than to a fixed country view — which on a tall phone screen stretched
       * to half of Africa and Europe, because the map fills the height too.
       */
      showListings(padding) {
        const bounds = boundsOfListings(listings, {
          latitude: region.latitude,
          longitude: region.longitude,
        });
        if (!bounds) return;
        const [west, south, east, north] = bounds;
        mapRef.current?.fitToCoordinates(
          [
            { latitude: south, longitude: west },
            { latitude: north, longitude: east },
          ],
          { edgePadding: padding, animated: true }
        );
      },
    }),
    [region, listings]
  );

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

  // Clusters carry a point_count; a lone pin is one listing. Fires only when
  // the number actually changes, not on every frame of a pan — the screen
  // sets state from this, and an unconditional call would re-render the map
  // on every gesture event.
  const visibleCount = useMemo(
    () => features.reduce((total, feature) => total + (feature.properties?.point_count ?? 1), 0),
    [features]
  );
  const lastReportedCount = useRef(null);
  useEffect(() => {
    if (lastReportedCount.current === visibleCount) return;
    lastReportedCount.current = visibleCount;
    onVisibleCountChange?.(visibleCount);
  }, [visibleCount, onVisibleCountChange]);

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
      {/* Markers for every listing, not just the ones inside the viewport —
          and that is a crash fix, not an oversight.

          `features` is filtered to the current bbox, so zooming in used to
          unmount every marker that fell outside the new viewport. On iOS
          react-native-maps (1.20.1) ships no Fabric components at all — no
          codegenConfig — so each Marker is a legacy view manager wrapped in
          RCTLegacyViewManagerInteropComponentView, and tearing several of
          those down inside one mounting transaction crashed the app in
          -[RCTLegacyViewManagerInteropComponentView finalizeUpdates:] with
          "object cannot be nil". A tester hit it simply by zooming in
          (Sentry 7756774873, build 23, iOS 26.6.2).

          Keeping every marker mounted means a zoom is a camera change and
          nothing else: no mount, no unmount, no transaction to crash in.
          `features` is still what feeds the visible-count banner below, so
          "nothing here" keeps working off the real viewport.

          The cost is that marker count now tracks the whole listing table
          rather than the screen. That is fine at the current volume and is
          the thing to revisit if it grows — by turning CLUSTERING_ENABLED
          back on, which bounds the count by design. The clustered path below
          is untouched and still viewport-driven, since a cluster only means
          anything relative to what's on screen. */}
      {!CLUSTERING_ENABLED &&
        listings.map((listing) => (
          <Marker
            key={listing.id}
            coordinate={{ latitude: listing.latitude, longitude: listing.longitude }}
            onPress={() => onSelectListing(listing.id)}
          >
            <PricePin listing={listing} selected={selectedId === listing.id} colors={colors} />
          </Marker>
        ))}

      {CLUSTERING_ENABLED && features.map((feature) => {
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
