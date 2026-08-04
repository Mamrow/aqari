import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useAppContext } from '../context/AppContext';
import { useT } from '../i18n/useT';
import { useThemeColors } from '../theme/useThemeColors';
import PhoneInput, { withLibyaPrefix } from './PhoneInput';

export default function AuthModal() {
  const { authModalVisible, closeAuthModal, signUp, signIn, sendPasswordReset } = useAppContext();
  const t = useT();
  const colors = useThemeColors();

  const [mode, setMode] = useState('signIn'); // 'signIn' | 'signUp'
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  // Set right after a failed sign-in/sign-up so the next tap into the
  // password field wipes it — the user shouldn't have to manually delete a
  // password they already know was wrong before retyping.
  const [passwordHadError, setPasswordHadError] = useState(false);

  const resetFields = () => {
    setName('');
    setPhone('');
    setEmail('');
    setPassword('');
    setConfirmPassword('');
    setPasswordHadError(false);
  };

  const handleClose = () => {
    resetFields();
    setMode('signIn');
    closeAuthModal();
  };

  const canSubmit =
    mode === 'signIn'
      ? phone.trim().length > 0 && password.length > 0
      : name.trim().length > 0 &&
        phone.trim().length > 0 &&
        email.trim().length > 0 &&
        password.length >= 6 &&
        confirmPassword === password;

  // Supabase's own error messages are English-only — map the common ones to
  // localized text, falling back to the raw message for anything else.
  const friendlyError = (error) => {
    const message = error?.message ?? '';
    if (message.includes('Invalid login credentials')) return t('authErrorInvalidCredentials');
    if (message.includes('already registered') || message.includes('already exists')) {
      return t('authErrorAccountExists');
    }
    if (message === 'NO_ACCOUNT') return t('authErrorNoAccountForPhone');
    if (message === 'NO_PROFILE') return t('authErrorNoProfile');
    if (message === 'CONFIRM_EMAIL_ENABLED') return t('authErrorConfirmEmailEnabled');
    return message || t('authErrorGeneric');
  };

  const handleSubmit = async () => {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    try {
      if (mode === 'signIn') {
        await signIn({ phone: withLibyaPrefix(phone), password });
      } else {
        await signUp({
          name: name.trim(),
          phone: withLibyaPrefix(phone),
          email: email.trim(),
          password,
        });
      }
      resetFields();
    } catch (error) {
      console.warn('Auth failed', error);
      Alert.alert(t('authErrorTitle'), friendlyError(error));
      setPasswordHadError(true);
    } finally {
      setSubmitting(false);
    }
  };

  const handleForgotPassword = () => {
    if (!phone.trim()) {
      Alert.alert(t('authErrorTitle'), t('authEnterPhoneFirst'));
      return;
    }
    Alert.alert(t('forgotPasswordTitle'), t('forgotPasswordConfirmMessage'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('continueLabel'),
        onPress: async () => {
          try {
            await sendPasswordReset(withLibyaPrefix(phone));
            Alert.alert(t('resetEmailSentTitle'), t('resetEmailSentMessage'));
          } catch (error) {
            Alert.alert(t('authErrorTitle'), friendlyError(error));
          }
        },
      },
    ]);
  };

  return (
    <Modal
      visible={authModalVisible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
      statusBarTranslucent
      navigationBarTranslucent
    >
      <Pressable style={[styles.backdrop, { backgroundColor: colors.backdrop }]} onPress={handleClose}>
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          {/* Swallows the tap so it doesn't bubble up to the backdrop's
              onPress above — tapping inside the card must not close it. */}
          <Pressable style={[styles.card, { backgroundColor: colors.surface }]} onPress={() => {}}>
            <View style={[styles.tabRow, { borderColor: colors.accent }]}>
              <Tab
                label={t('signInTab')}
                active={mode === 'signIn'}
                colors={colors}
                onPress={() => setMode('signIn')}
              />
              <Tab
                label={t('signUpTab')}
                active={mode === 'signUp'}
                colors={colors}
                onPress={() => setMode('signUp')}
              />
            </View>

            {mode === 'signUp' && (
              <TextInput
                style={[styles.input, { borderColor: colors.inputBorder, color: colors.text }]}
                placeholder={t('authNamePlaceholder')}
                placeholderTextColor={colors.placeholderText}
                value={name}
                onChangeText={setName}
              />
            )}

            <PhoneInput
              value={phone}
              onChangeText={setPhone}
              colors={colors}
              placeholder={t('authPhonePlaceholder')}
            />

            {mode === 'signUp' && (
              <TextInput
                style={[styles.input, { borderColor: colors.inputBorder, color: colors.text }]}
                placeholder={t('authEmailPlaceholder')}
                placeholderTextColor={colors.placeholderText}
                keyboardType="email-address"
                autoCapitalize="none"
                value={email}
                onChangeText={setEmail}
              />
            )}

            <TextInput
              style={[styles.input, { borderColor: colors.inputBorder, color: colors.text }]}
              placeholder={t('authPasswordPlaceholder')}
              placeholderTextColor={colors.placeholderText}
              secureTextEntry
              value={password}
              onChangeText={setPassword}
              onFocus={() => {
                if (passwordHadError) {
                  setPassword('');
                  setPasswordHadError(false);
                }
              }}
            />

            {mode === 'signUp' && (
              <TextInput
                style={[styles.input, { borderColor: colors.inputBorder, color: colors.text }]}
                placeholder={t('authConfirmPasswordPlaceholder')}
                placeholderTextColor={colors.placeholderText}
                secureTextEntry
                value={confirmPassword}
                onChangeText={setConfirmPassword}
              />
            )}

            {mode === 'signIn' && (
              <Pressable onPress={handleForgotPassword} style={styles.forgotRow} hitSlop={8}>
                <Text style={[styles.forgotText, { color: colors.accent }]}>
                  {t('forgotPasswordLink')}
                </Text>
              </Pressable>
            )}

            <Pressable
              style={[
                styles.submitButton,
                { backgroundColor: canSubmit ? colors.accent : colors.disabled },
              ]}
              onPress={handleSubmit}
              disabled={!canSubmit || submitting}
            >
              {submitting ? (
                <ActivityIndicator color={colors.accentText} />
              ) : (
                <Text style={[styles.submitText, { color: colors.accentText }]}>
                  {t('authContinue')}
                </Text>
              )}
            </Pressable>

            <Pressable onPress={handleClose}>
              <Text style={[styles.cancelText, { color: colors.danger }]}>{t('authCancel')}</Text>
            </Pressable>
          </Pressable>
        </ScrollView>
      </Pressable>
    </Modal>
  );
}

function Tab({ label, active, colors, onPress }) {
  return (
    <Pressable style={[styles.tab, active && { backgroundColor: colors.accent }]} onPress={onPress}>
      <Text style={[styles.tabText, { color: active ? colors.accentText : colors.accent }]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    borderRadius: 16,
    padding: 24,
  },
  tabRow: {
    flexDirection: 'row',
    borderRadius: 10,
    borderWidth: 1,
    padding: 3,
    marginBottom: 16,
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 8,
  },
  tabText: {
    fontWeight: '700',
    fontSize: 14,
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    marginBottom: 12,
  },
  forgotRow: {
    // flexDirection:row + justifyContent (not alignItems/alignSelf) is the
    // RTL-safe way to push content to the trailing edge in this codebase —
    // alignItems:'flex-end' is always physical-right, never flips for Arabic.
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginBottom: 12,
    marginTop: -4,
  },
  forgotText: {
    fontSize: 13,
    fontWeight: '600',
  },
  submitButton: {
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 12,
  },
  submitText: {
    fontWeight: '700',
    fontSize: 15,
  },
  cancelText: {
    textAlign: 'center',
    fontWeight: '600',
  },
});
