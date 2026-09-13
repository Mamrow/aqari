import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useThemeColors } from '../theme/useThemeColors';

export default function PlaceholderScreen({
  title,
  subtitle,
  icon = 'home-outline',
  action,
  // Same escape hatch StatusScreen has: `inline` drops the flex:1 and the
  // opaque background, so this can sit inside a card instead of filling a
  // screen. Without it the content collapses to zero height in an
  // auto-sized parent, and paints square corners over a rounded one.
  inline = false,
}) {
  const colors = useThemeColors();

  return (
    <View
      style={[
        styles.container,
        inline ? styles.containerInline : { backgroundColor: colors.background },
      ]}
    >
      <View style={[styles.iconCircle, { backgroundColor: `${colors.accent}12` }]}>
        <Ionicons name={icon} size={30} color={colors.accent} />
      </View>
      <Text style={[styles.title, { color: colors.heading }]}>{title}</Text>
      {subtitle ? (
        <Text style={[styles.subtitle, { color: colors.textMuted }]}>{subtitle}</Text>
      ) : null}
      {action ? (
        <Pressable
          onPress={action.onPress}
          style={({ pressed }) => [styles.action, { backgroundColor: colors.accent, opacity: pressed ? 0.85 : 1 }]}
          accessibilityRole="button"
          accessibilityLabel={action.label}
        >
          <Text style={[styles.actionText, { color: colors.accentText }]}>{action.label}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
  },
  containerInline: {
    flex: 0,
    backgroundColor: 'transparent',
    paddingVertical: 26,
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  title: {
    fontSize: 19,
    lineHeight: 25,
    fontWeight: '800',
    textAlign: 'center',
  },
  subtitle: {
    maxWidth: 310,
    fontSize: 14,
    lineHeight: 21,
    marginTop: 8,
    textAlign: 'center',
  },
  action: {
    minHeight: 46,
    borderRadius: 12,
    paddingHorizontal: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
  },
  actionText: {
    fontSize: 14,
    fontWeight: '800',
  },
});
