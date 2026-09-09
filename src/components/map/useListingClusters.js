import { useMemo } from 'react';
import Supercluster from 'supercluster';

// Clustering is shared across both platform map implementations
// (ListingsMap.ios.js / ListingsMap.android.js) even though the renderers
// are completely different — supercluster is pure JS and knows nothing about
// either map library, so both platforms group listings identically and only
// the drawing differs. That's deliberate: two clustering implementations
// would drift, and "why does Android cluster differently from iOS" is a bug
// nobody wants to chase.
export const CLUSTER_RADIUS = 60;
export const CLUSTER_MAX_ZOOM = 17;

/**
 * Clustering is currently OFF — every listing in view gets its own price pin.
 * The clustering path below is kept rather than deleted because this is a
 * "for now" decision: at demo-seed density (a few dozen listings) the bubbles
 * hid more than they helped, but that reverses as soon as the map holds real
 * inventory. Flip this back to `true` to restore it; nothing else has to
 * change, since both renderers consume whatever useMapFeatures returns and
 * only draw a bubble for features that say `cluster: true`.
 */
export const CLUSTERING_ENABLED = false;

/**
 * Supercluster speaks the standard slippy-map zoom scale, the one built on
 * 256px tiles: the whole world is 256 * 2^z pixels wide. Both map libraries
 * here disagree with it in their own way, so every zoom crossing this
 * boundary has to be converted, and getting it wrong doesn't error — it just
 * clusters at the wrong level and silently drops pins that should be on
 * screen.
 *
 * MapLibre renders 512px vector tiles, so its world is 512 * 2^z wide. The
 * two agree when 256 * 2^z256 == 512 * 2^zMapLibre, i.e. z256 = zMapLibre + 1,
 * exactly and independently of screen size.
 */
export const MAPLIBRE_ZOOM_OFFSET = 1;

/**
 * react-native-maps has no zoom at all — it describes the camera as a
 * lat/lng span. Converting that to a zoom needs the viewport width, because
 * the same span on a wider screen is a lower zoom: the world is
 * (viewportWidth * 360 / longitudeDelta) pixels wide, and z256 is that over
 * 256. Leaving the width out (as an earlier version did) biases the zoom by
 * about 0.7 of a level on a phone — enough to cluster one level too coarsely.
 */
export function zoomFromLongitudeDelta(longitudeDelta, viewportWidth) {
  return Math.log2((viewportWidth * 360) / (longitudeDelta * 256));
}

/** Inverse of zoomFromLongitudeDelta, for building a region from a zoom. */
export function longitudeDeltaFromZoom(zoom, viewportWidth) {
  return (viewportWidth * 360) / (256 * 2 ** zoom);
}

/**
 * Builds a supercluster index over the given listings.
 *
 * Rebuilt whenever the filtered set changes (sale/rent toggle, any filter,
 * search). At this app's scale — hundreds of listings, not tens of thousands
 * — reloading the index outright is cheaper than diffing the point set.
 */
export function useListingClusters(listings) {
  return useMemo(() => {
    const index = new Supercluster({ radius: CLUSTER_RADIUS, maxZoom: CLUSTER_MAX_ZOOM });
    // An index nobody queries still costs a full rebuild on every filter
    // change, so while clustering is off it's loaded with nothing.
    index.load(
      (CLUSTERING_ENABLED ? listings : []).map((listing) => ({
        type: 'Feature',
        properties: { listingId: listing.id },
        geometry: { type: 'Point', coordinates: [listing.longitude, listing.latitude] },
      }))
    );
    return index;
  }, [listings]);
}

/**
 * The features to draw for the current viewport: cluster bubbles and lone
 * pins when clustering is on, one pin per visible listing when it's off.
 *
 * Both shapes are GeoJSON points carrying `properties.listingId`, and only
 * clusters carry `properties.cluster`, so the renderers don't branch on the
 * flag — they just draw what they're given.
 *
 * @param bbox [west, south, east, north]
 * @param zoom standard 256px-tile zoom (see MAPLIBRE_ZOOM_OFFSET)
 */
// Grow the viewport box by this fraction of its own width/height before
// deciding what's visible. Without it a pin sitting a hair outside the edge
// pops out the instant the camera moves, and the bounds a map reports lag a
// frame or two behind what's drawn — so pins near the edge flickered in and
// out while zooming. Rendering a few extra markers just off-screen is far
// cheaper than that.
const VIEWPORT_PADDING = 0.15;

function padBbox([west, south, east, north]) {
  const padX = (east - west) * VIEWPORT_PADDING;
  const padY = (north - south) * VIEWPORT_PADDING;
  return [west - padX, south - padY, east + padX, north + padY];
}

export function useMapFeatures(listings, bbox, zoom) {
  const clusterIndex = useListingClusters(listings);
  return useMemo(() => {
    const padded = padBbox(bbox);
    if (CLUSTERING_ENABLED) {
      return clusterIndex.getClusters(padded, Math.round(zoom));
    }
    const [west, south, east, north] = padded;
    return listings
      .filter(
        (listing) =>
          listing.longitude >= west &&
          listing.longitude <= east &&
          listing.latitude >= south &&
          listing.latitude <= north
      )
      .map((listing) => ({
        type: 'Feature',
        properties: { listingId: listing.id },
        geometry: { type: 'Point', coordinates: [listing.longitude, listing.latitude] },
      }));
  }, [clusterIndex, listings, bbox, zoom]);
}

/** id -> listing, so a cluster feature can be resolved back to its listing. */
export function useListingsById(listings) {
  return useMemo(
    () => Object.fromEntries(listings.map((listing) => [listing.id, listing])),
    [listings]
  );
}
