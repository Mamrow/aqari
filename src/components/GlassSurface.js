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
 * Applied to the floating controls and the tab bar — the things that sit
 * *over* content — rather than to cards, sheets or the map itself. Those
 * already have their own surfaces, and glass on a surface that isn't floating
 * over anything just costs a blur pass to draw a tinted rectangle.
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
