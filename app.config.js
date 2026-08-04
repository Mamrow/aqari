module.exports = ({ config }) => {
  const googleMapsApiKey = process.env.GOOGLE_MAPS_API_KEY_ANDROID;

  return {
    ...config,
    android: {
      ...config.android,
      config: {
        ...config.android?.config,
        ...(googleMapsApiKey ? { googleMaps: { apiKey: googleMapsApiKey } } : {}),
      },
    },
  };
};
