import { useEffect, useRef } from 'react';
import { AccessibilityInfo, ActivityIndicator, Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors } from '../theme/useThemeColors';

// Same green PaymentHistoryScreen already uses for a "paid" status pill —
// one success color for the whole app, not a second ad-hoc one here.
const SUCCESS_GREEN = '#2E8B57';

// A full-screen (or in-modal) Success / Loading / Error state, used anywhere
// an outcome needs to read as designed rather than as a native OS alert with
// a raw error string pasted into it. Three variants, one shared shape:
// icon + title + subtitle + up to two actions.
//
// Motion is deliberately restrained, not decorative — each choice maps to a
// specific reason, not "add some animation":
//   - Success springs in with a small overshoot (friction 5 / tension 170)
//     because it's a genuine completion moment — the one place a little
//     bounce reads as delight rather than noise.
//   - Error settles firmly with no overshoot (friction 9 / tension 180) —
//     bouncing on a failure would read as flippant.
//   - Loading's ring spins continuously; a spinner is already the gentlest
//     possible motion, so it isn't gated behind the reduced-motion check
//     below (removing it would remove the only signal that anything is
//     happening at all).
//   - Respects the OS "reduce motion" setting for the spring entrances —
//     they still land in the right place, just without the spring curve.
export default function StatusScreen({
  variant, // 'success' | 'error' | 'loading'
  title,
  subtitle,
  progress, // optional { current, total } — shows a determinate bar under the spinner
  primaryAction, // optional { label, onPress }
  secondaryAction, // optional { label, onPress }
  inline = false, // true when embedded inside another modal/card rather than filling the screen
  children, // optional extra content slotted between the subtitle and the actions
}) {
  const colors = useThemeColors();
  // Loading has nothing to spring in — ActivityIndicator below is already a
  // native, continuously-spinning ring; there's no entrance to animate.
  const scale = useRef(new Animated.Value(variant === 'loading' ? 1 : 0.4)).current;

  useEffect(() => {
    if (variant === 'loading') return undefined;
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (cancelled) return;
      if (reduced) {
        scale.setValue(1);
        return;
      }
      Animated.spring(scale, {
        toValue: 1,
        friction: variant === 'success' ? 5 : 9,
        tension: variant === 'success' ? 170 : 180,
        useNativeDriver: true,
      }).start();
    });
    return () => {
      cancelled = true;
    };
  }, [variant, scale]);

  const iconColor = variant === 'success' ? SUCCESS_GREEN : variant === 'error' ? colors.danger : colors.accent;
  const iconName = variant === 'success' ? 'checkmark-circle' : variant === 'error' ? 'close-circle' : null;

  return (
    <View style={[styles.container, !inline && { backgroundColor: colors.background }]}>
      <View style={[styles.iconCircle, { backgroundColor: `${iconColor}18` }]}>
        {variant === 'loading' ? (
          <ActivityIndicator size="large" color={colors.accent} />
        ) : (
          <Animated.View style={{ transform: [{ scale }] }}>
            <Ionicons name={iconName} size={56} color={iconColor} />
          </Animated.View>
        )}
      </View>

      {progress && (
        <View style={styles.progressWrap}>
          <View style={[styles.progressTrack, { backgroundColor: colors.border }]}>
            <Animated.View
              style={[
                styles.progressFill,
                {
                  backgroundColor: colors.accent,
                  width: `${Math.min(100, (progress.current / Math.max(1, progress.total)) * 100)}%`,
                },
              ]}
            />
          </View>
          <Text style={[styles.progressText, { color: colors.textMuted }]}>
            {progress.current}/{progress.total}
          </Text>
        </View>
      )}

      {title && <Text style={[styles.title, { color: colors.heading }]}>{title}</Text>}
      {subtitle && <Text style={[styles.subtitle, { color: colors.textMuted }]}>{subtitle}</Text>}

      {children}

      {primaryAction && (
        <Pressable
          onPress={primaryAction.onPress}
          style={({ pressed }) => [
            styles.primaryButton,
            { backgroundColor: iconColor, opacity: pressed ? 0.85 : 1, transform: [{ scale: pressed ? 0.97 : 1 }] },
          ]}
        >
          <Text style={styles.primaryButtonText}>{primaryAction.label}</Text>
        </Pressable>
      )}
      {secondaryAction && (
        <Pressable
          onPress={secondaryAction.onPress}
          style={({ pressed }) => [styles.secondaryButton, { opacity: pressed ? 0.6 : 1 }]}
        >
          <Text style={[styles.secondaryButtonText, { color: colors.textMuted }]}>
            {secondaryAction.label}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  iconCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  progressWrap: {
    width: '100%',
    maxWidth: 240,
    marginBottom: 16,
    gap: 6,
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  progressText: {
    fontSize: 12,
    textAlign: 'center',
  },
  // Tight tracking on the large title, comfortable leading on the smaller
  // subtitle — one fixed letter-spacing for every size reads wrong at both
  // ends, per the two text roles here.
  title: {
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.3,
    lineHeight: 26,
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
    marginBottom: 28,
    maxWidth: 300,
  },
  primaryButton: {
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 32,
    minWidth: 200,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
  secondaryButton: {
    marginTop: 14,
    paddingVertical: 6,
  },
  secondaryButtonText: {
    fontSize: 13,
    fontWeight: '600',
  },
});
