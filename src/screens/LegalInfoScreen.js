import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAppContext } from '../context/AppContext';
import { useT } from '../i18n/useT';
import { useThemeColors } from '../theme/useThemeColors';

const PUBLIC_PAGE_URLS = {
  privacy: 'https://lyaqari.netlify.app/privacy/',
  terms: 'https://lyaqari.netlify.app/terms/',
  support: 'https://lyaqari.netlify.app/support/',
};

const PAGE_CONFIG = {
  privacy: {
    titleKey: 'privacyPolicyTitle',
    subtitleKey: 'privacyPolicyDate',
    icon: 'shield-checkmark-outline',
    sections: [
      ['privacyOverviewTitle', 'privacyOverview'],
      ['privacyInfoTitle', 'privacyInfo'],
      ['privacyLocationTitle', 'privacyLocation'],
      ['privacyUseTitle', 'privacyUse'],
      ['privacyThirdPartyTitle', 'privacyThirdParty'],
      ['privacyChoicesTitle', 'privacyChoices'],
      ['privacyRetentionTitle', 'privacyRetention'],
      ['privacyChildrenTitle', 'privacyChildren'],
      ['privacyChangesTitle', 'privacyChanges'],
      ['privacyContactTitle', 'privacyContact'],
    ],
  },
  terms: {
    titleKey: 'termsOfServiceTitle',
    subtitleKey: 'termsOfServiceSubtitle',
    icon: 'document-text-outline',
    sections: [
      ['termsOverviewTitle', 'termsOverview'],
      ['termsListingsTitle', 'termsListings'],
      ['termsModerationTitle', 'termsModeration'],
      ['termsContactTitle', 'termsContact'],
      ['termsPrivacyTitle', 'termsPrivacy'],
    ],
  },
  support: {
    titleKey: 'supportTitle',
    subtitleKey: 'supportSubtitle',
    icon: 'help-circle-outline',
    sections: [
      ['supportIntroTitle', 'supportIntro'],
      ['supportReportTitle', 'supportReport'],
      ['supportDeleteTitle', 'supportDelete'],
    ],
  },
};

export default function LegalInfoScreen({ route }) {
  const t = useT();
  const colors = useThemeColors();
  const { language } = useAppContext();
  const isRTL = language === 'ar';
  const pageType = route?.params?.type ?? 'privacy';
  const page = PAGE_CONFIG[pageType] ?? PAGE_CONFIG.privacy;

  const handleEmailSupport = () => {
    Linking.openURL('mailto:aaqaaryy@gmail.com').catch((error) => {
      console.warn('Could not open support email', error);
    });
  };

  const handleOpenPublicPage = () => {
    const url = PUBLIC_PAGE_URLS[pageType];
    if (!url) return;
    Linking.openURL(url).catch((error) => {
      console.warn('Could not open public legal page', error);
    });
  };

  return (
    <SafeAreaView edges={['bottom']} style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.titleRow}>
          <View style={[styles.titleBlock, isRTL && styles.titleBlockRTL]}>
            <Text style={[styles.title, { color: colors.heading, textAlign: isRTL ? 'right' : 'left' }]}>
              {t(page.titleKey)}
            </Text>
            <Text
              style={[
                styles.subtitle,
                { color: colors.textMuted, textAlign: isRTL ? 'right' : 'left' },
              ]}
            >
              {t(page.subtitleKey)}
            </Text>
          </View>
          <View style={[styles.titleIcon, { backgroundColor: `${colors.accent}18` }]}>
            <Ionicons name={page.icon} size={22} color={colors.accent} />
          </View>
        </View>

        <View style={[styles.accentRule, { backgroundColor: colors.accent }]} />

        {page.sections.map(([headingKey, bodyKey]) => (
          <View key={headingKey} style={styles.section}>
            <Text
              style={[styles.sectionHeading, { color: colors.heading, textAlign: isRTL ? 'right' : 'left' }]}
            >
              {t(headingKey)}
            </Text>
            <Text
              style={[styles.sectionBody, { color: colors.text, textAlign: isRTL ? 'right' : 'left' }]}
            >
              {t(bodyKey)}
            </Text>
          </View>
        ))}

        <Pressable
          onPress={handleOpenPublicPage}
          style={[styles.publicLinkButton, { borderColor: colors.border, backgroundColor: colors.surface }]}
          accessibilityRole="link"
          accessibilityLabel={t('viewOnlineLabel')}
        >
          <Ionicons name="open-outline" size={17} color={colors.accent} />
          <Text style={[styles.publicLinkText, { color: colors.accent }]}>{t('viewOnlineLabel')}</Text>
        </Pressable>

        {pageType === 'support' && (
          <View style={[styles.contactCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={[styles.contactIcon, { backgroundColor: `${colors.accent}18` }]}>
              <Ionicons name="mail-outline" size={19} color={colors.accent} />
            </View>
            <View style={[styles.contactCopy, isRTL && styles.contactCopyRTL]}>
              <Text style={[styles.contactTitle, { color: colors.text, textAlign: isRTL ? 'right' : 'left' }]}>
                {t('supportEmailLabel')}
              </Text>
              <Text style={[styles.contactEmail, { color: colors.accent, textAlign: isRTL ? 'right' : 'left' }]}>
                aaqaaryy@gmail.com
              </Text>
            </View>
            <Pressable
              onPress={handleEmailSupport}
              style={[styles.contactButton, { backgroundColor: colors.accent }]}
              accessibilityRole="button"
              accessibilityLabel={t('supportEmailAction')}
            >
              <Text style={[styles.contactButtonText, { color: colors.accentText }]}>
                {t('supportEmailAction')}
              </Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 48 },
  backText: { fontSize: 15, fontWeight: '600' },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 },
  titleBlock: { flex: 1 },
  titleBlockRTL: { alignItems: 'stretch' },
  title: { fontSize: 28, fontWeight: '700', lineHeight: 34 },
  subtitle: { marginTop: 6, fontSize: 12, lineHeight: 18 },
  titleIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  accentRule: { width: 38, height: 3, borderRadius: 2, marginTop: 20, marginBottom: 24 },
  section: { marginBottom: 22 },
  sectionHeading: { fontSize: 18, fontWeight: '700', marginBottom: 7, lineHeight: 24 },
  sectionBody: { fontSize: 14, lineHeight: 22 },
  publicLinkButton: {
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    marginTop: 2,
    marginBottom: 16,
  },
  publicLinkText: { fontSize: 14, fontWeight: '700' },
  contactCard: { flexDirection: 'row', alignItems: 'center', gap: 11, borderWidth: 1, borderRadius: 16, padding: 14, marginTop: 2 },
  contactIcon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  contactCopy: { flex: 1 },
  contactCopyRTL: { alignItems: 'stretch' },
  contactTitle: { fontSize: 12, fontWeight: '700' },
  contactEmail: { marginTop: 3, fontSize: 12 },
  contactButton: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9 },
  contactButtonText: { fontSize: 11, fontWeight: '700' },
});
