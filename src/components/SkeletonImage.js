import { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';

// A gray placeholder with a lighter band sliding across it while the image
// is still downloading/decoding — replaces the old flat ActivityIndicator
// spinner treatment with the more standard "shimmer" loading cue.
//
// expo-image rather than React Native's Image, for two concrete problems:
//
// - Speed. RN's Image leans on the OS URL cache, which evicts freely, so
//   opening a listing re-downloaded photos already seen on its card. expo-image
//   keeps a real memory + disk cache, which is also what makes the prefetch in
//   HomeMapScreen worth doing.
// - Stale pictures. The map's preview card is one component that stays
//   mounted while the selected listing changes, and RN's Image keeps painting
//   the previous bitmap until the new one arrives — tap your listing and a
//   demo listing's photo showed first. recyclingKey drops the old image the
//   moment the URI changes.
const CONTENT_FIT = { cover: 'cover', contain: 'contain', stretch: 'fill', center: 'none' };

export default function SkeletonImage({ uri, style, colors, resizeMode = 'cover', imageStyle }) {
  const [loading, setLoading] = useState(true);
  // Same component, new photo: back to the shimmer. Without this the flag is
  // still false from the previous image, so the swap shows nothing at all.
  useEffect(() => {
    setLoading(true);
  }, [uri]);
  const [width, setWidth] = useState(0);
  const shimmerAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!loading) return undefined;
    shimmerAnim.setValue(0);
    const loop = Animated.loop(
      Animated.timing(shimmerAnim, {
        toValue: 1,
        duration: 1100,
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => loop.stop();
  }, [loading, shimmerAnim]);

  // The band is as wide as the container itself, so sweeping from
  // -width to +width always fully clears both edges regardless of size.
  const bandWidth = width || 200;
  const translateX = shimmerAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-bandWidth, bandWidth],
  });

  return (
    <View
      style={[style, { backgroundColor: colors.border, overflow: 'hidden' }]}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
    >
      <Image
        source={{ uri }}
        style={[StyleSheet.absoluteFill, imageStyle]}
        contentFit={CONTENT_FIT[resizeMode] ?? 'cover'}
        cachePolicy="memory-disk"
        recyclingKey={uri}
        transition={150}
        onLoadEnd={() => setLoading(false)}
      />
      {loading && (
        <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ translateX }] }]}>
          <LinearGradient
            colors={['transparent', colors.skeletonHighlight ?? 'rgba(255,255,255,0.35)', 'transparent']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      )}
    </View>
  );
}
