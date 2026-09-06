// MapTiler-hosted MapLibre styles — replaced react-native-maps/Google Maps
// entirely (see git history for the removal). "streets-v2" is MapTiler's
// closest built-in match to Google Maps' own classic road-map look; "-dark"
// is its dark-theme counterpart, both confirmed live under the account's key.
const MAPTILER_KEY = process.env.EXPO_PUBLIC_MAPTILER_KEY;

export function getMapStyleUrl(theme) {
  const styleId = theme === 'dark' ? 'streets-v2-dark' : 'streets-v2';
  return `https://api.maptiler.com/maps/${styleId}/style.json?key=${MAPTILER_KEY}`;
}
