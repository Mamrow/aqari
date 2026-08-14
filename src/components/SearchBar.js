import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useT } from '../i18n/useT';

export default function SearchBar({ value, onChangeText, placeholder, colors, style, testID }) {
  const t = useT();

  return (
    <View style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }, style]}>
      <Ionicons name="search" size={18} color={colors.textMuted} accessibilityElementsHidden importantForAccessibility="no" />
      <TextInput
        style={[styles.input, { color: colors.text }]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.placeholderText}
        accessibilityLabel={placeholder ?? t('a11ySearchListings')}
        returnKeyType="search"
        testID={testID}
      />
      {value.length > 0 && (
        <Pressable
          onPress={() => onChangeText('')}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={t('a11yClearSearch')}
          testID="search-clear"
        >
          <Ionicons name="close-circle" size={18} color={colors.textMuted} />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  input: {
    flex: 1,
    fontSize: 14,
    padding: 0,
  },
});
