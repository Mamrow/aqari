import { useState } from 'react';
import { I18nManager, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useT } from '../i18n/useT';
import { useThemeColors } from '../theme/useThemeColors';

// Icon + label keys only — the copy itself lives in translations.js like
// everything else, so this stays translatable rather than hardcoding English.
const SLIDES = [
  { key: 'browse', icon: 'map-outline', titleKey: 'onboardBrowseTitle', bodyKey: 'onboardBrowseBody' },
  { key: 'save', icon: 'heart-outline', titleKey: 'onboardSaveTitle', bodyKey: 'onboardSaveBody' },
  { key: 'contact', icon: 'chatbubbles-outline', titleKey: 'onboardContactTitle', bodyKey: 'onboardContactBody' },
  { key: 'list', icon: 'business-outline', titleKey: 'onboardListTitle', bodyKey: 'onboardListBody' },
];

export default function OnboardingScreen({ onDone }) {
  const t = useT();
  const colors = useThemeColors();
  const [index, setIndex] = useState(0);
  const isLast = index === SLIDES.length - 1;
  const slide = SLIDES[index];

  // Ionicons glyphs don't auto-mirror for RTL (same gotcha as
  // AdminApprovalsScreen's row chevron), so "next" picks its own direction.
  const nextIcon = I18nManager.isRTL ? 'chevron-back' : 'chevron-forward';

  // Renders one slide at a time from `index` rather than paging a
  // horizontal FlatList. The list version was genuinely buggy under RTL:
  // scrollToIndex and onViewableItemsChanged disagreed with each other about
  // index direction, so the dots and the Next/Get-started label drifted out
  // of sync with the slide actually on screen. With a single rendered slide
  // there is no scroll position to reconcile — `index` is the only source of
  // truth, which is correct in both directions by construction. Tradeoff:
  // no swipe gesture or slide animation, which is a normal pattern for a
  // short intro driven by a prominent Next button.
  const goNext = () => {
    if (isLast) {
      onDone();
      return;
    }
    setIndex(index + 1);
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.skipRow}>
        <Pressable onPress={onDone} hitSlop={10}>
          <Text style={[styles.skipText, { color: colors.textMuted }]}>{t('onboardSkip')}</Text>
        </Pressable>
      </View>

      <View style={styles.slide}>
        <View style={[styles.iconCircle, { backgroundColor: `${colors.accent}15` }]}>
          <Ionicons name={slide.icon} size={64} color={colors.accent} />
        </View>
        <Text style={[styles.title, { color: colors.heading }]}>{t(slide.titleKey)}</Text>
        <Text style={[styles.body, { color: colors.textMuted }]}>{t(slide.bodyKey)}</Text>
      </View>

      <View style={styles.footer}>
        <View style={styles.dotsRow}>
          {SLIDES.map((item, i) => (
            <View
              key={item.key}
              style={[
                styles.dot,
                { backgroundColor: i === index ? colors.accent : colors.border },
                i === index && styles.dotActive,
              ]}
            />
          ))}
        </View>

        <Pressable style={[styles.nextButton, { backgroundColor: colors.accent }]} onPress={goNext}>
          <Text style={[styles.nextText, { color: colors.accentText }]}>
            {isLast ? t('onboardGetStarted') : t('onboardNext')}
          </Text>
          {!isLast && <Ionicons name={nextIcon} size={18} color={colors.accentText} />}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  skipRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  skipText: { fontSize: 15, fontWeight: '600' },
  slide: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 36,
    gap: 12,
  },
  iconCircle: {
    width: 148,
    height: 148,
    borderRadius: 74,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  title: { fontSize: 24, fontWeight: '800', textAlign: 'center' },
  body: { fontSize: 15, lineHeight: 22, textAlign: 'center' },
  footer: { paddingHorizontal: 24, paddingBottom: 24, gap: 24 },
  dotsRow: { flexDirection: 'row', justifyContent: 'center', gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  dotActive: { width: 22 },
  nextButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 14,
    paddingVertical: 16,
  },
  nextText: { fontSize: 16, fontWeight: '700' },
});
