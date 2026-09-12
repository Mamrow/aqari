// Lets `.svg` files be imported directly as React components (used for the
// payment-gateway logos in BoostListingSection.js) — plain RN <Image> can't
// decode SVG on Android, so this is required rather than optional.
//
// getSentryExpoConfig is getDefaultConfig plus the deterministic debug IDs
// that let Sentry match a stack frame back to a source map. Without it a
// crash reads as index.hbc:1:284729.
const { getSentryExpoConfig } = require('@sentry/react-native/metro');

const config = getSentryExpoConfig(__dirname);
const { transformer, resolver } = config;

config.transformer = {
  ...transformer,
  babelTransformerPath: require.resolve('react-native-svg-transformer/expo'),
};
config.resolver = {
  ...resolver,
  assetExts: resolver.assetExts.filter((ext) => ext !== 'svg'),
  sourceExts: [...resolver.sourceExts, 'svg'],
};

module.exports = config;
