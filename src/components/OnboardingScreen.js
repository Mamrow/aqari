import { useState } from 'react';
import { I18nManager, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { ClipPath, Defs, Image as SvgImage, Path } from 'react-native-svg';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useT } from '../i18n/useT';
import { useThemeColors } from '../theme/useThemeColors';
import { FEATURED_GOLD } from '../theme/colors';

// The copy remains in translations.js so the visual sequence works in Arabic
// and English without hardcoded screen-specific strings.
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
  const paginationSlides = isRTL ? [...SLIDES].reverse() : SLIDES;
  const backIcon = isRTL ? 'chevron-forward' : 'chevron-back';

  const goBack = () => {
    if (index > 0) setIndex((value) => value - 1);
  };

  const goNext = () => {
    if (isLast) {
      onDone();
      return;
    }
    setIndex((value) => value + 1);
  };

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
      edges={['top', 'bottom']}
    >
      <View style={[styles.topBar, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
        <View style={[styles.brandLockup, isRTL ? styles.brandLockupRTL : styles.brandLockupLTR]}>
          <View style={[styles.brandMark, isRTL ? styles.brandMarkRTL : styles.brandMarkLTR]}>
            <View style={[styles.brandChevron, styles.brandChevronLeft, { backgroundColor: FEATURED_GOLD }]} />
            <View style={[styles.brandChevron, styles.brandChevronRight, { backgroundColor: FEATURED_GOLD }]} />
          </View>
          <Text style={[styles.brandName, { color: colors.heading }]}>Aqari</Text>
        </View>
        {isLast ? (
          <View style={styles.skipButtonPlaceholder} />
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
        <View style={[styles.heroScene, { backgroundColor: colors.background }]}>
          <View style={[styles.heroBlueShape, { backgroundColor: `${colors.accent}22` }]} />
          <Svg
            style={styles.heroSvg}
            width="100%"
            height="100%"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            accessibilityRole="image"
            accessibilityLabel={t(slide.titleKey)}
          >
            <Defs>
              <ClipPath id={`onboarding-photo-${slide.key}`}>
                <Path d="M 90 0 L 100 0 L 100 100 L 8 58 Z" />
              </ClipPath>
            </Defs>
            <SvgImage
              key={slide.key}
              href={slide.image}
              x="0"
              y="0"
              width="100"
              height="100"
              preserveAspectRatio="xMidYMid slice"
              clipPath={`url(#onboarding-photo-${slide.key})`}
            />
            <Path
              d="M 90 0 L 8 58 L 100 100"
              fill="none"
              stroke={FEATURED_GOLD}
              strokeWidth="0.45"
              vectorEffect="non-scaling-stroke"
            />
          </Svg>

          {index > 0 && (
            <Pressable
              style={({ pressed }) => [
                styles.backButtonFloating,
                isRTL ? styles.backButtonRTL : styles.backButtonLTR,
                { borderColor: colors.heading, backgroundColor: colors.background, opacity: pressed ? 0.65 : 1 },
              ]}
              onPress={goBack}
              accessibilityRole="button"
              accessibilityLabel={t('onboardBack')}
              testID="onboarding-back"
            >
              <Ionicons name={backIcon} size={22} color={colors.heading} />
            </Pressable>
          )}
        </View>

        <View style={styles.copyBlock}>
          <Text style={[styles.title, { color: colors.heading, textAlign: isRTL ? 'right' : 'left' }]}>
            {t(slide.titleKey)}
          </Text>
          <Text style={[styles.body, { color: colors.textMuted, textAlign: isRTL ? 'right' : 'left' }]}>
            {t(slide.bodyKey)}
          </Text>
        </View>
      </View>

      <View style={styles.footer}>
        <View style={[styles.footerRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          <View
            style={[
              styles.dotsRow,
              { justifyContent: isRTL ? 'flex-end' : 'flex-start' },
            ]}
            accessibilityLabel={`${index + 1} / ${SLIDES.length}`}
          >
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
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topBar: {
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 28,
    paddingTop: 10,
    minHeight: 92,
  },
  brandLockup: {
    position: 'relative',
    minWidth: 154,
    minHeight: 72,
    justifyContent: 'flex-end',
  },
  brandLockupLTR: { alignItems: 'flex-start' },
  brandLockupRTL: { alignItems: 'flex-end' },
  brandMark: {
    position: 'absolute',
    top: 0,
    width: 30,
    height: 18,
  },
  brandMarkLTR: { left: 12 },
  brandMarkRTL: { right: 12 },
  brandChevron: {
    position: 'absolute',
    top: 5,
    width: 21,
    height: 5,
    borderRadius: 3,
  },
  brandChevronLeft: {
    left: 0,
    transform: [{ rotate: '-32deg' }],
  },
  brandChevronRight: {
    right: 0,
    transform: [{ rotate: '32deg' }],
  },
  brandName: {
    fontFamily: 'serif',
    fontSize: 38,
    lineHeight: 48,
    fontWeight: '400',
    letterSpacing: -0.5,
    writingDirection: 'ltr',
  },
  skipButton: {
    minHeight: 44,
    minWidth: 56,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    borderRadius: 12,
  },
  skipButtonPlaceholder: {
    minHeight: 44,
    minWidth: 56,
  },
  skipText: {
    fontSize: 15,
    fontWeight: '700',
  },
  content: {
    flex: 1,
  },
  heroScene: {
    flex: 1,
    minHeight: 410,
    overflow: 'hidden',
  },
  heroBlueShape: {
    position: 'absolute',
    width: 240,
    height: 230,
    borderRadius: 76,
    left: -92,
    top: 36,
    transform: [{ rotate: '-16deg' }],
    zIndex: 1,
  },
  heroSvg: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 2,
  },
  backButtonFloating: {
    position: 'absolute',
    top: 26,
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 5,
  },
  backButtonLTR: { left: 24 },
  backButtonRTL: { right: 24 },
  copyBlock: {
    paddingHorizontal: 28,
    paddingTop: 24,
  },
  title: {
    fontFamily: 'serif',
    fontSize: 30,
    lineHeight: 38,
    fontWeight: '400',
    letterSpacing: -0.4,
    marginBottom: 12,
  },
  body: {
    fontSize: 16,
    lineHeight: 26,
    fontWeight: '400',
  },
  footer: {
    paddingHorizontal: 28,
    paddingTop: 18,
    paddingBottom: 18,
  },
  footerRow: {
    alignItems: 'center',
    gap: 18,
  },
  dotsRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 18,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  dotActive: {
    width: 26,
    borderRadius: 5,
  },
  nextButton: {
    width: '46%',
    minHeight: 58,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 17,
    paddingHorizontal: 16,
  },
  nextText: {
    fontSize: 16,
    fontWeight: '800',
  },
});
