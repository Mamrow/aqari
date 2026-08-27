import { useEffect, useRef, useState } from 'react';
import { Animated, Image, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

// A gray placeholder with a lighter band sliding across it while the image
// is still downloading/decoding — replaces the old flat ActivityIndicator
// spinner treatment with the more standard "shimmer" loading cue.
export default function SkeletonImage({ uri, style, colors, resizeMode, imageStyle }) {
  const [loading, setLoading] = useState(true);
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
        resizeMode={resizeMode}
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
