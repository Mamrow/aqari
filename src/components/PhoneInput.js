import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import Text from './Text';
import parsePhoneNumberFromString from 'libphonenumber-js/min';
import { COUNTRIES, DEFAULT_COUNTRY, flagEmoji } from '../data/countries';
import { toEnglishDigits } from '../utils/digits';
import { useT } from '../i18n/useT';

const COUNTRY_BY_CODE = Object.fromEntries(COUNTRIES.map((c) => [c.code, c]));

export { DEFAULT_COUNTRY };

export function callingCodeFor(country) {
  return COUNTRY_BY_CODE[country]?.calling ?? COUNTRY_BY_CODE[DEFAULT_COUNTRY].calling;
}

/**
 * Validates against the real numbering plan for that country, not just a
 * length check — libphonenumber-js knows which prefixes each carrier actually
 * uses, so a made-up number with the right number of digits is still
 * rejected. Libya's mobile prefixes (91-96) used to be hardcoded here; this
 * gives the same strictness for every country instead of only one.
 *
 * Still FORMAT validation: it confirms the number is *shaped* like a real
 * number for that country, not that it belongs to anyone. Only the
 * verification code proves that.
 */
export function isValidPhone(country, nationalDigits) {
  if (!nationalDigits) return false;
  const parsed = parsePhoneNumberFromString(nationalDigits, country);
  return Boolean(parsed?.isValid());
}

/** National digits + country → the E.164 string everything downstream uses. */
export function toE164(country, nationalDigits) {
  const parsed = parsePhoneNumberFromString(nationalDigits, country);
  return parsed?.number ?? `+${callingCodeFor(country)}${nationalDigits.trim()}`;
}

/**
 * Splits a stored E.164 number back into a country and its national digits,
 * for pre-filling the field when editing something that was saved earlier.
 * Falls back to Libya so an unparseable legacy value still lands somewhere
 * sensible rather than blanking the field.
 */
export function fromE164(value) {
  if (!value) return { country: DEFAULT_COUNTRY, national: '' };
  const parsed = parsePhoneNumberFromString(value);
  if (parsed?.country) {
    return { country: parsed.country, national: parsed.nationalNumber };
  }
  return { country: DEFAULT_COUNTRY, national: value.replace(/^\+218/, '').replace(/[^\d]/g, '') };
}

/**
 * Phone entry with a fixed country prefix: +218 for anything new. There was a
 * country picker here, for people whose WhatsApp number wasn't Libyan; codes
 * now go out by SMS through a Libyan gateway, so it went. `country` is still a
 * prop so a number saved earlier with another code keeps showing it.
 *
 * `direction: 'ltr'` is pinned on the row and the input: phone numbers read
 * left-to-right in both languages, so without it both the row order and the
 * digits flip along with the rest of the screen in Arabic.
 */
export default function PhoneInput({
  value,
  onChangeText,
  country = DEFAULT_COUNTRY,
  colors,
  placeholder,
}) {
  const t = useT();
  // Local, not lifted — purely about when to start showing the validation
  // message. Waiting for blur means it doesn't yell "invalid" at someone
  // still halfway through typing a perfectly good number.
  const [touched, setTouched] = useState(false);
  const showError = touched && value.length > 0 && !isValidPhone(country, value);

  return (
    <View style={styles.wrapper}>
      <View style={[styles.row, { direction: 'ltr' }]}>
        <View style={[styles.countryButton, { borderColor: colors.inputBorder }]}>
          <Text style={styles.flag}>{flagEmoji(country)}</Text>
          <Text style={[styles.prefix, { color: colors.text }]}>+{callingCodeFor(country)}</Text>
        </View>

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
          autoComplete="tel"
          // No country-specific cap any more — 15 is E.164's own ceiling.
          maxLength={15}
          value={value}
          onChangeText={(text) =>
            onChangeText(toEnglishDigits(text).replace(/[^0-9]/g, '').slice(0, 15))
          }
          onBlur={() => setTouched(true)}
        />
      </View>

      {showError && (
        <Text style={[styles.errorText, { color: colors.danger }]}>{t('invalidPhoneNumber')}</Text>
      )}

    </View>
  );
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
  countryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  flag: {
    fontSize: 18,
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
