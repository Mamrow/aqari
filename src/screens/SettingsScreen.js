import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Switch,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { CITIES, DISTRICTS } from '../data/districts';
import { useAppContext } from '../context/AppContext';
import { useT } from '../i18n/useT';
import { useThemeColors } from '../theme/useThemeColors';
import Avatar from '../components/Avatar';
import { uploadAvatarImage } from '../utils/uploadImage';
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
    updateNotificationPrefs,
    isAdmin,
    listings,
    saved,
    getMyId,
    replayOnboarding,
  } = useAppContext();
  const t = useT();
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const isRTL = language === 'ar';

  const [avatarUploading, setAvatarUploading] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [showDeleteAccount, setShowDeleteAccount] = useState(false);
  // Language and theme used to sit permanently open, which pushed everything
  // below them off the first screen. They're one row that opens now, so the
  // list reads as a list.
  const [displayOpen, setDisplayOpen] = useState(false);
  const [alertsOpen, setAlertsOpen] = useState(false);

  // Reset the scroll when the Settings TAB is left, not when a sub-page is
  // opened from it. Those are different intentions: stepping into Personal
  // info and coming back should return you to the row you tapped, the way
  // any list does, while leaving for another tab and returning later should
  // look like arriving fresh.
  //
  // Hence the parent navigator's blur rather than this screen's own —
  // pushing a screen blurs this one too, which is what made every trip into
  // a sub-page come back to the top. Still on the way out, not the way in,
  // so the jump happens off-screen instead of being watched.
  const scrollRef = useRef(null);
  useEffect(() => {
    const parent = navigation.getParent();
    if (!parent) return undefined;
    return parent.addListener('blur', () =>
      scrollRef.current?.scrollTo({ y: 0, animated: false })
    );
  }, [navigation]);

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

  // What the row says without opening it: off, everywhere, or a count.
  const alertCities = auth.notifyCities ?? [];
  const alertsSummary = !auth.notifyNewListings
    ? t('newListingAlertsSubtitleOff')
    : alertCities.length === 0
      ? t('newListingAlertsSubtitleAll')
      : (auth.notifyDistricts ?? []).length > 0
        ? t('newListingAlertsSubtitleDistricts').replace(
            '{count}',
            String((auth.notifyDistricts ?? []).length)
          )
        : t('newListingAlertsSubtitleCities').replace('{count}', String(alertCities.length));

  const alertDistricts = auth.notifyDistricts ?? [];

  const toggleAlertCity = (key) => {
    const adding = !alertCities.includes(key);
    const next = adding ? [...alertCities, key] : alertCities.filter((city) => city !== key);
    updateNotificationPrefs({
      notifyCities: next,
      // Unfollowing a city drops the districts picked inside it. Leaving them
      // behind would mean a stale narrowing springs back the day that city is
      // followed again, which nobody would connect to a choice made weeks ago.
      ...(adding ? {} : { notifyDistricts: alertDistricts.filter((d) => !d.startsWith(`${key}:`)) }),
    });
  };

  // "city:district" — district keys aren't unique across cities, and this is
  // the form the Edge Function matches on.
  const toggleAlertDistrict = (cityKey, districtKey) => {
    const composite = `${cityKey}:${districtKey}`;
    const next = alertDistricts.includes(composite)
      ? alertDistricts.filter((d) => d !== composite)
      : [...alertDistricts, composite];
    updateNotificationPrefs({ notifyDistricts: next });
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
        ref={scrollRef}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: Math.max(40, insets.bottom + 104) }]}
        keyboardShouldPersistTaps="handled"
      >
        {/* Identity first, the way a profile tab reads elsewhere: who you're
            signed in as, then what you've got, then the settings themselves.
            The old screen opened with a "Settings" title and a large card,
            which pushed the account's own name below the fold. */}
        {auth.loggedIn && (
        <View style={styles.profileHeader}>
          <Pressable onPress={handlePickAvatar} style={styles.avatarWrapper}>
            <Avatar uri={auth.avatarUrl} name={auth.name} size={64} colors={colors} />
            <View
              style={[styles.editBadge, { backgroundColor: colors.accent, borderColor: colors.background }]}
            >
              {avatarUploading ? (
                <ActivityIndicator size="small" color={colors.accentText} />
              ) : (
                <Ionicons name="camera" size={12} color={colors.accentText} />
              )}
            </View>
          </Pressable>

          <View style={styles.profileText}>
            {auth.loggedIn ? (
              <>
                {/* Just the name. Editing it lives on Personal info, which
                    is also where the number, email and password are — two
                    places to change one thing is how they drift apart. */}
                <Text style={[styles.name, { color: colors.heading }]} numberOfLines={1}>
                  {auth.name}
                </Text>
                {/* Phone numbers read left-to-right in both languages. */}
                <Text style={[styles.phone, { color: colors.textMuted }]}>{auth.phone}</Text>
                {isAdmin && (
                  <View style={[styles.roleBadge, { backgroundColor: colors.surface }]}>
                    <Text style={[styles.roleBadgeText, { color: colors.accent }]}>{t('roleAdmin')}</Text>
                  </View>
                )}
              </>
            ) : null}
          </View>
        </View>
        )}

        {/* Signed out, the screen led with an empty avatar and the word
            "Settings" — an account area with no account in it. A guest gets
            an invitation instead, which is also the only thing on this screen
            they can act on. */}
        {!auth.loggedIn && (
          <View style={[styles.guestCard, { backgroundColor: colors.surface }]}>
            <View style={[styles.guestArt, { backgroundColor: `${colors.accent}18` }]}>
              <Ionicons name="home" size={40} color={colors.accent} />
            </View>
            <Text style={[styles.guestTitle, { color: colors.heading }]}>
              {t('guestWelcomeTitle')}
            </Text>
            <Text style={[styles.guestBody, { color: colors.textMuted }]}>
              {t('guestWelcomeBody')}
            </Text>
            <Pressable
              style={({ pressed }) => [
                styles.signInButton,
                { backgroundColor: colors.accent, opacity: pressed ? 0.8 : 1 },
              ]}
              onPress={() => requireAuth(() => {})}
            >
              <Text style={[styles.signInButtonText, { color: colors.accentText }]}>
                {t('guestWelcomeButton')}
              </Text>
            </Pressable>
          </View>
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

        <SectionHeading label={t('accountSettingsLabel')} colors={colors} />
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {auth.loggedIn && (
            <Row
                icon="person-circle-outline"
              label={t('personalInfoRow')}
              subtitle={t('personalInfoRowSubtitle')}
              colors={colors}
              onPress={() => navigation.navigate('PersonalInfo')}
            />
          )}

          <Row
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
              <Text style={[styles.subLabel, { color: colors.textMuted }]}>{t('languageLabel')}</Text>
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

              <Text style={[styles.subLabel, styles.subLabelSpacing, { color: colors.textMuted }]}>
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

          {/* Opt-in, and off by default: a push about someone else's new
              listing is promotional, which both stores require be a choice
              rather than a default. */}
          {auth.loggedIn && (
            <Row
              icon="notifications-outline"
              label={t('newListingAlertsRow')}
              subtitle={alertsOpen ? undefined : alertsSummary}
              colors={colors}
              divider
              chevron={alertsOpen ? 'chevron-up' : 'chevron-down'}
              onPress={() => setAlertsOpen((open) => !open)}
            />
          )}
          {auth.loggedIn && alertsOpen && (
            <View style={styles.expanded}>
              <Pressable
                style={styles.switchRow}
                onPress={() =>
                  updateNotificationPrefs({ notifyNewListings: !auth.notifyNewListings })
                }
                accessibilityRole="switch"
                accessibilityState={{ checked: auth.notifyNewListings }}
              >
                <Text style={[styles.switchLabel, { color: colors.text }]}>
                  {t('newListingAlertsToggle')}
                </Text>
                <Switch
                  value={auth.notifyNewListings}
                  onValueChange={(value) =>
                    updateNotificationPrefs({ notifyNewListings: value })
                  }
                  trackColor={{ true: colors.accent, false: colors.inputBorder }}
                />
              </Pressable>

              {auth.notifyNewListings && (
                <>
                  <Text style={[styles.subLabel, styles.subLabelSpacing, { color: colors.textMuted }]}>
                    {t('newListingAlertsCitiesLabel')}
                  </Text>
                  <Text style={[styles.alertsHint, { color: colors.textMuted }]}>
                    {t('newListingAlertsCitiesHint')}
                  </Text>
                  <View style={styles.chipRow}>
                    {CITIES.map((city) => (
                      <Chip
                        key={city.key}
                        label={t(city.labelKey)}
                        active={alertCities.includes(city.key)}
                        colors={colors}
                        onPress={() => toggleAlertCity(city.key)}
                      />
                    ))}
                  </View>

                  {/* Districts appear only for cities you're actually
                      following, and only where the city has any. Picking none
                      means the whole city — Tripoli alone is 35km across, so
                      "anywhere in the city" is the wrong default to force on
                      someone watching one neighbourhood. */}
                  {CITIES.filter(
                    (city) =>
                      alertCities.includes(city.key) &&
                      DISTRICTS.some((d) => d.city === city.key)
                  ).map((city) => (
                    <View key={city.key}>
                      <Text
                        style={[styles.subLabel, styles.subLabelSpacing, { color: colors.textMuted }]}
                      >
                        {t('newListingAlertsDistrictsLabel').replace('{city}', t(city.labelKey))}
                      </Text>
                      <View style={styles.chipRow}>
                        {DISTRICTS.filter((d) => d.city === city.key).map((district) => (
                          <Chip
                            key={district.key}
                            label={t(district.labelKey)}
                            active={alertDistricts.includes(`${city.key}:${district.key}`)}
                            colors={colors}
                            onPress={() => toggleAlertDistrict(city.key, district.key)}
                          />
                        ))}
                      </View>
                    </View>
                  ))}
                </>
              )}
            </View>
          )}


          {auth.loggedIn && !isAdmin && (
            <Row
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
                icon="card-outline"
              label={t('paymentHistoryRow')}
              subtitle={t('paymentHistoryRowSubtitle')}
              colors={colors}
              divider
              onPress={() => navigation.navigate('PaymentHistory')}
            />
          )}
        </View>

        <SectionHeading label={t('aboutAqariLabel')} colors={colors} />
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Row
            icon="create-outline"
            label={t('feedbackRow')}
            colors={colors}
            onPress={() => navigation.navigate('Support')}
          />
          <Row
            icon="reader-outline"
            label={t('termsOfServiceRow')}
            colors={colors}
            divider
            onPress={() => navigation.navigate('TermsOfService')}
          />
          <Row
            icon="document-text-outline"
            label={t('privacyPolicyRow')}
            colors={colors}
            divider
            onPress={() => navigation.navigate('PrivacyPolicy')}
          />
          <Row
            icon="sparkles-outline"
            label={t('howItWorksRow')}
            colors={colors}
            divider
            onPress={replayOnboarding}
          />
          <Row
            icon="information-circle-outline"
            label={t('aboutAppRow')}
            colors={colors}
            divider
            value={`${t('appVersionLabel')} ${appConfig.expo.version}`}
            chevron={null}
          />
          <Row
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
 * No textAlign anywhere: the label shrinks to its content and the row's
 * layout puts it at the writing-direction start. See rowTextBlock.
 */
function Row({ icon, label, subtitle, value, colors, onPress, divider, chevron = 'chevron-forward' }) {
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
        <Text style={[styles.rowLabel, { color: colors.text }]}>{label}</Text>
        {subtitle ? (
          <Text style={[styles.rowSubtitle, { color: colors.textMuted }]}>{subtitle}</Text>
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

function SectionHeading({ label, colors }) {
  return <Text style={[styles.sectionLabel, { color: colors.heading }]}>{label}</Text>;
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
    alignItems: 'flex-start',
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
  signInButton: {
    alignSelf: 'stretch',
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
  },
  guestCard: {
    borderRadius: 20,
    padding: 20,
    alignItems: 'center',
    gap: 10,
    marginBottom: 26,
  },
  guestArt: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  guestTitle: {
    fontSize: 19,
    fontWeight: '800',
    textAlign: 'center',
  },
  guestBody: {
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
    marginBottom: 8,
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
    alignSelf: 'flex-start',
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
  // 'flex-start' is the *writing-direction* start in Yoga, resolved once and
  // identically on both platforms — which textAlign is not. Explicit
  // textAlign:'right' came out left on iOS here, and textAlign:'auto' came
  // out left too; letting the label shrink to its content and sit at the
  // start of the row sidesteps the whole question.
  rowTextBlock: {
    flex: 1,
    gap: 2,
    alignItems: 'flex-start',
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
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  switchLabel: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
  },
  alertsHint: {
    fontSize: 12.5,
    lineHeight: 18,
    marginBottom: 10,
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
  // Centred rather than hugging an edge: it's the last thing on the screen
  // and the only destructive one, so it shouldn't look like another list row
  // that happens to be left over.
  deleteLinkRow: {
    paddingVertical: 14,
    paddingHorizontal: 4,
    alignItems: 'center',
  },
  deleteLinkText: {
    fontSize: 13,
    textDecorationLine: 'underline',
    textAlign: 'center',
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
