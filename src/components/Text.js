import { StyleSheet, Text as RNText } from 'react-native';

/**
 * React Native's Text, starting at the reading edge: the right in Arabic, the
 * left in English. Every screen imports Text from here, not from react-native.
 *
 * Text with no textAlign follows the platform default, and iOS resolves that
 * from the phone's own language, not the app's. On an English-language iPhone
 * running the app in Arabic, every heading and paragraph that didn't set an
 * alignment sat on the left of an otherwise right-to-left screen.
 *
 * 'left' is the reading start on both platforms. iOS swaps left and right when
 * the layout is RTL (RCTAttributedTextUtils.mm); Android treats 'left' as the
 * paragraph start, which is already its default. So this changes nothing in
 * English or on Android, and puts Arabic on the right on iPhone. A style that
 * sets its own textAlign (centred text, a counter at the reading end with
 * 'right') still wins, because it comes after this one.
 *
 * Never write isRTL ? 'right' : 'left': it comes out backwards on both
 * platforms. See the RTL note in CLAUDE.md. TextInput isn't wrapped; it keeps
 * the physical side and is handled where it's used.
 */
export default function Text({ style, ...props }) {
  return <RNText style={[styles.readingStart, style]} {...props} />;
}

const styles = StyleSheet.create({
  readingStart: { textAlign: 'left' },
});
