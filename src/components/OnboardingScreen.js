import { useState } from 'react';
import { Image as RNImage, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useT } from '../i18n/useT';
import { useAppContext } from '../context/AppContext';

// Onboarding is a fixed light-palette experience matching the baked artwork
// below; it intentionally doesn't react to app theme.
const ONBOARDING_BACKGROUND = '#F6F2EF';
const ONBOARDING_NAVY = '#01102C';
const ONBOARDING_BODY = '#2D3A52';
const ONBOARDING_BLUE = '#0045D3';

// These layers are derived from the supplied 9:16 reference screens. They
// contain only the property artwork, pale-blue backing, and gold edge; live
// copy and controls stay in React Native for localization and accessibility.
const SLIDES = [
  {
    key: 'browse',
    image: require('../../assets/onboarding/onboarding-reference-1.jpg'),
    titleKey: 'onboardBrowseTitle',
    bodyKey: 'onboardBrowseBody',
  },
  {
    key: 'save',
    image: require('../../assets/onboarding/onboarding-reference-2.jpg'),
    titleKey: 'onboardSaveTitle',
    bodyKey: 'onboardSaveBody',
  },
  {
    key: 'contact',
    image: require('../../assets/onboarding/onboarding-reference-3.jpg'),
    titleKey: 'onboardContactTitle',
    bodyKey: 'onboardContactBody',
  },
  {
    key: 'list',
    image: require('../../assets/onboarding/onboarding-reference-4.jpg'),
    titleKey: 'onboardListTitle',
    bodyKey: 'onboardListBody',
  },
];

export default function OnboardingScreen({ onDone }) {
  const t = useT();
  const { language } = useAppContext();
  const [index, setIndex] = useState(0);
  const isRTL = language === 'ar';
  const displayCopy = (key) => {
    const value = t(key);
    return isRTL ? `\u202B${value}\u202C` : value;
  };
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

  const backButton = index > 0 ? (
    <Pressable
      style={({ pressed }) => [
        styles.backButtonBottom,
        { opacity: pressed ? 0.65 : 1 },
      ]}
      onPress={goBack}
      accessibilityRole="button"
      accessibilityLabel={t('onboardBack')}
      testID="onboarding-back"
    >
      <Ionicons name={backIcon} size={16} color="#68717F" />
      <Text style={styles.backText}>{t('onboardBack')}</Text>
    </Pressable>
  ) : null;

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: ONBOARDING_BACKGROUND }]}
      edges={['top', 'bottom']}
    >
      <View style={styles.canvas}>
        <View style={styles.artworkLayer} pointerEvents="none">
          {SLIDES.map((item, itemIndex) => (
            <RNImage
              key={item.key}
              source={item.image}
              style={[
                styles.artwork,
                isRTL && styles.artworkMirrored,
                itemIndex === index ? styles.artworkActive : styles.artworkHidden,
              ]}
              resizeMode="cover"
              accessible={itemIndex === index}
              accessibilityRole={itemIndex === index ? 'image' : undefined}
              accessibilityLabel={itemIndex === index ? t(item.titleKey) : undefined}
            />
          ))}
        </View>

        <View style={styles.topBar}>
          <View style={[styles.brandLockup, isRTL ? styles.brandRTL : styles.brandLTR]}>
            <RNImage
              source={require('../../assets/onboarding/onboarding-brand.png')}
              style={styles.brandImage}
              resizeMode="contain"
              accessibilityRole="image"
              accessibilityLabel="Aqari"
            />
          </View>
          {isLast ? (
              <View style={[styles.skipButtonPlaceholder, isRTL ? styles.skipRTL : styles.skipLTR]} />
          ) : (
            <Pressable
              onPress={onDone}
              style={({ pressed }) => [
                styles.skipButton,
                isRTL ? styles.skipRTL : styles.skipLTR,
                { opacity: pressed ? 0.55 : 1 },
              ]}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={t('onboardSkip')}
              testID="onboarding-skip"
            >
              <Text style={styles.skipText}>{t('onboardSkip')}</Text>
            </Pressable>
          )}
        </View>

        <View
          style={[
            styles.copyBlock,
            isRTL ? styles.copyBlockRTL : styles.copyBlockLTR,
            { direction: isRTL ? 'rtl' : 'ltr', writingDirection: isRTL ? 'rtl' : 'ltr' },
          ]}
        >
          <Text
            style={[
              styles.title,
              isRTL && styles.titleRTL,
              {
                textAlign: isRTL ? 'right' : 'left',
                writingDirection: isRTL ? 'rtl' : 'ltr',
                direction: isRTL ? 'rtl' : 'ltr',
              },
            ]}
          >
            {displayCopy(slide.titleKey)}
          </Text>
          <Text
            numberOfLines={3}
            style={[
              styles.body,
              isRTL && styles.bodyRTL,
              {
                textAlign: isRTL ? 'right' : 'left',
                writingDirection: isRTL ? 'rtl' : 'ltr',
                direction: isRTL ? 'rtl' : 'ltr',
              },
            ]}
          >
            {displayCopy(slide.bodyKey)}
          </Text>
        </View>

        <View style={styles.footer}>
          <View style={styles.footerRow}>
            {!isRTL && (
              <View
                style={[
                  styles.dotsRow,
                  styles.dotsRowLTR,
                ]}
                accessibilityLabel={`${index + 1} / ${SLIDES.length}`}
              >
                {paginationSlides.map((item) => {
                  const active = item.key === slide.key;
                  return (
                    <View
                      key={item.key}
                      style={[styles.dot, { backgroundColor: active ? ONBOARDING_BLUE : '#D8D8D8' }]}
                    />
                  );
                })}
              </View>
            )}

            <View
              style={[
                styles.actionRow,
                index > 0 ? styles.actionRowWithBack : styles.actionRowWithoutBack,
                isRTL ? styles.actionRowRTL : styles.actionRowLTR,
              ]}
            >
              <Pressable
                style={({ pressed }) => [
                  styles.nextButton,
                  { backgroundColor: ONBOARDING_BLUE, opacity: pressed ? 0.88 : 1 },
                ]}
                onPress={goNext}
                accessibilityRole="button"
                accessibilityLabel={isLast ? t('onboardGetStarted') : t('onboardNext')}
                testID="onboarding-next"
              >
                <Text style={styles.nextText}>
                  {isLast ? t('onboardGetStarted') : t('onboardNext')}
                </Text>
              </Pressable>

              {backButton}
            </View>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  canvas: {
    flex: 1,
    position: 'relative',
    overflow: 'hidden',
  },
  artworkLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
  },
  artwork: {
    ...StyleSheet.absoluteFillObject,
    width: undefined,
    height: undefined,
  },
  artworkActive: {
    opacity: 1,
  },
  artworkHidden: {
    opacity: 0,
  },
  // RTL mirrors the baked photo/triangle/gold-line artwork as a unit so it
  // stays visually consistent with the rest of the screen (Skip, back
  // button, copy, footer) flipping sides. The Aqari wordmark is NOT
  // mirrored — logo lockups conventionally stay fixed in RTL apps.
  artworkMirrored: {
    transform: [{ scaleX: -1 }],
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    minHeight: 80,
    zIndex: 10,
  },
  brandLockup: {
    position: 'absolute',
    top: 10,
    width: 92,
    height: 52,
    flexShrink: 0,
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
  },
  brandLTR: {
    left: 24,
  },
  brandRTL: {
    right: 24,
  },
  brandImage: {
    width: '100%',
    height: '100%',
  },
  skipButton: {
    position: 'absolute',
    top: 8,
    minHeight: 44,
    minWidth: 56,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    borderRadius: 12,
  },
  skipButtonPlaceholder: {
    position: 'absolute',
    top: 8,
    minHeight: 44,
    minWidth: 56,
  },
  skipLTR: {
    right: 24,
  },
  skipRTL: {
    left: 24,
  },
  skipText: {
    color: ONBOARDING_NAVY,
    fontSize: 15,
    fontWeight: '400',
  },
  copyBlock: {
    position: 'absolute',
    top: '72%',
    width: '76%',
    zIndex: 6,
  },
  copyBlockLTR: {
    left: 28,
  },
  copyBlockRTL: {
    left: '44%',
    right: 24,
    top: '70%',
    width: 'auto',
    alignItems: 'stretch',
  },
  title: {
    color: ONBOARDING_NAVY,
    fontFamily: 'serif',
    fontSize: 30,
    lineHeight: 38,
    fontWeight: '400',
    letterSpacing: -0.4,
    marginBottom: 14,
  },
  titleRTL: {
    width: '100%',
    fontFamily: 'sans-serif',
    fontSize: 25,
    lineHeight: 34,
    fontWeight: '600',
    letterSpacing: 0,
    marginBottom: 10,
    writingDirection: 'rtl',
    textAlign: 'right',
  },
  body: {
    color: ONBOARDING_BODY,
    fontSize: 16,
    lineHeight: 26,
    fontWeight: '400',
  },
  bodyRTL: {
    width: '100%',
    fontFamily: 'sans-serif',
    fontSize: 14,
    lineHeight: 23,
    fontWeight: '400',
    writingDirection: 'rtl',
    textAlign: 'right',
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 22,
    paddingHorizontal: 20,
    zIndex: 7,
  },
  footerRow: {
    position: 'relative',
    width: '100%',
    minHeight: 60,
    alignItems: 'center',
    // Plain 'row', not conditionally 'row-reverse' — I18nManager.forceRTL
    // (set app-wide at boot, see App.js) already auto-mirrors 'row' once
    // Arabic is active. Manually reversing on top of that cancels the
    // automatic mirroring and renders this row as if it were still LTR.
    flexDirection: 'row',
  },
  actionRow: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  actionRowLTR: {
    right: 0,
  },
  actionRowRTL: {
    left: 0,
  },
  actionRowWithoutBack: {
    width: '52%',
  },
  actionRowWithBack: {
    width: '82%',
  },
  backButtonBottom: {
    minWidth: 84,
    minHeight: 52,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: '#B8BDC6',
    backgroundColor: '#E8EAED',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    flexDirection: 'row',
    gap: 5,
  },
  dotsRow: {
    position: 'absolute',
    width: 82,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 18,
  },
  dotsRowLTR: {
    left: 0,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  nextButton: {
    flex: 1,
    minHeight: 60,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 30,
    paddingHorizontal: 16,
  },
  backText: {
    color: '#68717F',
    fontSize: 14,
    fontWeight: '600',
  },
  nextText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
