import { useState } from 'react';
import { ActivityIndicator, Image, StyleSheet, View } from 'react-native';

// Shows a spinner over the placeholder background while the image is still
// downloading/decoding, instead of a flat gray box with no feedback at all.
export default function GalleryImageItem({ uri, style, colors }) {
  const [loading, setLoading] = useState(true);

  return (
    <View style={[style, { backgroundColor: colors.border }]}>
      <Image
        source={{ uri }}
        style={StyleSheet.absoluteFill}
        onLoadEnd={() => setLoading(false)}
      />
      {loading && (
        <ActivityIndicator style={StyleSheet.absoluteFill} color={colors.accent} />
      )}
    </View>
  );
}
