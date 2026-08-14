// Single blue accent in both themes per the product's brand rebrand (no second
// accent color) — only the neutral background/surface/text/border values flip
// between light and dark. WhatsApp's own button and the Featured gold below
// are deliberate carve-outs, fixed regardless of theme.
export const WHATSAPP_GREEN = '#25D366';

// Deliberately distinct from the app's own blue accent — Featured needs to
// read as a premium/paid distinction at a glance, not just "another blue
// thing," in both light and dark theme.
export const FEATURED_GOLD = '#F2A93B';
export const FEATURED_GOLD_DARK = '#B8790A';

export const lightColors = {
  background: '#ffffff',
  surface: '#ffffff',
  text: '#222222',
  heading: '#172B4D',
  textMuted: '#777777',
  border: '#eeeeee',
  inputBorder: '#dddddd',
  placeholderText: '#999999',
  backdrop: 'rgba(0,0,0,0.5)',
  bubbleTheirs: '#f0f0f0',
  bubbleTheirsText: '#222222',
  // Neutral gray, not the old mint green (#a8c9bd) left over from the
  // pre-rebrand green accent — that read as a deliberate "green button" in
  // an otherwise all-blue app rather than as an inert disabled state.
  disabled: '#c4c9d0',
  accent: '#0066FF',
  accentText: '#ffffff',
  danger: '#e0245e',
};

export const darkColors = {
  background: '#121212',
  surface: '#1c1c1e',
  text: '#f2f2f2',
  // Literal deep navy would be unreadable on a near-black background, so dark
  // mode keeps headings at the same bright neutral as body text instead.
  heading: '#f2f2f2',
  textMuted: '#9a9a9a',
  border: '#2c2c2e',
  inputBorder: '#3a3a3c',
  placeholderText: '#7a7a7a',
  backdrop: 'rgba(0,0,0,0.7)',
  bubbleTheirs: '#2a2a2c',
  bubbleTheirsText: '#f2f2f2',
  // Same reasoning as the light-theme value above — was #2f4a3f (a dark
  // green), now a neutral dark gray that reads as inert on near-black.
  disabled: '#3f4248',
  accent: '#0066FF',
  accentText: '#ffffff',
  danger: '#e0245e',
};
