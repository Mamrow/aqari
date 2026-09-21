import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useT } from '../i18n/useT';
import { pressedStyle } from '../theme/press';

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
      {/* The placeholder is drawn as our own <Text> rather than handed to the
          TextInput. iOS substitutes its own font on a secureTextEntry field
          and renders the native placeholder with wide tracking —
          "P a s s w o r d" instead of "Password" — and RN can't style that
          away, because placeholder text ignores letterSpacing on iOS
          (facebook/react-native#19002). Drawing it ourselves takes iOS's
          placeholder rendering out of the picture entirely.

          No textAlign anywhere in here on purpose: both the Text and the
          TextInput default to 'auto', so each follows the writing direction
          and neither needs an RTL branch. */}
      <View style={styles.field}>
        <TextInput
          style={[styles.input, { color: colors.text }]}
          value={value}
          onChangeText={onChangeText}
          placeholderTextColor={placeholderTextColor}
          autoFocus={autoFocus}
          secureTextEntry={!visible}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {!value && (
          <View pointerEvents="none" style={styles.placeholderLayer}>
            <Text
              numberOfLines={1}
              style={[styles.placeholderText, { color: placeholderTextColor }]}
            >
              {placeholder}
            </Text>
          </View>
        )}
      </View>
      <Pressable
        style={({ pressed }) => pressed && pressedStyle}
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
  // Takes the width the TextInput used to take; the TextInput now sizes the
  // height and the placeholder layer is measured against this box.
  field: {
    flex: 1,
  },
  input: {
    fontSize: 15,
  },
  placeholderLayer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
  },
  placeholderText: {
    fontSize: 15,
  },
});
