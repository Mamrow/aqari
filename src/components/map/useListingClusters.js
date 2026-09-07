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
 * Builds a supercluster index over the given listings.
 *
 * Rebuilt whenever the filtered set changes (sale/rent toggle, any filter,
 * search). At this app's scale — hundreds of listings, not tens of thousands
 * — reloading the index outright is cheaper than diffing the point set.
 */
export function useListingClusters(listings) {
  return useMemo(() => {
    const index = new Supercluster({ radius: CLUSTER_RADIUS, maxZoom: CLUSTER_MAX_ZOOM });
    index.load(
      listings.map((listing) => ({
        type: 'Feature',
        properties: { listingId: listing.id },
        geometry: { type: 'Point', coordinates: [listing.longitude, listing.latitude] },
      }))
    );
    return index;
  }, [listings]);
}

/** id -> listing, so a cluster feature can be resolved back to its listing. */
export function useListingsById(listings) {
  return useMemo(
    () => Object.fromEntries(listings.map((listing) => [listing.id, listing])),
    [listings]
  );
}
