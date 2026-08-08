import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppContext } from '../context/AppContext';
import { useT } from '../i18n/useT';
import { useThemeColors } from '../theme/useThemeColors';
import { friendlyErrorMessage } from '../utils/friendlyError';

// Shown instead of the normal navigator whenever AppContext.isPasswordRecovery
// is true — i.e. the user tapped a "reset password" link from their email and
// the app caught the resulting deep link (see App.js / AppContext.handleAuthDeepLink).
export default function ResetPasswordScreen() {
  const { updatePasswordAfterReset } = useAppContext();
  const t = useT();
  const colors = useThemeColors();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = password.length >= 6 && confirmPassword === password;

  const handleSubmit = async () => {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    try {
      await updatePasswordAfterReset(password);
    } catch (error) {
      console.warn('Password reset failed', error);
      Alert.alert(t('authErrorTitle'), friendlyErrorMessage(error, t));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView edges={['top']} style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.content}>
        <Text style={[styles.title, { color: colors.heading }]}>{t('forgotPasswordTitle')}</Text>
        <Text style={[styles.subtitle, { color: colors.textMuted }]}>
          {t('resetPasswordSubtitle')}
        </Text>

        <TextInput
          style={[styles.input, { borderColor: colors.inputBorder, color: colors.text }]}
          placeholder={t('authPasswordPlaceholder')}
          placeholderTextColor={colors.placeholderText}
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />
        <TextInput
          style={[styles.input, { borderColor: colors.inputBorder, color: colors.text }]}
          placeholder={t('authConfirmPasswordPlaceholder')}
          placeholderTextColor={colors.placeholderText}
          secureTextEntry
          value={confirmPassword}
          onChangeText={setConfirmPassword}
        />

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
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 13,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 24,
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    marginBottom: 12,
  },
  submitButton: {
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  submitText: {
    fontWeight: '700',
    fontSize: 15,
  },
});
