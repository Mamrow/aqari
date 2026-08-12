import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { toEnglishDigits } from '../utils/digits';
import { useT } from '../i18n/useT';

// Libyan mobile numbers are 9 digits starting with 9, then one of the real
// carrier prefixes: 91/92/93/94 (Libyana), 95/96 (Al-Madar). This is what
// "valid" means here, not just "9 digits of something" — catches an
// obviously wrong/random number (wrong length, or a landline-shaped or
// made-up prefix) rather than only rejecting it once it fails at Dpay or on
// the call/WhatsApp button later.
//
// This is FORMAT validation only — it confirms the number is *shaped* like
// a real Libyan mobile number, not that it's actually assigned to anyone or
// reachable. There's no way to know that without actually contacting it:
// sending an SMS/WhatsApp OTP and requiring it be entered back (the
// phone/WhatsApp-OTP auth work parked earlier this project would do this
// for login), or a live carrier HLR lookup API, neither of which this app
// currently does. So "valid" here means "not obviously made up," not
// "verified real" — worth being precise about since those are different
// guarantees.
export function isValidLibyanMobile(digits) {
  return /^9[1-6]\d{7}$/.test(digits);
}

// Fixed "+218" prefix everywhere a phone number is entered (login, agent contact
// number, etc.) — the user only ever types the local digits after it. Phone
// numbers read left-to-right regardless of app language, so `direction: 'ltr'`
// pins this row's layout (and the input's own text) against React Native's
// automatic RTL mirroring when the app is in Arabic — without it, both the
// row order and the digit alignment flip along with the rest of the screen.
export default function PhoneInput({ value, onChangeText, colors, placeholder }) {
  const t = useT();
  // Local, not lifted to the parent — purely about when to start showing the
  // red validation message. Waiting for blur (rather than showing it the
  // instant a 1st digit is typed) means it doesn't yell "invalid" at someone
  // who's still in the middle of typing a perfectly good number.
  const [touched, setTouched] = useState(false);
  const showError = touched && value.length > 0 && !isValidLibyanMobile(value);

  return (
    <View style={styles.wrapper}>
      <View style={[styles.row, { direction: 'ltr' }]}>
        <Text style={[styles.prefix, { color: colors.text }]}>+218</Text>
        <TextInput
          style={[
            styles.input,
            {
              borderColor: showError ? colors.danger : colors.inputBorder,
              color: colors.text,
              textAlign: 'left',
              writingDirection: 'ltr',
            },
          ]}
          placeholder={placeholder}
          placeholderTextColor={colors.placeholderText}
          keyboardType="phone-pad"
          maxLength={9}
          value={value}
          onChangeText={(text) =>
            onChangeText(toEnglishDigits(text).replace(/[^0-9]/g, '').slice(0, 9))
          }
          onBlur={() => setTouched(true)}
        />
      </View>
      {showError && (
        <Text style={[styles.errorText, { color: colors.danger }]}>
          {t('invalidPhoneNumber')}
        </Text>
      )}
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
  wrapper: {
    marginBottom: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
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
  errorText: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 6,
  },
});
