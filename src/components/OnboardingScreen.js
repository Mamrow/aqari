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

  // Fixed at the leading corner (opposite Next, which is fixed at the
  // trailing corner below) — deliberately not next to Next, so it can't be
  // fat-fingered when reaching for Next. Only rendered once there's
  // somewhere to go back to.
  const backButton = index > 0 ? (
    <Pressable
      style={({ pressed }) => [
        styles.backButtonFixed,
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
          {/* left/right are auto-mirrored for RTL by RN itself (they map to
              start/end at the native layer whenever I18nManager.isRTL is on —
              see RCTShadowView.m / LayoutShadowNode.java's doLeftAndRightSwapInRTL).
              Always using the plain "left" value here and letting that
              happen is correct for a trailing/leading-corner element like
              this one — brandLockup/skipButton/nextButtonFixed/
              backButtonFixed all rely on exactly this, unconditionally, with
              no isRTL branch. copyBlock below is the one exception: it wants
              the *same* physical side in both languages (not the opposite
              corner), which needs the opposite style key per language
              specifically to counteract this same auto-mirror — see its own
              comment. */}
          <View style={[styles.brandLockup, styles.brandLTR]}>
            <RNImage
              source={require('../../assets/onboarding/onboarding-brand.png')}
              style={styles.brandImage}
              resizeMode="contain"
              accessibilityRole="image"
              accessibilityLabel="Aqari"
            />
          </View>
          {isLast ? (
              <View style={[styles.skipButtonPlaceholder, styles.skipLTR]} />
          ) : (
            <Pressable
              onPress={onDone}
              style={({ pressed }) => [
                styles.skipButton,
                styles.skipLTR,
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

        {/* English: untouched from the original design — copyBlock +
            copyBlockLTR, one absolute box pinned at left:20/width:76%.
            Nothing about this path should ever change for an Arabic-only
            fix; three earlier attempts at a "shared" structure for both
            languages each ended up moving English too (most recently:
            English text dropping down into the footer buttons), which is
            exactly the kind of collateral damage a single shared path
            risks. Keeping the two languages on fully separate JSX branches
            here is deliberate, not an oversight. */}
        {isRTL ? (
          // Arabic: absolute left:0/right:0 (both true screen edges —
          // unambiguous, nothing to mirror on that part), and everything
          // inside stated in direction-relative terms only.
          //
          // An earlier version leaned on RTL auto-mirroring —
          // alignItems:'flex-start' and textAlign:'left', which really do
          // render visually-right on Android under Fabric. They don't do the
          // same thing on iOS, where the copy came out drifting toward the
          // middle instead of hugging the right edge. Mirroring behaviour is
          // the part that differs between the platforms, so the fix is to
          // stop depending on it at all:
          //
          //   * paddingStart/paddingEnd are resolved once from the writing
          //     direction, identically on both platforms — no mirroring step
          //     to disagree about. paddingEnd carries the design's gap to the
          //     far edge; paddingStart is the 20pt margin the text hugs.
          //   * textAlign:'auto' aligns from the text's own direction, so
          //     Arabic lands right and English lands left without either
          //     platform having to flip a physical value.
          //
          // Don't reintroduce 'left'/'right'/'flex-start' here. They can look
          // correct on whichever platform you happen to test on and be
          // backwards on the other one.
          <View style={[styles.copyBlockBandRTL]}>
            <View style={[styles.copyBlockInner, { direction: 'rtl', writingDirection: 'rtl' }]}>
              <Text style={[styles.title, styles.titleRTL, { writingDirection: 'rtl', direction: 'rtl' }]}>
                {displayCopy(slide.titleKey)}
              </Text>
              <Text
                numberOfLines={3}
                style={[styles.body, styles.bodyRTL, { writingDirection: 'rtl', direction: 'rtl' }]}
              >
                {displayCopy(slide.bodyKey)}
              </Text>
            </View>
          </View>
        ) : (
          <View
            style={[styles.copyBlock, styles.copyBlockLTR, { direction: 'ltr', writingDirection: 'ltr' }]}
          >
            <Text style={[styles.title, { textAlign: 'left', writingDirection: 'ltr', direction: 'ltr' }]}>
              {displayCopy(slide.titleKey)}
            </Text>
            <Text
              numberOfLines={3}
              style={[styles.body, { textAlign: 'left', writingDirection: 'ltr', direction: 'ltr' }]}
            >
              {displayCopy(slide.bodyKey)}
            </Text>
          </View>
        )}

        <View style={styles.footer}>
          <View style={styles.footerRow}>
            {backButton}

            {/* Fixed width/position regardless of index — it must never
                shift, or a user's next tap for the same corner they used
                on the previous slide can accidentally land on the newly
                appeared Back button (or vice versa). */}
            <Pressable
              style={({ pressed }) => [
                styles.nextButtonFixed,
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
  skipText: {
    color: ONBOARDING_NAVY,
    fontSize: 15,
    fontWeight: '400',
  },
  // Anchored to the bottom rather than 72% down the screen. A percentage
  // from the top assumes the copy is always about one title line tall, which
  // holds in Arabic and doesn't in English — "Browse properties" wraps to two
  // lines on a phone, pushing the body text underneath the Next button.
  // Measuring up from the footer instead means the gap above the buttons is
  // the same whatever the copy does.
  copyBlock: {
    position: 'absolute',
    bottom: 104,
    width: '76%',
    zIndex: 6,
  },
  copyBlockLTR: {
    left: 20,
  },
  // Arabic-only band: both edges pinned (left:0/right:0), with the inset from
  // each side expressed as start/end rather than left/right so it resolves the
  // same way on both platforms. paddingEnd is the design's gap to the far
  // edge — what the old width:'76%' column used to provide, minus the
  // dependency on alignItems mirroring to place it.
  copyBlockBandRTL: {
    position: 'absolute',
    bottom: 104,
    left: 0,
    right: 0,
    paddingStart: 20,
    paddingEnd: '24%',
    zIndex: 6,
  },
  // Full width of what the band leaves, so title and body share one edge by
  // construction rather than by coincidence.
  copyBlockInner: {
    width: '100%',
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
    // 'auto' aligns from the text's own direction — right for Arabic — on
    // both platforms. See the comment where copyBlockBandRTL is applied.
    textAlign: 'auto',
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
    textAlign: 'auto',
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 22,
    paddingHorizontal: 20,
    zIndex: 7,
  },
  // Purely a positioning frame now — dots/backButton/nextButtonFixed are all
  // position:absolute within it (fixed corners instead of flex order), so
  // there's no row layout left to auto-mirror here.
  footerRow: {
    position: 'relative',
    width: '100%',
    minHeight: 60,
  },
  // Fixed at the trailing corner (right, auto-mirrored to left for RTL) —
  // same position/width on every slide regardless of whether Back is showing.
  nextButtonFixed: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: '46%',
    minHeight: 60,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 30,
    paddingHorizontal: 16,
  },
  // Fixed at the leading corner (left, auto-mirrored to right for RTL) —
  // the opposite corner from Next, on purpose (see the comment where this
  // is rendered).
  backButtonFixed: {
    position: 'absolute',
    left: 0,
    top: 4,
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
