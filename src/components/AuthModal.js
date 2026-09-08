import { useEffect, useRef, useState } from 'react';
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
import { Ionicons } from '@expo/vector-icons';
import { useAppContext } from '../context/AppContext';
import { useT } from '../i18n/useT';
import { useThemeColors } from '../theme/useThemeColors';
import { toEnglishDigits } from '../utils/digits';
import { OTP_CHANNEL } from '../utils/otp';
import PhoneInput, { withLibyaPrefix, isValidLibyanMobile } from './PhoneInput';
import PasswordInput from './PasswordInput';

// Codes are 6 digits everywhere Supabase's phone provider is concerned.
const OTP_LENGTH = 6;
// Long enough that a slow SMS still lands before the button lights up again,
// short enough not to feel punitive when the first message never arrives.
const RESEND_COOLDOWN_SECONDS = 60;

// Three flows, and the two that involve a code have a second screen. Keeping
// them in one enum rather than a pile of booleans is what makes the "which
// fields am I showing" question below answerable at a glance.
const STEPS = {
  SIGN_IN: 'signIn',
  SIGN_UP: 'signUp',
  SIGN_UP_CODE: 'signUpCode',
  RESET_PHONE: 'resetPhone',
  RESET_CODE: 'resetCode',
};

export default function AuthModal() {
  const {
    authModalVisible,
    closeAuthModal,
    signUp,
    verifySignUpOtp,
    signIn,
    sendPasswordResetCode,
    resetPasswordWithOtp,
    language,
  } = useAppContext();
  const isRTL = language === 'ar';
  const t = useT();
  const colors = useThemeColors();

  const [step, setStep] = useState(STEPS.SIGN_IN);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  const onCodeStep = step === STEPS.SIGN_UP_CODE || step === STEPS.RESET_CODE;

  // One interval for the resend countdown, cleared on unmount and whenever it
  // reaches zero — a stray timer here would keep firing setState against an
  // unmounted modal every time the user closed it mid-countdown.
  const cooldownRef = useRef(null);
  useEffect(() => {
    if (cooldown <= 0) return undefined;
    cooldownRef.current = setTimeout(() => setCooldown((n) => n - 1), 1000);
    return () => clearTimeout(cooldownRef.current);
  }, [cooldown]);

  const resetFields = () => {
    setName('');
    setPhone('');
    setPassword('');
    setConfirmPassword('');
    setCode('');
    setCooldown(0);
  };

  const handleClose = () => {
    resetFields();
    setStep(STEPS.SIGN_IN);
    closeAuthModal();
  };

  const goToStep = (next) => {
    setCode('');
    setStep(next);
  };

  // Libyan mobile numbers are exactly 9 digits after +218 — PhoneInput caps
  // typing at 9, this is the matching submit-time floor: a real Libyan mobile
  // shape, not just "9 digits of something."
  const phoneOk = isValidLibyanMobile(phone.trim());
  const passwordOk = password.length >= 6 && confirmPassword === password;
  const codeOk = code.length === OTP_LENGTH;

  const canSubmit = {
    [STEPS.SIGN_IN]: phoneOk && password.length > 0,
    [STEPS.SIGN_UP]: name.trim().length > 0 && phoneOk && passwordOk,
    [STEPS.SIGN_UP_CODE]: codeOk,
    [STEPS.RESET_PHONE]: phoneOk,
    [STEPS.RESET_CODE]: codeOk && passwordOk,
  }[step];

  // Supabase's own error messages are English-only — map the ones a user can
  // actually provoke to localized text, and fall back to the raw message so a
  // misconfiguration is still legible rather than swallowed.
  const friendlyError = (error) => {
    const message = error?.message ?? '';
    if (message.includes('Invalid login credentials')) return t('authErrorInvalidCredentials');
    if (message.includes('already registered') || message.includes('already exists')) {
      return t('authErrorAccountExists');
    }
    // What Supabase returns for signInWithOtp on a number that has no account
    // and shouldCreateUser: false — i.e. "forgot password" for a number that
    // never signed up.
    if (message.includes('Signups not allowed for otp')) return t('authErrorNoAccountForPhone');
    if (message.includes('Phone logins are disabled')) return t('authErrorPhoneAuthDisabled');
    if (message.includes('Token has expired') || message.includes('Invalid token')) {
      return t('authErrorInvalidCode');
    }
    if (message.includes('For security purposes') || message.includes('rate limit')) {
      return t('authErrorRateLimit');
    }
    if (message === 'NO_PROFILE') return t('authErrorNoProfile');
    return message || t('authErrorGeneric');
  };

  const fail = (error) => {
    console.warn('Auth failed', error);
    Alert.alert(t('authErrorTitle'), friendlyError(error));
  };

  const sendResetCode = async () => {
    await sendPasswordResetCode(withLibyaPrefix(phone));
    setCooldown(RESEND_COOLDOWN_SECONDS);
  };

  const handleSubmit = async () => {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    try {
      if (step === STEPS.SIGN_IN) {
        await signIn({ phone: withLibyaPrefix(phone), password });
        resetFields();
      } else if (step === STEPS.SIGN_UP) {
        const { verified } = await signUp({
          name: name.trim(),
          phone: withLibyaPrefix(phone),
          password,
        });
        if (verified) {
          resetFields();
        } else {
          setCooldown(RESEND_COOLDOWN_SECONDS);
          goToStep(STEPS.SIGN_UP_CODE);
        }
      } else if (step === STEPS.SIGN_UP_CODE) {
        await verifySignUpOtp({ phone: withLibyaPrefix(phone), token: code, name: name.trim() });
        resetFields();
      } else if (step === STEPS.RESET_PHONE) {
        await sendResetCode();
        goToStep(STEPS.RESET_CODE);
      } else if (step === STEPS.RESET_CODE) {
        await resetPasswordWithOtp({
          phone: withLibyaPrefix(phone),
          token: code,
          newPassword: password,
        });
        resetFields();
      }
    } catch (error) {
      fail(error);
      // Cleared the instant the error happens rather than on a later focus
      // event — that timing was the old "sometimes clears, sometimes doesn't"
      // flakiness, since it depended on whether the field regained focus.
      if (step === STEPS.SIGN_IN) setPassword('');
      if (onCodeStep) setCode('');
    } finally {
      setSubmitting(false);
    }
  };

  const handleResend = async () => {
    if (cooldown > 0 || submitting) return;
    setSubmitting(true);
    try {
      if (step === STEPS.SIGN_UP_CODE) {
        // Re-running signUp with the same number and password re-sends the
        // code for the still-unconfirmed account rather than creating a
        // second one — Supabase treats it as a resend.
        await signUp({ name: name.trim(), phone: withLibyaPrefix(phone), password });
      } else {
        await sendPasswordResetCode(withLibyaPrefix(phone));
      }
      setCooldown(RESEND_COOLDOWN_SECONDS);
      setCode('');
    } catch (error) {
      fail(error);
    } finally {
      setSubmitting(false);
    }
  };

  const titles = {
    [STEPS.SIGN_IN]: null,
    [STEPS.SIGN_UP]: null,
    [STEPS.SIGN_UP_CODE]: t('authVerifyTitle'),
    [STEPS.RESET_PHONE]: t('forgotPasswordTitle'),
    [STEPS.RESET_CODE]: t('forgotPasswordTitle'),
  };

  const submitLabel = {
    [STEPS.SIGN_IN]: t('authContinue'),
    [STEPS.SIGN_UP]: t('authSendCode'),
    [STEPS.SIGN_UP_CODE]: t('authVerifyButton'),
    [STEPS.RESET_PHONE]: t('authSendCode'),
    [STEPS.RESET_CODE]: t('authSavePassword'),
  }[step];

  const showTabs = step === STEPS.SIGN_IN || step === STEPS.SIGN_UP;

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
            <Pressable
              onPress={handleClose}
              hitSlop={10}
              style={[styles.closeButton, isRTL ? styles.closeButtonRTL : styles.closeButtonLTR]}
              accessibilityRole="button"
              accessibilityLabel={t('close')}
            >
              <Ionicons name="close" size={20} color={colors.textMuted} />
            </Pressable>

            {showTabs && (
              <View style={[styles.tabRow, { borderColor: colors.accent }]}>
                <Tab
                  label={t('signInTab')}
                  active={step === STEPS.SIGN_IN}
                  colors={colors}
                  onPress={() => goToStep(STEPS.SIGN_IN)}
                />
                <Tab
                  label={t('signUpTab')}
                  active={step === STEPS.SIGN_UP}
                  colors={colors}
                  onPress={() => goToStep(STEPS.SIGN_UP)}
                />
              </View>
            )}

            {titles[step] && (
              <Text style={[styles.stepTitle, { color: colors.heading }]}>{titles[step]}</Text>
            )}

            {/* Step 1 of sign-up, sign-in, and the start of a reset all
                collect a phone number; only the code steps don't. */}
            {!onCodeStep && (
              <>
                {step === STEPS.SIGN_UP && (
                  <TextInput
                    style={[
                      styles.input,
                      {
                        borderColor: colors.inputBorder,
                        color: colors.text,
                        textAlign: isRTL ? 'right' : 'left',
                      },
                    ]}
                    placeholder={`${t('authNamePlaceholder')} *`}
                    placeholderTextColor={colors.placeholderText}
                    value={name}
                    onChangeText={setName}
                  />
                )}

                {step === STEPS.RESET_PHONE && (
                  <Text style={[styles.hint, { color: colors.textMuted }]}>
                    {t('authResetHint')}
                  </Text>
                )}

                <PhoneInput
                  value={phone}
                  onChangeText={setPhone}
                  colors={colors}
                  placeholder={`${t('authPhonePlaceholder')} *`}
                />

                {step !== STEPS.RESET_PHONE && (
                  <PasswordInput
                    style={[styles.input, { borderColor: colors.inputBorder }]}
                    colors={colors}
                    placeholder={`${t('authPasswordPlaceholder')} *`}
                    placeholderTextColor={colors.placeholderText}
                    value={password}
                    onChangeText={setPassword}
                  />
                )}

                {step === STEPS.SIGN_UP && (
                  <PasswordInput
                    style={[styles.input, { borderColor: colors.inputBorder }]}
                    colors={colors}
                    placeholder={`${t('authConfirmPasswordPlaceholder')} *`}
                    placeholderTextColor={colors.placeholderText}
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                  />
                )}
              </>
            )}

            {onCodeStep && (
              <>
                <Text style={[styles.hint, { color: colors.textMuted }]}>
                  {t(OTP_CHANNEL === 'whatsapp' ? 'authOtpSentWhatsapp' : 'authOtpSentSms').replace(
                    '{phone}',
                    withLibyaPrefix(phone)
                  )}
                </Text>

                {/* Codes are digits and read left-to-right in both languages,
                    same as the phone field — hence the explicit ltr rather
                    than inheriting the app's RTL mirroring. */}
                <TextInput
                  style={[
                    styles.input,
                    styles.codeInput,
                    { borderColor: colors.inputBorder, color: colors.text },
                  ]}
                  placeholder={t('authOtpPlaceholder')}
                  placeholderTextColor={colors.placeholderText}
                  keyboardType="number-pad"
                  maxLength={OTP_LENGTH}
                  autoComplete="sms-otp"
                  textContentType="oneTimeCode"
                  value={code}
                  onChangeText={(text) =>
                    setCode(toEnglishDigits(text).replace(/[^0-9]/g, '').slice(0, OTP_LENGTH))
                  }
                />

                {step === STEPS.RESET_CODE && (
                  <>
                    <PasswordInput
                      style={[styles.input, { borderColor: colors.inputBorder }]}
                      colors={colors}
                      placeholder={`${t('authNewPasswordPlaceholder')} *`}
                      placeholderTextColor={colors.placeholderText}
                      value={password}
                      onChangeText={setPassword}
                    />
                    <PasswordInput
                      style={[styles.input, { borderColor: colors.inputBorder }]}
                      colors={colors}
                      placeholder={`${t('authConfirmPasswordPlaceholder')} *`}
                      placeholderTextColor={colors.placeholderText}
                      value={confirmPassword}
                      onChangeText={setConfirmPassword}
                    />
                  </>
                )}

                <Pressable
                  onPress={handleResend}
                  disabled={cooldown > 0 || submitting}
                  style={styles.resendRow}
                  hitSlop={8}
                >
                  <Text
                    style={[
                      styles.linkText,
                      { color: cooldown > 0 ? colors.textMuted : colors.accent },
                    ]}
                  >
                    {cooldown > 0
                      ? t('authResendIn').replace('{seconds}', String(cooldown))
                      : t('authResendCode')}
                  </Text>
                </Pressable>
              </>
            )}

            {step === STEPS.SIGN_IN && (
              <Pressable onPress={() => goToStep(STEPS.RESET_PHONE)} style={styles.forgotRow} hitSlop={8}>
                <Text style={[styles.linkText, { color: colors.accent }]}>
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
                <Text style={[styles.submitText, { color: colors.accentText }]}>{submitLabel}</Text>
              )}
            </Pressable>

            {/* Anything past the first screen gets a way back that doesn't
                mean "close the modal and lose what I typed". */}
            <Pressable onPress={() => (showTabs ? handleClose() : goToStep(STEPS.SIGN_IN))}>
              <Text style={[styles.cancelText, { color: colors.danger }]}>
                {showTabs ? t('authCancel') : t('authBack')}
              </Text>
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
    // Extra headroom above the tab row specifically, so the close button
    // (position:absolute, ignores this padding) has its own clear strip
    // above it instead of sitting on top of the Sign In/Sign Up tabs.
    paddingTop: 48,
  },
  // isRTL branches explicitly to a literal left/right — no "end", no
  // relying on the app-wide native RTL auto-mirror. A Modal mounts its
  // content into a separate native root, which doesn't reliably inherit
  // either of those, so this is the one spot on the screen that has to
  // pick its own side.
  closeButton: {
    position: 'absolute',
    top: 14,
    zIndex: 1,
    padding: 4,
  },
  closeButtonLTR: {
    right: 14,
  },
  closeButtonRTL: {
    left: 14,
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
  stepTitle: {
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 8,
  },
  hint: {
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    marginBottom: 16,
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
    fontSize: 22,
    letterSpacing: 6,
    fontWeight: '700',
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
  resendRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 12,
    marginTop: -2,
  },
  linkText: {
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
