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
    themePreference,
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
  // Explicit, not textAlign:'auto'. 'auto' is supposed to align from the
  // text's own direction and does on Android — on iOS it resolves to left for
  // Arabic, which left every label stranded away from its icon. The ternary is
  // what the filter modals in HomeMapScreen already use, and those render
  // correctly on both platforms.
  const isRTL = language === 'ar';
  const textAlign = isRTL ? 'right' : 'left';

  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [showDeleteAccount, setShowDeleteAccount] = useState(false);
  const [settingPassword, setSettingPassword] = useState(false);
  const [passwordDraft, setPasswordDraft] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);
  // Language and theme used to sit permanently open, which pushed everything
  // below them off the first screen. They're one row that opens now, so the
  // list reads as a list.
  const [displayOpen, setDisplayOpen] = useState(false);

  const languageOptions = [
    { value: 'ar', label: t('languageArabic') },
    { value: 'en', label: t('languageEnglish') },
  ];

  const themeOptions = [
    { value: 'system', label: t('themeSystem') },
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

  // The in-app rating prompt rather than a link to a store page: the app
  // isn't published yet, so any store URL would 404 today, and Apple prefers
  // the native prompt anyway. Required lazily and guarded because it's a
  // native module — a client built before it was added would otherwise throw
  // at import time and take the whole screen down.
  const handleRateUs = async () => {
    try {
      const StoreReview = require('expo-store-review');
      if (await StoreReview.hasAction()) {
        await StoreReview.requestReview();
        return;
      }
    } catch (error) {
      console.warn('Store review unavailable', error);
    }
    Alert.alert(t('rateUsRow'), t('rateUsUnavailable'));
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
        {/* Identity first, the way a profile tab reads elsewhere: who you're
            signed in as, then what you've got, then the settings themselves.
            The old screen opened with a "Settings" title and a large card,
            which pushed the account's own name below the fold. */}
        <View style={styles.profileHeader}>
          <Pressable
            onPress={auth.loggedIn ? handlePickAvatar : () => requireAuth(() => {})}
            style={styles.avatarWrapper}
          >
            <Avatar uri={auth.avatarUrl} name={auth.name} size={64} colors={colors} />
            {auth.loggedIn && (
              <View
                style={[styles.editBadge, { backgroundColor: colors.accent, borderColor: colors.background }]}
              >
                {avatarUploading ? (
                  <ActivityIndicator size="small" color={colors.accentText} />
                ) : (
                  <Ionicons name="camera" size={12} color={colors.accentText} />
                )}
              </View>
            )}
          </Pressable>

          <View style={styles.profileText}>
            {auth.loggedIn ? (
              <>
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
                  <Pressable onPress={startEditingName} style={styles.nameRow} hitSlop={6}>
                    <Text style={[styles.name, { color: colors.heading, textAlign }]} numberOfLines={1}>
                      {auth.name}
                    </Text>
                    <Ionicons name="pencil" size={13} color={colors.textMuted} />
                  </Pressable>
                )}
                {/* Phone numbers read left-to-right in both languages. */}
                <Text style={[styles.phone, { color: colors.textMuted, textAlign }]}>{auth.phone}</Text>
                {isAdmin && (
                  <View style={[styles.roleBadge, { backgroundColor: colors.surface }]}>
                    <Text style={[styles.roleBadgeText, { color: colors.accent }]}>{t('roleAdmin')}</Text>
                  </View>
                )}
              </>
            ) : (
              <>
                <Text style={[styles.name, { color: colors.heading, textAlign }]}>{t('settingsHeading')}</Text>
                <Text style={[styles.phone, { color: colors.textMuted, textAlign }]}>{t('signInPrompt')}</Text>
              </>
            )}
          </View>
        </View>

        {!auth.loggedIn && (
          <Pressable
            style={({ pressed }) => [
              styles.signInButton,
              { backgroundColor: colors.accent, opacity: pressed ? 0.8 : 1 },
            ]}
            onPress={() => requireAuth(() => {})}
          >
            <Text style={[styles.signInButtonText, { color: colors.accentText }]}>
              {t('signInButton')}
            </Text>
          </Pressable>
        )}

        {auth.loggedIn && !isAdmin && (
          <View style={styles.tileRow}>
            <StatTile
              icon="heart"
              tint={colors.danger}
              count={savedCount}
              label={t('statSavedLabel')}
              colors={colors}
              onPress={() => navigation.navigate('Favorites')}
            />
            <StatTile
              icon="business"
              tint={colors.accent}
              count={myListingsCount}
              label={t('statListingsLabel')}
              colors={colors}
              onPress={() => navigation.navigate('MyListings')}
            />
          </View>
        )}

        <SectionHeading textAlign={textAlign} label={t('accountSettingsLabel')} colors={colors} />
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {auth.loggedIn && (
            <Row
              textAlign={textAlign}
              icon="person-circle-outline"
              label={t('personalInfoRow')}
              subtitle={t('personalInfoRowSubtitle')}
              colors={colors}
              onPress={startEditingName}
            />
          )}

          <Row
            textAlign={textAlign}
            icon="settings-outline"
            label={t('languageDisplayRow')}
            subtitle={displayOpen ? undefined : `${languageOptions.find((o) => o.value === language)?.label}`}
            colors={colors}
            divider={auth.loggedIn}
            chevron={displayOpen ? 'chevron-up' : 'chevron-down'}
            onPress={() => setDisplayOpen((open) => !open)}
          />
          {displayOpen && (
            <View style={styles.expanded}>
              <Text style={[styles.subLabel, { color: colors.textMuted, textAlign }]}>{t('languageLabel')}</Text>
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

              <Text style={[styles.subLabel, styles.subLabelSpacing, { color: colors.textMuted, textAlign }]}>
                {t('themeLabel')}
              </Text>
              <View style={styles.chipRow}>
                {themeOptions.map((option) => (
                  <Chip
                    key={option.value}
                    label={option.label}
                    active={themePreference === option.value}
                    colors={colors}
                    onPress={() => setTheme(option.value)}
                  />
                ))}
              </View>
            </View>
          )}

          {auth.loggedIn &&
            (settingPassword ? (
              <View style={[styles.expanded, styles.rowDivider, { borderTopColor: colors.border }]}>
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
              </View>
            ) : (
              <Row
                icon="key-outline"
                label={t('setPasswordRow')}
                subtitle={t('setPasswordRowSubtitle')}
                colors={colors}
                divider
                onPress={() => setSettingPassword(true)}
              />
            ))}

          {auth.loggedIn && !isAdmin && (
            <Row
              textAlign={textAlign}
              icon="person-remove-outline"
              label={t('blockedSellersRow')}
              subtitle={t('blockedSellersRowSubtitle')}
              colors={colors}
              divider
              onPress={() => navigation.navigate('BlockedSellers')}
            />
          )}

          {auth.loggedIn && !isAdmin && BOOST_PURCHASES_ENABLED && (
            <Row
              textAlign={textAlign}
              icon="card-outline"
              label={t('paymentHistoryRow')}
              subtitle={t('paymentHistoryRowSubtitle')}
              colors={colors}
              divider
              onPress={() => navigation.navigate('PaymentHistory')}
            />
          )}
        </View>

        <SectionHeading textAlign={textAlign} label={t('aboutAqariLabel')} colors={colors} />
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Row
            textAlign={textAlign}
            icon="create-outline"
            label={t('feedbackRow')}
            colors={colors}
            onPress={() => navigation.navigate('Support')}
          />
          <Row
            textAlign={textAlign}
            icon="reader-outline"
            label={t('termsOfServiceRow')}
            colors={colors}
            divider
            onPress={() => navigation.navigate('TermsOfService')}
          />
          <Row
            textAlign={textAlign}
            icon="document-text-outline"
            label={t('privacyPolicyRow')}
            colors={colors}
            divider
            onPress={() => navigation.navigate('PrivacyPolicy')}
          />
          <Row
            textAlign={textAlign}
            icon="sparkles-outline"
            label={t('howItWorksRow')}
            colors={colors}
            divider
            onPress={replayOnboarding}
          />
          <Row
            textAlign={textAlign}
            icon="information-circle-outline"
            label={t('aboutAppRow')}
            colors={colors}
            divider
            value={`${t('appVersionLabel')} ${appConfig.expo.version}`}
            chevron={null}
          />
          <Row
            textAlign={textAlign}
            icon="star-outline"
            label={t('rateUsRow')}
            colors={colors}
            divider
            onPress={handleRateUs}
          />
        </View>

        {auth.loggedIn && (
          <Pressable
            style={({ pressed }) => [styles.logoutRow, pressed && { opacity: 0.6 }]}
            onPress={handleLogout}
          >
            <Ionicons name="log-out-outline" size={20} color={colors.danger} />
            <Text style={[styles.logoutText, { color: colors.danger }]}>{t('logout')}</Text>
          </Pressable>
        )}

        {auth.loggedIn && (
          <Pressable
            onPress={() => setShowDeleteAccount(true)}
            style={({ pressed }) => [styles.deleteLinkRow, pressed && { opacity: 0.6 }]}
            hitSlop={8}
          >
            <Text style={[styles.deleteLinkText, { color: colors.textMuted }]}>{t('deleteAccount')}</Text>
          </Pressable>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

/**
 * One settings row: icon, label, optional subtitle, and either a value or a
 * chevron on the trailing side.
 *
 * textAlign:'auto' throughout rather than a physical left/right — the label
 * then follows the direction of its own text, which is the one behaviour both
 * platforms agree on. Hardcoding 'left' left Arabic labels stranded away from
 * their icon on iOS.
 */
function Row({ icon, label, subtitle, value, colors, textAlign, onPress, divider, chevron = 'chevron-forward' }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.iconRow,
        divider && [styles.rowDivider, { borderTopColor: colors.border }],
        pressed && onPress && styles.iconRowPressed,
      ]}
    >
      <View style={[styles.rowIconCircle, { backgroundColor: `${colors.accent}18` }]}>
        <Ionicons name={icon} size={18} color={colors.accent} />
      </View>
      <View style={styles.rowTextBlock}>
        <Text style={[styles.rowLabel, { color: colors.text, textAlign }]}>{label}</Text>
        {subtitle ? (
          <Text style={[styles.rowSubtitle, { color: colors.textMuted, textAlign }]}>{subtitle}</Text>
        ) : null}
      </View>
      {value ? <Text style={[styles.rowValue, { color: colors.textMuted }]}>{value}</Text> : null}
      {chevron ? <Ionicons name={chevron} size={16} color={colors.textMuted} /> : null}
    </Pressable>
  );
}

/** Count tile — a number worth glancing at, and a shortcut to the tab it counts. */
function StatTile({ icon, tint, count, label, colors, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${count}`}
      style={({ pressed }) => [
        styles.tile,
        { backgroundColor: colors.surface, borderColor: colors.border },
        pressed && { opacity: 0.7 },
      ]}
    >
      <View style={[styles.tileIconCircle, { backgroundColor: `${tint}1F` }]}>
        <Ionicons name={icon} size={20} color={tint} />
      </View>
      <Text style={[styles.tileCount, { color: colors.heading }]}>{count}</Text>
      <Text style={[styles.tileLabel, { color: colors.textMuted }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

function SectionHeading({ label, colors, textAlign }) {
  return <Text style={[styles.sectionLabel, { color: colors.heading, textAlign }]}>{label}</Text>;
}

function Chip({ label, active, colors, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        { borderColor: colors.accent },
        active && { backgroundColor: colors.accent },
        pressed && { opacity: 0.6 },
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

  // ---- profile header ----
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 20,
  },
  avatarWrapper: {
    position: 'relative',
  },
  editBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileText: {
    flex: 1,
    gap: 2,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  name: {
    fontSize: 20,
    fontWeight: '700',
  },
  phone: {
    fontSize: 14,
    writingDirection: 'ltr',
  },
  roleBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 10,
    marginTop: 4,
  },
  roleBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  nameEditRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  nameInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 15,
  },
  signInButton: {
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
    marginBottom: 20,
  },
  signInButtonText: {
    fontWeight: '700',
    fontSize: 15,
  },

  // ---- count tiles ----
  tileRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  tile: {
    flex: 1,
    borderRadius: 16,
    // In light theme `surface` and `background` are both white, so without an
    // edge these read as loose text on the page rather than as tiles.
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 16,
    paddingHorizontal: 12,
    alignItems: 'center',
    gap: 4,
  },
  tileIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  tileCount: {
    fontSize: 20,
    fontWeight: '700',
  },
  tileLabel: {
    fontSize: 13,
  },

  // ---- sections and rows ----
  sectionLabel: {
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 10,
  },
  card: {
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 24,
    borderWidth: StyleSheet.hairlineWidth,
  },
  iconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  iconRowPressed: {
    opacity: 0.6,
  },
  rowDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
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
  rowLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
  rowSubtitle: {
    fontSize: 12.5,
  },
  rowValue: {
    fontSize: 13,
  },

  // ---- expanded language/theme block ----
  expanded: {
    paddingHorizontal: 14,
    paddingBottom: 16,
  },
  subLabel: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
  },
  subLabelSpacing: {
    marginTop: 16,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 7,
  },
  chipText: {
    fontWeight: '700',
    fontSize: 13,
  },

  // ---- destructive actions ----
  logoutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 4,
  },
  logoutText: {
    fontWeight: '700',
    fontSize: 16,
  },
  deleteLinkRow: {
    paddingVertical: 14,
    paddingHorizontal: 4,
  },
  deleteLinkText: {
    fontSize: 13,
    textDecorationLine: 'underline',
  },

  // ---- delete-account confirmation screen ----
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 12,
  },
  backText: {
    fontSize: 15,
    fontWeight: '600',
  },
  deleteWarning: {
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 24,
  },
  deleteConfirmButton: {
    alignItems: 'center',
    paddingVertical: 14,
  },
  deleteConfirmText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
});
