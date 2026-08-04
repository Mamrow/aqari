import { StyleSheet, Text, View } from 'react-native';
import { useThemeColors } from '../theme/useThemeColors';

export default function PlaceholderScreen({ title, subtitle }) {
  const colors = useThemeColors();

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Text style={[styles.title, { color: colors.heading }]}>{title}</Text>
      {subtitle ? (
        <Text style={[styles.subtitle, { color: colors.textMuted }]}>{subtitle}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
  },
});
