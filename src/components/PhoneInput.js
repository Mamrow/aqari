import { StyleSheet, Text, TextInput, View } from 'react-native';
import { toEnglishDigits } from '../utils/digits';

// Fixed "+218" prefix everywhere a phone number is entered (login, agent contact
// number, etc.) — the user only ever types the local digits after it. Phone
// numbers read left-to-right regardless of app language, so `direction: 'ltr'`
// pins this row's layout (and the input's own text) against React Native's
// automatic RTL mirroring when the app is in Arabic — without it, both the
// row order and the digit alignment flip along with the rest of the screen.
export default function PhoneInput({ value, onChangeText, colors, placeholder }) {
  return (
    <View style={[styles.row, { direction: 'ltr' }]}>
      <Text style={[styles.prefix, { color: colors.text }]}>+218</Text>
      <TextInput
        style={[
          styles.input,
          { borderColor: colors.inputBorder, color: colors.text, textAlign: 'left', writingDirection: 'ltr' },
        ]}
        placeholder={placeholder}
        placeholderTextColor={colors.placeholderText}
        keyboardType="phone-pad"
        maxLength={9}
        value={value}
        onChangeText={(text) =>
          onChangeText(toEnglishDigits(text).replace(/[^0-9]/g, '').slice(0, 9))
        }
      />
    </View>
  );
}

export function stripLibyaPrefix(phone) {
  return phone ? phone.replace(/^\+218/, '') : '';
}

export function withLibyaPrefix(digits) {
  return `+218${digits.trim()}`;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  prefix: {
    fontSize: 15,
    fontWeight: '600',
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
  },
});
