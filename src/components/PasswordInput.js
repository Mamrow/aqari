import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useT } from '../i18n/useT';

// Drop-in replacement for a plain `<TextInput secureTextEntry />` password
// field, with a show/hide eye toggle. `style` is expected to be the same
// border/radius/padding/fontSize style object callers already pass to a
// plain TextInput (e.g. AuthModal/ResetPasswordScreen's `styles.input`) —
// it's applied to this component's outer row instead of the TextInput
// itself, so the eye icon sits inside the same bordered box rather than
// needing a second border of its own. Font size is fixed at 15 to match
// every current caller rather than threading another prop through.
export default function PasswordInput({
  style,
  colors,
  value,
  onChangeText,
  placeholder,
  placeholderTextColor,
  autoFocus,
}) {
  const [visible, setVisible] = useState(false);
  const t = useT();

  return (
    <View style={[styles.row, { borderColor: colors.inputBorder }, style]}>
      <TextInput
        style={[styles.input, { color: colors.text }]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={placeholderTextColor}
        autoFocus={autoFocus}
        secureTextEntry={!visible}
        autoCapitalize="none"
        autoCorrect={false}
      />
      <Pressable
        onPress={() => setVisible((prev) => !prev)}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={visible ? t('a11yHidePassword') : t('a11yShowPassword')}
      >
        <Ionicons
          name={visible ? 'eye-off-outline' : 'eye-outline'}
          size={20}
          color={colors.textMuted}
        />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  input: {
    flex: 1,
    fontSize: 15,
  },
});
