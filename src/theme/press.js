// One press state for every button in the app, so a tap feels the same
// wherever it happens.
//
// Opacity rather than a scale/spring animation, for two reasons. It needs no
// layout pass, so it lands on the first frame of the touch instead of a beat
// later — the lag is exactly what makes a button feel unresponsive. And it
// composes with whatever the button already looks like: these are spread into
// an existing style array, so a filled button, an outlined one and a whole
// listing card all dim by the same amount without any of them needing a
// bespoke pressed variant.
//
// Used as the last entry of a Pressable's style array:
//
//   style={({ pressed }) => [styles.button, pressed && pressedStyle]}
//
// 0.6 is the same value UIKit settles on for a tapped bar button. Lighter
// than that and the feedback is invisible on a pale surface; heavier and a
// scrolling list flickers, because a press fires before the scroll gesture
// wins and cancels it.
export const PRESSED_OPACITY = 0.6;

export const pressedStyle = { opacity: PRESSED_OPACITY };
