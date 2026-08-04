// Lets `.svg` files be imported directly as React components (used for the
// payment-gateway logos in BoostListingSection.js) — plain RN <Image> can't
// decode SVG on Android, so this is required rather than optional.
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
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
