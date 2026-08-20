import { useState } from 'react';
import { Image, I18nManager, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useT } from '../i18n/useT';
import { useThemeColors } from '../theme/useThemeColors';
import { FEATURED_GOLD } from '../theme/colors';

// Photo assets and label keys only — the copy itself lives in translations.js
// like everything else, so this stays translatable rather than hardcoding English.
const SLIDES = [
  {
    key: 'browse',
    image: require('../../assets/onboarding/browse.jpg'),
    titleKey: 'onboardBrowseTitle',
    bodyKey: 'onboardBrowseBody',
  },
  {
    key: 'save',
    image: require('../../assets/onboarding/save.jpg'),
    titleKey: 'onboardSaveTitle',
    bodyKey: 'onboardSaveBody',
  },
  {
    key: 'contact',
    image: require('../../assets/onboarding/contact.jpg'),
    titleKey: 'onboardContactTitle',
    bodyKey: 'onboardContactBody',
  },
  {
    key: 'list',
    image: require('../../assets/onboarding/list.jpg'),
    titleKey: 'onboardListTitle',
    bodyKey: 'onboardListBody',
  },
];

export default function OnboardingScreen({ onDone }) {
  const t = useT();
  const colors = useThemeColors();
  const [index, setIndex] = useState(0);
  const isRTL = I18nManager.isRTL;
  const isLast = index === SLIDES.length - 1;
  const slide = SLIDES[index];

  // Keep the semantic slide order stable while mirroring only the visual
  // pagination order. This puts the first page on the right in Arabic and on
  // the left in English without making the Next button move backwards.
  const paginationSlides = isRTL ? [...SLIDES].reverse() : SLIDES;
  const nextIcon = isRTL ? 'chevron-back' : 'chevron-forward';
  const backIcon = isRTL ? 'chevron-forward' : 'chevron-back';

  const goBack = () => {
    if (index > 0) setIndex(index - 1);
  };

  const goNext = () => {
    if (isLast) {
      onDone();
      return;
    }
    setIndex(index + 1);
  };

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
      edges={['top', 'bottom']}
    >
      <View style={[styles.topBar, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
        <View style={[styles.brandLockup, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          <View style={[styles.brandMark, { backgroundColor: FEATURED_GOLD }]} />
          <Text style={[styles.brandName, { color: colors.heading }]}>Aqari</Text>
        </View>
        {isLast ? (
          // Keeps the brand lockup from sliding across when Skip disappears.
          <View style={styles.skipButton} />
        ) : (
          <Pressable
            onPress={onDone}
            style={({ pressed }) => [styles.skipButton, { opacity: pressed ? 0.55 : 1 }]}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={t('onboardSkip')}
            testID="onboarding-skip"
          >
            <Text style={[styles.skipText, { color: colors.textMuted }]}>{t('onboardSkip')}</Text>
          </Pressable>
        )}
      </View>

      <View style={styles.content}>
        <View style={styles.slideFrame}>
          <Text style={[styles.stepLabel, { color: colors.textMuted }]}>
            {`⁦${String(index + 1).padStart(2, '0')} / ${String(SLIDES.length).padStart(2, '0')}⁩`}
          </Text>

          <View
            style={[
              styles.heroCard,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <View style={[styles.heroBlueShape, { backgroundColor: `${colors.accent}22` }]} />
            <Image
              source={slide.image}
              style={styles.heroImage}
              resizeMode="cover"
              accessibilityRole="image"
              accessibilityLabel={t(slide.titleKey)}
            />
            <View style={[styles.heroMask, { backgroundColor: colors.surface }]} />
            <View style={[styles.heroDiagonal, { backgroundColor: FEATURED_GOLD }]} />
          </View>

          <Text style={[styles.title, { color: colors.heading, textAlign: isRTL ? 'right' : 'left' }]}>
            {t(slide.titleKey)}
          </Text>
          <Text style={[styles.body, { color: colors.textMuted, textAlign: isRTL ? 'right' : 'left' }]}>
            {t(slide.bodyKey)}
          </Text>
        </View>
      </View>

      <View style={styles.footer}>
        <View style={[styles.progressMeta, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          <Text style={[styles.progressLabel, { color: colors.textMuted }]}>
            {t('onboardProgressLabel')}
          </Text>
          <Text style={[styles.progressCount, { color: colors.heading }]}>
            {`⁦${index + 1} / ${SLIDES.length}⁩`}
          </Text>
        </View>

        <View style={styles.dotsRow} accessibilityLabel={`${index + 1} / ${SLIDES.length}`}>
          {paginationSlides.map((item) => {
            const active = item.key === slide.key;
            return (
              <View
                key={item.key}
                style={[
                  styles.dot,
                  { backgroundColor: active ? colors.accent : colors.border },
                  active && styles.dotActive,
                ]}
              />
            );
          })}
        </View>

        <View style={[styles.actionRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          {index > 0 && (
            <Pressable
              style={({ pressed }) => [
                styles.backButton,
                { borderColor: colors.border, opacity: pressed ? 0.6 : 1 },
                { flexDirection: isRTL ? 'row-reverse' : 'row' },
              ]}
              onPress={goBack}
              accessibilityRole="button"
              accessibilityLabel={t('onboardBack')}
              testID="onboarding-back"
            >
              <Ionicons name={backIcon} size={19} color={colors.textMuted} />
              <Text style={[styles.backText, { color: colors.textMuted }]}>{t('onboardBack')}</Text>
            </Pressable>
          )}

          <Pressable
            style={({ pressed }) => [
              styles.nextButton,
              { backgroundColor: colors.accent, opacity: pressed ? 0.88 : 1 },
              { flexDirection: isRTL ? 'row-reverse' : 'row' },
            ]}
            onPress={goNext}
            accessibilityRole="button"
            accessibilityLabel={isLast ? t('onboardGetStarted') : t('onboardNext')}
            testID="onboarding-next"
          >
            <Text style={[styles.nextText, { color: colors.accentText }]}>
              {isLast ? t('onboardGetStarted') : t('onboardNext')}
            </Text>
            {!isLast && <Ionicons name={nextIcon} size={19} color={colors.accentText} />}
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topBar: {
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingTop: 8,
    minHeight: 52,
  },
  brandLockup: {
    alignItems: 'center',
    gap: 8,
  },
  brandMark: {
    width: 9,
    height: 9,
    borderRadius: 3,
  },
  brandName: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  skipButton: {
    minHeight: 44,
    minWidth: 56,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    borderRadius: 12,
  },
  skipText: {
    fontSize: 15,
    fontWeight: '700',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  slideFrame: {
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
  },
  stepLabel: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.4,
    marginBottom: 14,
    textAlign: 'left',
    writingDirection: 'ltr',
  },
  heroCard: {
    height: 340,
    borderRadius: 30,
    borderWidth: 1,
    marginBottom: 28,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  heroBlueShape: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 74,
    left: -86,
    top: 24,
    transform: [{ rotate: '-18deg' }],
    zIndex: 1,
  },
  heroImage: {
    position: 'absolute',
    top: -18,
    right: -56,
    width: '116%',
    height: '120%',
    zIndex: 2,
  },
  heroMask: {
    position: 'absolute',
    width: '86%',
    height: '180%',
    left: '-44%',
    top: '-42%',
    transform: [{ rotate: '-31deg' }],
    zIndex: 3,
  },
  heroDiagonal: {
    position: 'absolute',
    width: 4,
    height: '155%',
    left: '54%',
    top: '-26%',
    transform: [{ rotate: '-31deg' }],
    zIndex: 4,
  },
  title: {
    fontSize: 29,
    lineHeight: 36,
    fontWeight: '800',
    letterSpacing: -0.5,
    marginBottom: 12,
  },
  body: {
    fontSize: 16,
    lineHeight: 26,
    fontWeight: '400',
  },
  footer: {
    paddingHorizontal: 24,
    paddingTop: 18,
    paddingBottom: 12,
    gap: 18,
  },
  progressMeta: {
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  progressLabel: {
    fontSize: 12,
    fontWeight: '700',
  },
  progressCount: {
    fontSize: 13,
    fontWeight: '800',
    writingDirection: 'ltr',
  },
  dotsRow: {
    direction: 'ltr',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    minHeight: 18,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  dotActive: {
    width: 26,
    borderRadius: 5,
  },
  nextButton: {
    // Takes the remaining width beside Back so the forward action stays the
    // dominant one, and still fills the row on the first slide where Back
    // isn't rendered.
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 15,
    minHeight: 56,
    paddingHorizontal: 20,
  },
  nextText: {
    fontSize: 16,
    fontWeight: '800',
  },
});
