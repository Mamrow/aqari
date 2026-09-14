import { Alert, Image, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAppContext } from '../context/AppContext';
import { useT } from '../i18n/useT';
import { useThemeColors } from '../theme/useThemeColors';
import appConfig from '../../app.json';

// The accounts don't exist yet. They're real buttons rather than nothing at
// all so the row's spacing is settled now, and turning one on later is a
// one-line change: put the profile URL in `url` and the tap opens it
// instead of saying "coming soon".
const SOCIALS = [
  { key: 'facebook', icon: 'logo-facebook', label: 'Facebook', url: null },
  { key: 'instagram', icon: 'logo-instagram', label: 'Instagram', url: null },
  { key: 'tiktok', icon: 'logo-tiktok', label: 'TikTok', url: null },
];

const SECTIONS = [
  ['aboutWhatTitle', 'aboutWhatBody'],
  ['aboutListTitle', 'aboutListBody'],
  ['aboutPrivacyTitle', 'aboutPrivacyBody'],
];

export default function AboutScreen({ navigation }) {
  const t = useT();
  const colors = useThemeColors();
  const { language } = useAppContext();
  const isRTL = language === 'ar';
  const align = { textAlign: isRTL ? 'right' : 'left' };

  const handleSocial = (social) => {
    if (!social.url) {
      Alert.alert(t('aboutSocialSoon'), t('aboutSocialSoonMessage'));
      return;
    }
    Linking.openURL(social.url).catch((error) => {
      console.warn('Could not open social link', error);
    });
  };

  return (
    // See the note in LegalInfoScreen — no edges on purpose.
    <SafeAreaView edges={[]} style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Image source={require('../../assets/icon.png')} style={styles.appIcon} />
          <Text style={[styles.appName, { color: colors.heading }]}>{t('appTitle')}</Text>
          <Text style={[styles.tagline, { color: colors.textMuted }]}>{t('aboutTagline')}</Text>
          {/* A version number is LTR text in both languages — without this
              the bidi algorithm reorders "1.0.0" against the Arabic word
              beside it. */}
          <Text style={[styles.version, { color: colors.textMuted }]}>
            {t('appVersionLabel')} {appConfig.expo.version}
          </Text>
        </View>

        <View style={[styles.accentRule, { backgroundColor: colors.accent }]} />

        {SECTIONS.map(([headingKey, bodyKey]) => (
          <View key={headingKey} style={styles.section}>
            <Text style={[styles.sectionHeading, align, { color: colors.heading }]}>
              {t(headingKey)}
            </Text>
            <Text style={[styles.sectionBody, align, { color: colors.text }]}>{t(bodyKey)}</Text>
          </View>
        ))}

        <Text style={[styles.followLabel, align, { color: colors.textMuted }]}>
          {t('aboutFollowLabel')}
        </Text>
        {/* Fixed left-to-right order. These are brand marks in a set
            sequence, not reading-order content, so mirroring them under
            Arabic would only make the row differ between languages for no
            reason. */}
        <View style={[styles.socialRow, { direction: 'ltr' }]}>
          {SOCIALS.map((social) => (
            <Pressable
              key={social.key}
              onPress={() => handleSocial(social)}
              accessibilityRole="button"
              accessibilityLabel={social.label}
              style={({ pressed }) => [
                styles.socialButton,
                { borderColor: colors.border, backgroundColor: colors.surface },
                pressed && styles.socialButtonPressed,
              ]}
            >
              <Ionicons name={social.icon} size={22} color={colors.accent} />
            </Pressable>
          ))}
        </View>

        <View style={[styles.legalRow, { borderTopColor: colors.border }]}>
          <Pressable
            onPress={() => navigation.navigate('PrivacyPolicy')}
            hitSlop={8}
            accessibilityRole="button"
          >
            <Text style={[styles.legalLink, { color: colors.accent }]}>{t('privacyPolicyRow')}</Text>
          </Pressable>
          <Text style={[styles.legalSeparator, { color: colors.border }]}>|</Text>
          <Pressable
            onPress={() => navigation.navigate('TermsOfService')}
            hitSlop={8}
            accessibilityRole="button"
          >
            <Text style={[styles.legalLink, { color: colors.accent }]}>
              {t('termsOfServiceRow')}
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 40 },
  header: { alignItems: 'center', paddingTop: 8 },
  appIcon: { width: 78, height: 78, borderRadius: 18 },
  appName: { marginTop: 12, fontSize: 24, fontWeight: '700' },
  tagline: { marginTop: 4, fontSize: 14 },
  version: { marginTop: 8, fontSize: 12, writingDirection: 'ltr' },
  accentRule: {
    alignSelf: 'center',
    width: 38,
    height: 3,
    borderRadius: 2,
    marginTop: 22,
    marginBottom: 24,
  },
  section: { marginBottom: 22 },
  sectionHeading: { fontSize: 18, fontWeight: '700', marginBottom: 7, lineHeight: 24 },
  sectionBody: { fontSize: 14, lineHeight: 22 },
  followLabel: { fontSize: 12, fontWeight: '700', marginTop: 2, marginBottom: 12 },
  socialRow: { flexDirection: 'row', justifyContent: 'center', gap: 14 },
  socialButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  socialButtonPressed: { opacity: 0.6 },
  legalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginTop: 30,
    paddingTop: 18,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  legalLink: { fontSize: 13, fontWeight: '600' },
  legalSeparator: { fontSize: 13 },
});
