import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppContext } from '../context/AppContext';
import { useT } from '../i18n/useT';
import { useThemeColors } from '../theme/useThemeColors';
import { friendlyErrorMessage } from '../utils/friendlyError';
import { reportError } from '../lib/crashReporting';
import PhoneInput, { fromE164, isValidPhone, toE164 } from '../components/PhoneInput';
import PasswordInput from '../components/PasswordInput';

const OTP_LENGTH = 6;

/**
 * Everything about the account in one place, instead of three inline editors
 * scattered down the settings list.
 *
 * Each section saves on its own. They're genuinely independent operations —
 * a name is a row update, a password is an auth call, a number is an auth
 * call plus a verification step — and one "Save" button implying they commit
 * together would be a lie the moment one of them failed.
 */
export default function PersonalInfoScreen() {
  const { auth, updateProfile, updateAccountPassword, changePhoneNumber, verifyPhoneChange } =
    useAppContext();
  const t = useT();
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();

  const [name, setName] = useState(auth.name ?? '');
  const [email, setEmail] = useState(auth.email ?? '');
  const [savingProfile, setSavingProfile] = useState(false);

  const seeded = fromE164(auth.phone);
  const [phone, setPhone] = useState(seeded.national);
  const [country, setCountry] = useState(seeded.country);
  const [phoneCode, setPhoneCode] = useState('');
  const [awaitingPhoneCode, setAwaitingPhoneCode] = useState(false);
  const [savingPhone, setSavingPhone] = useState(false);

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);

  // Only once something's been typed in the confirm box — warning against an
  // empty field is nagging, not help.
  const passwordMismatch = confirmPassword.length > 0 && confirmPassword !== password;

  const nextPhone = toE164(country, phone);
  const phoneChanged = nextPhone !== auth.phone;
  const profileChanged = name.trim() !== (auth.name ?? '') || email.trim() !== (auth.email ?? '');

  const fail = (error) => {
    console.warn('Personal info save failed', error);
    // The user gets a friendly sentence; the actual Postgres/Supabase error
    // goes where it can be read later. Without this a save failure in a
    // release build leaves no trace anywhere.
    reportError(error, { screen: 'PersonalInfo' });
    Alert.alert(t('authErrorTitle'), friendlyErrorMessage(error, t));
  };

  const handleSaveProfile = async () => {
    if (!name.trim()) {
      Alert.alert(t('authErrorTitle'), t('personalInfoNameRequired'));
      return;
    }
    setSavingProfile(true);
    try {
      await updateProfile({ name: name.trim(), email });
      Alert.alert(t('personalInfoSavedTitle'), t('personalInfoSavedMessage'));
    } catch (error) {
      fail(error);
    } finally {
      setSavingProfile(false);
    }
  };

  const handleSavePhone = async () => {
    if (!isValidPhone(country, phone.trim())) {
      Alert.alert(t('authErrorTitle'), t('invalidPhoneNumber'));
      return;
    }
    setSavingPhone(true);
    try {
      const { needsVerification } = await changePhoneNumber(nextPhone);
      if (needsVerification) {
        setAwaitingPhoneCode(true);
      } else {
        Alert.alert(t('personalInfoSavedTitle'), t('personalInfoPhoneChanged'));
      }
    } catch (error) {
      fail(error);
    } finally {
      setSavingPhone(false);
    }
  };

  const handleVerifyPhone = async () => {
    setSavingPhone(true);
    try {
      await verifyPhoneChange({ phone: nextPhone, token: phoneCode });
      setAwaitingPhoneCode(false);
      setPhoneCode('');
      Alert.alert(t('personalInfoSavedTitle'), t('personalInfoPhoneChanged'));
    } catch (error) {
      fail(error);
    } finally {
      setSavingPhone(false);
    }
  };

  const handleSavePassword = async () => {
    if (password.length < 6) {
      Alert.alert(t('authErrorTitle'), t('authPasswordTooShort'));
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert(t('authErrorTitle'), t('personalInfoPasswordMismatch'));
      return;
    }
    setSavingPassword(true);
    try {
      await updateAccountPassword(password);
      setPassword('');
      setConfirmPassword('');
      Alert.alert(t('passwordSetTitle'), t('passwordSetMessage'));
    } catch (error) {
      fail(error);
    } finally {
      setSavingPassword(false);
    }
  };

  return (
    <SafeAreaView edges={['bottom']} style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: Math.max(40, insets.bottom + 104) }]}
        keyboardShouldPersistTaps="handled"
      >
        {/* --- name + email --- */}
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <FieldLabel colors={colors}>{t('authNamePlaceholder')}</FieldLabel>
          <TextInput
            style={[styles.input, { borderColor: colors.inputBorder, color: colors.text }]}
            value={name}
            onChangeText={setName}
            placeholder={t('authNamePlaceholder')}
            placeholderTextColor={colors.placeholderText}
          />

          <FieldLabel colors={colors}>{t('personalInfoEmailLabel')}</FieldLabel>
          <TextInput
            style={[styles.input, { borderColor: colors.inputBorder, color: colors.text }]}
            value={email}
            onChangeText={setEmail}
            placeholder={t('personalInfoEmailPlaceholder')}
            placeholderTextColor={colors.placeholderText}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            // Phone numbers read left-to-right in both languages; so do
            // email addresses.
            textAlign="left"
          />
          <Text style={[styles.hint, { color: colors.textMuted }]}>
            {t('personalInfoEmailHint')}
          </Text>

          <SaveButton
            label={t('save')}
            onPress={handleSaveProfile}
            disabled={!profileChanged}
            busy={savingProfile}
            colors={colors}
          />
        </View>

        {/* --- phone --- */}
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <FieldLabel colors={colors}>{t('authPhonePlaceholder')}</FieldLabel>
          <PhoneInput
            value={phone}
            onChangeText={setPhone}
            country={country}
            onChangeCountry={setCountry}
            colors={colors}
            placeholder={t('authPhonePlaceholder')}
          />
          <Text style={[styles.hint, { color: colors.textMuted }]}>
            {t('personalInfoPhoneHint')}
          </Text>

          {awaitingPhoneCode ? (
            <>
              <FieldLabel colors={colors}>{t('authOtpPlaceholder')}</FieldLabel>
              <TextInput
                style={[
                  styles.input,
                  styles.codeInput,
                  { borderColor: colors.inputBorder, color: colors.text },
                ]}
                value={phoneCode}
                onChangeText={(text) => setPhoneCode(text.replace(/[^0-9]/g, '').slice(0, OTP_LENGTH))}
                keyboardType="number-pad"
                maxLength={OTP_LENGTH}
                autoComplete="sms-otp"
                textContentType="oneTimeCode"
                placeholder={t('authOtpPlaceholder')}
                placeholderTextColor={colors.placeholderText}
              />
              <SaveButton
                label={t('authVerifyButton')}
                onPress={handleVerifyPhone}
                disabled={phoneCode.length !== OTP_LENGTH}
                busy={savingPhone}
                colors={colors}
              />
            </>
          ) : (
            <SaveButton
              label={t('personalInfoChangePhone')}
              onPress={handleSavePhone}
              disabled={!phoneChanged}
              busy={savingPhone}
              colors={colors}
            />
          )}
        </View>

        {/* --- password --- */}
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <FieldLabel colors={colors}>{t('personalInfoNewPassword')}</FieldLabel>
          <PasswordInput
            style={[styles.input, { borderColor: colors.inputBorder }]}
            colors={colors}
            value={password}
            onChangeText={setPassword}
            placeholder={t('authNewPasswordPlaceholder')}
            placeholderTextColor={colors.placeholderText}
          />
          <PasswordInput
            style={[
              styles.input,
              { borderColor: passwordMismatch ? colors.danger : colors.inputBorder },
            ]}
            colors={colors}
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            placeholder={t('authConfirmPasswordPlaceholder')}
            placeholderTextColor={colors.placeholderText}
          />
          {passwordMismatch && (
            <Text style={[styles.mismatchText, { color: colors.danger }]}>
              {t('passwordsDoNotMatch')}
            </Text>
          )}
          <SaveButton
            label={t('authSavePassword')}
            onPress={handleSavePassword}
            disabled={password.length === 0 || passwordMismatch}
            busy={savingPassword}
            colors={colors}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function FieldLabel({ children, colors }) {
  return <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>{children}</Text>;
}

function SaveButton({ label, onPress, disabled, busy, colors }) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.saveButton,
        { backgroundColor: disabled ? colors.disabled : colors.accent },
        pressed && !disabled && { opacity: 0.8 },
      ]}
      onPress={onPress}
      disabled={disabled || busy}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      {busy ? (
        <ActivityIndicator size="small" color={colors.accentText} />
      ) : (
        <Text style={[styles.saveButtonText, { color: colors.accentText }]}>{label}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 20,
  },
  card: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 18,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 6,
    alignSelf: 'flex-start',
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    marginBottom: 12,
  },
  codeInput: {
    textAlign: 'center',
    writingDirection: 'ltr',
    fontSize: 20,
    letterSpacing: 6,
    fontWeight: '700',
  },
  mismatchText: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: -6,
    marginBottom: 12,
    alignSelf: 'flex-start',
  },
  hint: {
    fontSize: 12.5,
    lineHeight: 18,
    marginBottom: 12,
    alignSelf: 'flex-start',
  },
  saveButton: {
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  saveButtonText: {
    fontWeight: '700',
    fontSize: 15,
  },
});
