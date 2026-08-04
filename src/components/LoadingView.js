import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useThemeColors } from '../theme/useThemeColors';

export default function LoadingView() {
  const colors = useThemeColors();
  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ActivityIndicator size="large" color={colors.accent} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
