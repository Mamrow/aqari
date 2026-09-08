export const TRIPOLI_CENTER = { latitude: 32.8872, longitude: 13.1913 };

// Opening frame for the listings map. Deliberately *not* TRIPOLI_CENTER: the
// city point sits right on the coast, so centring the camera there at a
// city-wide zoom puts roughly a third of the screen in the Mediterranean.
// Nudging south and one zoom level in frames the built-up area — where the
// listings actually are (Janzour through Tajura, Kremia up to the corniche) —
// which matters both for first impressions and for store screenshots.
// Shared by ListingsMap.ios.js and ListingsMap.android.js so the two
// platforms can't drift apart on framing.
export const TRIPOLI_MAP_DEFAULT = {
  latitude: 32.84,
  longitude: 13.19,
  zoom: 12,
};
