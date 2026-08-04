// Arabic-Indic (٠-٩) and Extended Arabic-Indic/Persian (۰-۹) digits mapped to
// plain ASCII 0-9 — agents typing on an Arabic keyboard often get these instead
// of ASCII digits, but prices/areas/phone numbers need ASCII for Number()
// parsing, storage, and things like tel:/wa.me links.
const ARABIC_INDIC = '٠١٢٣٤٥٦٧٨٩';
const EXTENDED_ARABIC_INDIC = '۰۱۲۳۴۵۶۷۸۹';

export function toEnglishDigits(value) {
  return value.replace(/[٠-٩۰-۹]/g, (char) => {
    const arabicIndex = ARABIC_INDIC.indexOf(char);
    if (arabicIndex !== -1) return String(arabicIndex);
    return String(EXTENDED_ARABIC_INDIC.indexOf(char));
  });
}
