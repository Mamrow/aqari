import { View } from 'react-native';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';

/**
 * A floating surface that uses iOS 26+ Liquid Glass where the OS provides it,
 * and falls back to a plain opaque surface everywhere else.
 *
 * `isLiquidGlassAvailable()` is the only check worth making: it's false on
 * Android, false on iOS 25 and below, and false in any build where the app
 * opted out of the new design (UIDesignRequiresCompatibility). Version
 * sniffing would get all three of those wrong.
 *
 * Glass only reads as glass over something with detail — a map, a photo, a
 * list scrolling past. Over a flat background it's an expensive way to draw a
 * grey box, which is why this is applied to the floating controls and the tab
 * bar rather than to cards and sheets.
 */
export default function GlassSurface({
  children,
  style,
  // The solid colour to use when glass isn't available. Passed in rather than
  // read from the theme here so callers keep control of their own surface.
  fallbackColor,
  glassEffectStyle = 'regular',
  tintColor,
  isInteractive = false,
  ...rest
}) {
  if (!isLiquidGlassAvailable()) {
    return (
      <View style={[style, fallbackColor ? { backgroundColor: fallbackColor } : null]} {...rest}>
        {children}
      </View>
    );
  }

  return (
    <GlassView
      // No backgroundColor: a fill behind the effect is what makes glass look
      // like frosted plastic instead of glass.
      style={style}
      glassEffectStyle={glassEffectStyle}
      tintColor={tintColor}
      isInteractive={isInteractive}
      {...rest}
    >
      {children}
    </GlassView>
  );
}

/** True when the current OS will actually render the glass effect. */
export { isLiquidGlassAvailable };
