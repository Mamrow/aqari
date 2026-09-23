// Arabic numeral-noun agreement for "photo", same rule and same reason as
// pluralDays.js: 1 -> صورة (singular), 2 -> صورتان (dual), 3-10 -> صور
// (plural), 11+ -> صورة (singular tamyiz form again).
//
// Needed now that the photo minimum varies by property type — land asks for
// one, and "الحد الأدنى 1 صور" is simply wrong where "5 صور" was fine.
export function photoWord(count, language) {
  if (language !== 'ar') {
    return count === 1 ? 'photo' : 'photos';
  }
  if (count === 1) return 'صورة';
  if (count === 2) return 'صورتان';
  if (count >= 3 && count <= 10) return 'صور';
  return 'صورة';
}
