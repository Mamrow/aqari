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
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { useAppContext } from '../context/AppContext';
import { useT } from '../i18n/useT';
import { useThemeColors } from '../theme/useThemeColors';
import Avatar from '../components/Avatar';
import PasswordInput from '../components/PasswordInput';
import { uploadAvatarImage } from '../utils/uploadImage';
import { friendlyErrorMessage } from '../utils/friendlyError';
import appConfig from '../../app.json';
import { BOOST_PURCHASES_ENABLED } from '../config/features';

export default function SettingsScreen({ navigation }) {
  const {
    auth,
    logout,
    deleteAccount,
    language,
    setLanguage,
    theme,
    setTheme,
    requireAuth,
    updateProfile,
    updateAccountPassword,
    isAdmin,
    listings,
    saved,
    getMyId,
    replayOnboarding,
  } = useAppContext();
  const t = useT();
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();

  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [showDeleteAccount, setShowDeleteAccount] = useState(false);
  const [settingPassword, setSettingPassword] = useState(false);
  const [passwordDraft, setPasswordDraft] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);

  const languageOptions = [
    { value: 'ar', label: t('languageArabic') },
    { value: 'en', label: t('languageEnglish') },
  ];

  const themeOptions = [
    { value: 'light', label: t('themeLight') },
    { value: 'dark', label: t('themeDark') },
  ];

  const handleLanguageChange = (lang) => {
    if (lang === language) return;
    Alert.alert(t('languageChangeTitle'), t('languageChangeMessage'), [
      { text: t('cancel'), style: 'cancel' },
      { text: t('continueLabel'), onPress: () => setLanguage(lang) },
    ]);
  };

  const handlePickAvatar = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (result.canceled) return;
    setAvatarUploading(true);
    try {
      const avatarUrl = await uploadAvatarImage(result.assets[0].uri);
      await updateProfile({ avatarUrl });
    } catch (error) {
      console.warn('Avatar upload failed', error);
      Alert.alert(t('submitErrorTitle'), t('submitErrorMessage'));
    } finally {
      setAvatarUploading(false);
    }
  };

  const startEditingName = () => {
    setNameDraft(auth.name ?? '');
    setEditingName(true);
  };

  const handleSaveName = () => {
    const trimmed = nameDraft.trim();
    if (trimmed && trimmed !== auth.name) {
      updateProfile({ name: trimmed });
    }
    setEditingName(false);
  };

  const handleSetPassword = async () => {
    const trimmed = passwordDraft.trim();
    if (trimmed.length < 6) {
      Alert.alert(t('authErrorTitle'), t('authPasswordTooShort'));
      return;
    }
    setSavingPassword(true);
    try {
      await updateAccountPassword(trimmed);
      Alert.alert(t('passwordSetTitle'), t('passwordSetMessage'));
      setSettingPassword(false);
      setPasswordDraft('');
    } catch (error) {
      console.warn('updateAccountPassword error', error);
      Alert.alert(t('authErrorTitle'), friendlyErrorMessage(error, t));
    } finally {
      setSavingPassword(false);
    }
  };

  const handleLogout = () => {
    Alert.alert(t('logoutConfirmTitle'), t('logoutConfirmMessage'), [
      { text: t('cancel'), style: 'cancel' },
      { text: t('logout'), style: 'destructive', onPress: logout },
    ]);
  };

  // A quick, real snapshot of the account's own activity — not shown for
  // admin, whose "listings" would just be everyone's, not a personal stat.
  const myListingsCount = !isAdmin
    ? listings.filter((item) => item.agentId === getMyId()).length
    : 0;
  const savedCount = !isAdmin ? saved.length : 0;

  const handleDeleteAccount = () => {
    Alert.alert(t('deleteAccountConfirmTitle'), t('deleteAccountConfirmMessage'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('deleteAccount'),
        style: 'destructive',
        onPress: async () => {
          setDeletingAccount(true);
          try {
            await deleteAccount();
          } catch (error) {
            console.warn('deleteAccount error', error);
            Alert.alert(t('authErrorTitle'), t('deleteAccountError'));
            setDeletingAccount(false);
          }
        },
      },
    ]);
  };

  if (showDeleteAccount) {
    return (
      <SafeAreaView edges={['top']} style={[styles.container, { backgroundColor: colors.background }]}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <Pressable
            onPress={() => setShowDeleteAccount(false)}
            style={styles.backRow}
            hitSlop={8}
            disabled={deletingAccount}
          >
            <Ionicons name="chevron-back" size={22} color={colors.text} />
            <Text style={[styles.backText, { color: colors.text }]}>{t('back')}</Text>
          </Pressable>

          <Text style={[styles.heading, { color: colors.heading }]}>{t('deleteAccount')}</Text>
          <Text style={[styles.deleteWarning, { color: colors.textMuted }]}>
            {t('deleteAccountConfirmMessage')}
          </Text>

          <Pressable
            style={[styles.card, styles.deleteConfirmButton, { backgroundColor: colors.danger }]}
            onPress={handleDeleteAccount}
            disabled={deletingAccount}
          >
            {deletingAccount ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.deleteConfirmText}>{t('deleteAccount')}</Text>
            )}
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: Math.max(40, insets.bottom + 104) }]}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={[styles.heading, { color: colors.heading }]}>{t('settingsHeading')}</Text>

        <View style={[styles.card, styles.profileCard, { backgroundColor: colors.surface }]}>
          {auth.loggedIn ? (
            <>
              <Pressable onPress={handlePickAvatar} style={styles.avatarWrapper}>
                <Avatar uri={auth.avatarUrl} name={auth.name} size={88} colors={colors} />
                <View style={[styles.editBadge, { backgroundColor: colors.accent, borderColor: colors.surface }]}>
                  {avatarUploading ? (
                    <ActivityIndicator size="small" color={colors.accentText} />
                  ) : (
                    <Ionicons name="camera" size={14} color={colors.accentText} />
                  )}
                </View>
              </Pressable>

              {editingName ? (
                <View style={styles.nameEditRow}>
                  <TextInput
                    style={[styles.nameInput, { borderColor: colors.inputBorder, color: colors.text }]}
                    value={nameDraft}
                    onChangeText={setNameDraft}
                    autoFocus
                    placeholder={t('authNamePlaceholder')}
                    placeholderTextColor={colors.placeholderText}
                  />
                  <Pressable onPress={handleSaveName} hitSlop={8}>
                    <Ionicons name="checkmark-circle" size={26} color={colors.accent} />
                  </Pressable>
                  <Pressable onPress={() => setEditingName(false)} hitSlop={8}>
                    <Ionicons name="close-circle" size={26} color={colors.danger} />
                  </Pressable>
                </View>
              ) : (
                <Pressable onPress={startEditingName} style={styles.nameRow}>
                  <Text style={[styles.name, { color: colors.heading }]}>{auth.name}</Text>
                  <Ionicons name="pencil" size={14} color={colors.textMuted} />
                </Pressable>
              )}

              <Text style={[styles.phone, { color: colors.textMuted }]}>{auth.phone}</Text>
              {isAdmin && (
                <View style={[styles.roleBadge, { backgroundColor: colors.background }]}>
                  <Text style={[styles.roleBadgeText, { color: colors.accent }]}>{t('roleAdmin')}</Text>
                </View>
              )}
              {!isAdmin && (
                <View style={[styles.statsRow, { borderTopColor: colors.border }]}>
                  <View style={styles.statItem}>
                    <Ionicons name="business" size={16} color={colors.accent} />
                    <Text style={[styles.statValue, { color: colors.text }]}>{myListingsCount}</Text>
                    <Text style={[styles.statLabel, { color: colors.textMuted }]}>
                      {t('statListingsLabel')}
                    </Text>
                  </View>
                  <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
                  <View style={styles.statItem}>
                    <Ionicons name="heart" size={16} color={colors.danger} />
                    <Text style={[styles.statValue, { color: colors.text }]}>{savedCount}</Text>
                    <Text style={[styles.statLabel, { color: colors.textMuted }]}>
                      {t('statSavedLabel')}
                    </Text>
                  </View>
                </View>
              )}
            </>
          ) : (
            <>
              <Avatar size={72} colors={colors} />
              <Text style={[styles.signInPrompt, { color: colors.textMuted }]}>
                {t('signInPrompt')}
              </Text>
              <Pressable
                style={[styles.signInButton, { backgroundColor: colors.accent }]}
                onPress={() => requireAuth(() => {})}
              >
                <Text style={[styles.signInButtonText, { color: colors.accentText }]}>
                  {t('signInButton')}
                </Text>
              </Pressable>
            </>
          )}
        </View>

        {auth.loggedIn && !isAdmin && BOOST_PURCHASES_ENABLED && (
          <>
            <SectionHeading icon="receipt-outline" label={t('paymentsLabel')} colors={colors} />
            <View style={[styles.card, { backgroundColor: colors.surface }]}>
              <Pressable
                onPress={() => navigation.navigate('PaymentHistory')}
                style={styles.iconRow}
              >
                <View style={[styles.rowIconCircle, { backgroundColor: `${colors.accent}18` }]}>
                  <Ionicons name="card-outline" size={18} color={colors.accent} />
                </View>
                <View style={styles.rowTextBlock}>
                  <Text style={[styles.subLabel, { color: colors.text }]}>
                    {t('paymentHistoryRow')}
                  </Text>
                  <Text style={[styles.rowSubtitle, { color: colors.textMuted }]}>
                    {t('paymentHistoryRowSubtitle')}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
              </Pressable>
            </View>
          </>
        )}

        {auth.loggedIn && !isAdmin && (
          <>
            <SectionHeading icon="shield-outline" label={t('safetyLabel')} colors={colors} />
            <View style={[styles.card, { backgroundColor: colors.surface }]}>
              <Pressable
                onPress={() => navigation.navigate('BlockedSellers')}
                style={styles.iconRow}
              >
                <View style={[styles.rowIconCircle, { backgroundColor: `${colors.accent}18` }]}>
                  <Ionicons name="person-remove-outline" size={18} color={colors.accent} />
                </View>
                <View style={styles.rowTextBlock}>
                  <Text style={[styles.subLabel, { color: colors.text }]}>
                    {t('blockedSellersRow')}
                  </Text>
                  <Text style={[styles.rowSubtitle, { color: colors.textMuted }]}>
                    {t('blockedSellersRowSubtitle')}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
              </Pressable>
            </View>
          </>
        )}

        <SectionHeading icon="options-outline" label={t('preferencesLabel')} colors={colors} />
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <View style={styles.subLabelRow}>
            <Ionicons name="globe-outline" size={15} color={colors.textMuted} />
            <Text style={[styles.subLabel, { color: colors.textMuted }]}>{t('languageLabel')}</Text>
          </View>
          <View style={styles.chipRow}>
            {languageOptions.map((option) => (
              <Chip
                key={option.value}
                label={option.label}
                active={language === option.value}
                colors={colors}
                onPress={() => handleLanguageChange(option.value)}
              />
            ))}
          </View>

          <View style={[styles.subLabelRow, styles.subLabelSpacing]}>
            <Ionicons
              name={theme === 'dark' ? 'moon-outline' : 'sunny-outline'}
              size={15}
              color={colors.textMuted}
            />
            <Text style={[styles.subLabel, { color: colors.textMuted }]}>{t('themeLabel')}</Text>
          </View>
          <View style={styles.chipRow}>
            {themeOptions.map((option) => (
              <Chip
                key={option.value}
                label={option.label}
                active={theme === option.value}
                colors={colors}
                onPress={() => setTheme(option.value)}
              />
            ))}
          </View>
        </View>

        {auth.loggedIn && (
          <>
            <SectionHeading icon="lock-closed-outline" label={t('securityLabel')} colors={colors} />
            <View style={[styles.card, { backgroundColor: colors.surface }]}>
              {settingPassword ? (
                <View style={styles.nameEditRow}>
                  <PasswordInput
                    style={[styles.nameInput, { borderColor: colors.inputBorder }]}
                    colors={colors}
                    value={passwordDraft}
                    onChangeText={setPasswordDraft}
                    autoFocus
                    placeholder={t('authPasswordPlaceholder')}
                    placeholderTextColor={colors.placeholderText}
                  />
                  {savingPassword ? (
                    <ActivityIndicator size="small" color={colors.accent} />
                  ) : (
                    <Pressable onPress={handleSetPassword} hitSlop={8}>
                      <Ionicons name="checkmark-circle" size={26} color={colors.accent} />
                    </Pressable>
                  )}
                  <Pressable
                    onPress={() => {
                      setSettingPassword(false);
                      setPasswordDraft('');
                    }}
                    hitSlop={8}
                    disabled={savingPassword}
                  >
                    <Ionicons name="close-circle" size={26} color={colors.danger} />
                  </Pressable>
                </View>
              ) : (
                <Pressable onPress={() => setSettingPassword(true)} style={styles.iconRow}>
                  <View style={[styles.rowIconCircle, { backgroundColor: `${colors.accent}18` }]}>
                    <Ionicons name="key-outline" size={18} color={colors.accent} />
                  </View>
                  <View style={styles.rowTextBlock}>
                    <Text style={[styles.subLabel, { color: colors.text }]}>
                      {t('setPasswordRow')}
                    </Text>
                    <Text style={[styles.rowSubtitle, { color: colors.textMuted }]}>
                      {t('setPasswordRowSubtitle')}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                </Pressable>
              )}
            </View>
          </>
        )}

        <SectionHeading icon="shield-checkmark-outline" label={t('legalSupportLabel')} colors={colors} />
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <Pressable
            onPress={() => navigation.navigate('PrivacyPolicy')}
            style={styles.iconRow}
            accessibilityRole="button"
            accessibilityLabel={t('privacyPolicyRow')}
          >
            <View style={[styles.rowIconCircle, { backgroundColor: `${colors.accent}18` }]}>
              <Ionicons name="document-text-outline" size={18} color={colors.accent} />
            </View>
            <View style={styles.rowTextBlock}>
              <Text style={[styles.subLabel, { color: colors.text }]}>
                {t('privacyPolicyRow')}
              </Text>
              <Text style={[styles.rowSubtitle, { color: colors.textMuted }]}>
                {t('privacyPolicyRowSubtitle')}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
          </Pressable>
          <Pressable
            onPress={() => navigation.navigate('TermsOfService')}
            style={[styles.iconRow, styles.rowDivider, { borderTopColor: colors.border }]}
            accessibilityRole="button"
            accessibilityLabel={t('termsOfServiceRow')}
          >
            <View style={[styles.rowIconCircle, { backgroundColor: `${colors.accent}18` }]}>
              <Ionicons name="reader-outline" size={18} color={colors.accent} />
            </View>
            <View style={styles.rowTextBlock}>
              <Text style={[styles.subLabel, { color: colors.text }]}>
                {t('termsOfServiceRow')}
              </Text>
              <Text style={[styles.rowSubtitle, { color: colors.textMuted }]}>
                {t('termsOfServiceRowSubtitle')}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
          </Pressable>
          <Pressable
            onPress={() => navigation.navigate('Support')}
            style={[styles.iconRow, styles.rowDivider, { borderTopColor: colors.border }]}
            accessibilityRole="button"
            accessibilityLabel={t('supportRow')}
          >
            <View style={[styles.rowIconCircle, { backgroundColor: `${colors.accent}18` }]}>
              <Ionicons name="help-circle-outline" size={18} color={colors.accent} />
            </View>
            <View style={styles.rowTextBlock}>
              <Text style={[styles.subLabel, { color: colors.text }]}>
                {t('supportRow')}
              </Text>
              <Text style={[styles.rowSubtitle, { color: colors.textMuted }]}>
                {t('supportRowSubtitle')}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
          </Pressable>
        </View>

        <SectionHeading icon="information-circle-outline" label={t('aboutLabel')} colors={colors} />
        <View style={[styles.card, styles.aboutRow, { backgroundColor: colors.surface }]}>
          <View style={styles.iconRow}>
            <View style={[styles.rowIconCircle, { backgroundColor: `${colors.accent}18` }]}>
              <Ionicons name="home" size={18} color={colors.accent} />
            </View>
            <Text style={[styles.aboutText, { color: colors.text }]}>Aqari</Text>
          </View>
          <Text style={[styles.aboutText, { color: colors.textMuted }]}>
            {t('appVersionLabel')} {appConfig.expo.version}
          </Text>
        </View>

        <SectionHeading icon="help-circle-outline" label={t('helpLabel')} colors={colors} />
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <Pressable onPress={replayOnboarding} style={styles.iconRow}>
            <View style={[styles.rowIconCircle, { backgroundColor: `${colors.accent}18` }]}>
              <Ionicons name="sparkles-outline" size={18} color={colors.accent} />
            </View>
            <View style={styles.rowTextBlock}>
              <Text style={[styles.subLabel, { color: colors.text }]}>{t('howItWorksRow')}</Text>
              <Text style={[styles.rowSubtitle, { color: colors.textMuted }]}>
                {t('howItWorksRowSubtitle')}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
          </Pressable>
        </View>

        {auth.loggedIn && (
          <Pressable
            style={[styles.card, styles.logoutRow, { backgroundColor: colors.surface }]}
            onPress={handleLogout}
          >
            <Ionicons name="log-out-outline" size={18} color={colors.danger} />
            <Text style={[styles.logoutText, { color: colors.danger }]}>{t('logout')}</Text>
          </Pressable>
        )}

        {auth.loggedIn && (
          <Pressable onPress={() => setShowDeleteAccount(true)} style={styles.deleteLinkRow} hitSlop={8}>
            <Text style={[styles.deleteLinkText, { color: colors.textMuted }]}>{t('deleteAccount')}</Text>
          </Pressable>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function SectionHeading({ icon, label, colors }) {
  return (
    <View style={[styles.sectionHeadingRow, styles.sectionSpacing]}>
      <Ionicons name={icon} size={14} color={colors.textMuted} />
      <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>{label}</Text>
    </View>
  );
}

function Chip({ label, active, colors, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.chip,
        { borderColor: colors.accent },
        active && { backgroundColor: colors.accent },
      ]}
    >
      <Text style={[styles.chipText, { color: active ? colors.accentText : colors.accent }]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  heading: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 20,
  },
  card: {
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  profileCard: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  avatarWrapper: {
    position: 'relative',
  },
  editBadge: {
    position: 'absolute',
    bottom: 0,
    end: 0,
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 14,
  },
  name: {
    fontSize: 17,
    fontWeight: '700',
  },
  nameEditRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 14,
    width: '100%',
  },
  nameInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 15,
  },
  phone: {
    fontSize: 13,
    marginTop: 4,
  },
  roleBadge: {
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginTop: 8,
  },
  roleBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'stretch',
    justifyContent: 'center',
    borderTopWidth: 1,
    marginTop: 18,
    paddingTop: 16,
    gap: 20,
  },
  statItem: {
    alignItems: 'center',
    gap: 2,
  },
  statValue: {
    fontSize: 16,
    fontWeight: '700',
    marginTop: 2,
  },
  statLabel: {
    fontSize: 11,
  },
  statDivider: {
    width: 1,
    height: 30,
  },
  signInPrompt: {
    fontSize: 13,
    textAlign: 'center',
    marginTop: 14,
    marginBottom: 14,
  },
  signInButton: {
    borderRadius: 10,
    paddingHorizontal: 24,
    paddingVertical: 10,
  },
  signInButtonText: {
    fontWeight: '700',
    fontSize: 14,
  },
  sectionHeadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginStart: 4,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
  },
  sectionSpacing: {
    marginTop: 20,
  },
  subLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  subLabel: {
    fontSize: 13,
    marginBottom: 8,
  },
  subLabelSpacing: {
    marginTop: 16,
  },
  iconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
  },
  rowIconCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowTextBlock: {
    flex: 1,
    gap: 2,
  },
  rowSubtitle: {
    fontSize: 11,
  },
  chipRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  chipText: {
    fontWeight: '600',
  },
  aboutRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  aboutText: {
    fontSize: 13,
  },
  rowDivider: {
    borderTopWidth: 1,
    marginTop: 3,
    paddingTop: 15,
  },
  logoutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 20,
  },
  logoutText: {
    fontWeight: '600',
    fontSize: 15,
  },
  deleteLinkRow: {
    alignItems: 'center',
    marginTop: 24,
  },
  deleteLinkText: {
    fontSize: 13,
    textDecorationLine: 'underline',
  },
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 20,
  },
  backText: {
    fontSize: 15,
  },
  deleteWarning: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 24,
  },
  deleteConfirmButton: {
    alignItems: 'center',
  },
  deleteConfirmText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
});
