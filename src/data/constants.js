export const TRIPOLI_CENTER = { latitude: 32.8872, longitude: 13.1913 };

// Opening frame for the listings map. Deliberately *not* TRIPOLI_CENTER at a
// city-wide zoom: Tripoli's built-up area is a wide coastal strip (roughly
// 35km east-west, 13km north-south), so on a portrait phone any zoom wide
// enough to hold the whole city leaves most of the screen as either open
// Mediterranean above it or empty desert below. Framing the dense centre
// instead trades a few outlying listings for a screen that's actually full of
// city — which is both the better first impression and what the store
// screenshots need. Tuned against the demo seed: ~15 of the 35 Tripoli
// listings land in the part of the map that's actually visible, with the
// coastline along the top. Note the search bar and filter chips float over
// roughly the top sixth of the map, so the camera is aimed a little north of
// where the visible centre ends up.
//
// `zoom` is on the standard 256px-tile scale — the one supercluster uses.
// MapLibre's own scale is one level lower; ListingsMap.android.js converts.
//
// Shared by ListingsMap.ios.js and ListingsMap.android.js so the two
// platforms can't drift apart on framing.
export const TRIPOLI_MAP_DEFAULT = {
  latitude: 32.878,
  longitude: 13.185,
  zoom: 12.8,
};
