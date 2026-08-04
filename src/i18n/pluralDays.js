// Standard Arabic numeral-noun agreement for "day": 1 -> يوم (singular),
// 2 -> يومان (dual), 3-10 -> أيام (plural), 11+ -> يوم (singular tamyiz
// form again) — not a stylistic choice, this is the actual MSA grammar
// rule, so every {days}-count string needs the word itself to vary with
// the count, not just the numeral.
export function dayWord(count, language) {
  if (language !== 'ar') {
    return count === 1 ? 'day' : 'days';
  }
  if (count === 1) return 'يوم';
  if (count === 2) return 'يومان';
  if (count >= 3 && count <= 10) return 'أيام';
  return 'يوم';
}
