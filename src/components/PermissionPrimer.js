import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppContext } from '../context/AppContext';
import { useT } from '../i18n/useT';
import { useThemeColors } from '../theme/useThemeColors';
import { pressedStyle } from '../theme/press';

// Asks in the app's own words before the operating system asks in its.
//
// Android's permission dialog is system copy — there is no API to put a
// sentence of your own in it, unlike iOS where the string comes from
// Info.plist (see the locales files in assets/). So on Android the only
// place to explain *why* is before the dialog opens, and the cost of not
// explaining is permanent: two refusals and Android stops asking at all,
// with no way back except the system settings screen. Asking cold, the
// instant a screen mounts, is the version of this that loses the permission
// for good.
//
// Deliberately not a system Alert: an Alert on Android is the same shape as
// the permission dialog that follows it, which reads as being asked twice.
export default function PermissionPrimer({
  visible,
  icon,
  title,
  message,
  confirmLabel,
  onConfirm,
  onDismiss,
}) {
  const { language } = useAppContext();
  const t = useT();
  const colors = useThemeColors();
  const rtlText = { textAlign: language === 'ar' ? 'right' : 'left' };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      // Android's hardware back has to be able to dismiss this, or it's a
      // trap — same rule as every other modal in the app.
      onRequestClose={onDismiss}
      statusBarTranslucent
      navigationBarTranslucent
    >
      <Pressable style={[styles.backdrop, { backgroundColor: colors.backdrop }]} onPress={onDismiss}>
        <Pressable style={[styles.card, { backgroundColor: colors.surface }]} onPress={() => {}}>
          <View style={[styles.iconCircle, { backgroundColor: `${colors.accent}22` }]}>
            <Ionicons name={icon} size={26} color={colors.accent} />
          </View>

          <Text style={[styles.title, rtlText, { color: colors.text }]}>{title}</Text>
          <Text style={[styles.message, rtlText, { color: colors.textMuted }]}>{message}</Text>

          <Pressable
            style={({ pressed }) => [
              styles.confirmButton,
              { backgroundColor: colors.accent },
              pressed && pressedStyle,
            ]}
            onPress={onConfirm}
            accessibilityRole="button"
          >
            <Text style={[styles.confirmText, { color: colors.accentText }]}>{confirmLabel}</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.dismissButton, pressed && pressedStyle]}
            onPress={onDismiss}
            accessibilityRole="button"
          >
            <Text style={[styles.dismissText, { color: colors.textMuted }]}>{t('notNowButton')}</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 16,
    padding: 22,
    alignItems: 'center',
  },
  iconCircle: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
    alignSelf: 'stretch',
  },
  message: {
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 18,
    alignSelf: 'stretch',
  },
  confirmButton: {
    alignSelf: 'stretch',
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
  },
  confirmText: {
    fontSize: 15,
    fontWeight: '700',
  },
  dismissButton: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginTop: 4,
  },
  dismissText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
