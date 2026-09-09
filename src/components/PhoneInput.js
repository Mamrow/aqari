import { useMemo, useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import parsePhoneNumberFromString from 'libphonenumber-js/min';
import { COUNTRIES, DEFAULT_COUNTRY, flagEmoji } from '../data/countries';
import { toEnglishDigits } from '../utils/digits';
import { useAppContext } from '../context/AppContext';
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
 * Phone entry with a country selector. Defaults to Libya, because that's who
 * the app is for — but the number someone's WhatsApp is registered against
 * isn't always a Libyan one, and forcing +218 would lock those people out of
 * signing up at all.
 *
 * `direction: 'ltr'` is pinned on the row and the input: phone numbers read
 * left-to-right in both languages, so without it both the row order and the
 * digits flip along with the rest of the screen in Arabic.
 */
export default function PhoneInput({
  value,
  onChangeText,
  country = DEFAULT_COUNTRY,
  onChangeCountry,
  colors,
  placeholder,
}) {
  const t = useT();
  const [pickerOpen, setPickerOpen] = useState(false);
  // Local, not lifted — purely about when to start showing the validation
  // message. Waiting for blur means it doesn't yell "invalid" at someone
  // still halfway through typing a perfectly good number.
  const [touched, setTouched] = useState(false);
  const showError = touched && value.length > 0 && !isValidPhone(country, value);

  return (
    <View style={styles.wrapper}>
      <View style={[styles.row, { direction: 'ltr' }]}>
        <Pressable
          style={[styles.countryButton, { borderColor: colors.inputBorder }]}
          onPress={() => onChangeCountry && setPickerOpen(true)}
          disabled={!onChangeCountry}
          accessibilityRole="button"
          accessibilityLabel={t('countryPickerTitle')}
        >
          <Text style={styles.flag}>{flagEmoji(country)}</Text>
          <Text style={[styles.prefix, { color: colors.text }]}>+{callingCodeFor(country)}</Text>
          {onChangeCountry && (
            <Ionicons name="chevron-down" size={14} color={colors.textMuted} />
          )}
        </Pressable>

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

      {onChangeCountry && (
        <CountryPicker
          visible={pickerOpen}
          selected={country}
          colors={colors}
          onSelect={(code) => {
            onChangeCountry(code);
            setPickerOpen(false);
            // A number valid for the old country usually isn't valid for the
            // new one, and showing a red error the instant someone switches
            // country reads as the picker being broken.
            setTouched(false);
          }}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </View>
  );
}

function CountryPicker({ visible, selected, colors, onSelect, onClose }) {
  const t = useT();
  const { language } = useAppContext();
  const [query, setQuery] = useState('');

  // Sorted by the name actually on screen. The generated list is in English
  // order, which under Arabic names reads as no order at all — أفغانستان,
  // جزر آلاند, ألبانيا is alphabetical only if you can see the English
  // underneath it.
  const sorted = useMemo(() => {
    const name = (c) => (language === 'ar' ? c.ar : c.en);
    return [...COUNTRIES].sort((a, b) => name(a).localeCompare(name(b), language));
  }, [language]);

  const results = useMemo(() => {
    const q = toEnglishDigits(query).trim().toLowerCase().replace(/^\+/, '');
    if (!q) return sorted;
    return sorted.filter(
      (c) =>
        c.en.toLowerCase().includes(q) ||
        c.ar.includes(query.trim()) ||
        c.calling.startsWith(q) ||
        c.code.toLowerCase() === q
    );
  }, [query, sorted]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
      navigationBarTranslucent
    >
      <View style={[styles.pickerRoot, { backgroundColor: colors.surface }]}>
        <View style={styles.pickerHeader}>
          <Text style={[styles.pickerTitle, { color: colors.heading }]}>
            {t('countryPickerTitle')}
          </Text>
          <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button">
            <Ionicons name="close" size={22} color={colors.textMuted} />
          </Pressable>
        </View>

        <TextInput
          style={[styles.search, { borderColor: colors.inputBorder, color: colors.text }]}
          placeholder={t('countryPickerSearch')}
          placeholderTextColor={colors.placeholderText}
          value={query}
          onChangeText={setQuery}
          autoCorrect={false}
        />

        <FlatList
          data={results}
          keyExtractor={(item) => item.code}
          keyboardShouldPersistTaps="handled"
          // The list is 245 rows of fixed-height items, so telling FlatList
          // the height up front skips measuring every one of them.
          getItemLayout={(_, index) => ({ length: 52, offset: 52 * index, index })}
          initialNumToRender={20}
          renderItem={({ item }) => {
            const isSelected = item.code === selected;
            return (
              <Pressable
                style={[styles.countryRow, isSelected && { backgroundColor: colors.border }]}
                onPress={() => onSelect(item.code)}
              >
                <Text style={styles.flag}>{flagEmoji(item.code)}</Text>
                <Text style={[styles.countryName, { color: colors.text }]} numberOfLines={1}>
                  {language === 'ar' ? item.ar : item.en}
                </Text>
                {/* A leading LRM: '+' is bidi-neutral, so inside an Arabic
                    paragraph it lands after the digits and renders as "93+".
                    The mark pins the whole run left-to-right. */}
                <Text style={[styles.countryCalling, { color: colors.textMuted }]}>
                  {`‎+${item.calling}`}
                </Text>
                {isSelected && <Ionicons name="checkmark" size={18} color={colors.accent} />}
              </Pressable>
            );
          }}
          ListEmptyComponent={
            <Text style={[styles.emptyText, { color: colors.textMuted }]}>
              {t('countryPickerEmpty')}
            </Text>
          }
        />
      </View>
    </Modal>
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
  pickerRoot: {
    flex: 1,
    paddingTop: 48,
    paddingHorizontal: 16,
  },
  pickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  pickerTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  search: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    marginBottom: 12,
  },
  countryRow: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  countryName: {
    flex: 1,
    fontSize: 15,
  },
  countryCalling: {
    fontSize: 14,
    fontWeight: '600',
    writingDirection: 'ltr',
  },
  emptyText: {
    textAlign: 'center',
    marginTop: 24,
    fontSize: 14,
  },
});
