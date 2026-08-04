// Major Libyan cities a listing/filter can be tagged with, each with its own
// districts underneath (pick a city, then its districts). Coordinates are
// each place's real OSM point location (Nominatim, queried in Arabic — more
// reliable against OSM's Libya data than English transliterations).
// OpenStreetMap has no mapped polygon boundaries for any of these below the
// city level (checked directly via the Overpass API), so this is a plain
// list of center points, not shapes.
//
// Coverage is deliberately uneven: Tripoli is by far the best-mapped city in
// Libya's OSM data, Benghazi has decent neighbourhood-level coverage, and
// the rest (Sabha, Zawiya, Al Bayda, Tobruk, Sirte, Khoms, Zliten) only had
// verifiable city-center points, not real internal districts — no invented
// names were added just to fill the list. Add more here as real data turns
// up, following the same shape; labelKey must have a matching entry in
// translations.js.
export const CITIES = [
  { key: 'tripoli', labelKey: 'cityTripoli', latitude: 32.8872, longitude: 13.1913 },
  { key: 'benghazi', labelKey: 'cityBenghazi', latitude: 32.1200168, longitude: 20.0812174 },
  { key: 'misrata', labelKey: 'cityMisrata', latitude: 32.3745923, longitude: 15.0905803 },
  { key: 'sabha', labelKey: 'citySabha', latitude: 27.0364864, longitude: 14.4290398 },
  { key: 'zawiya', labelKey: 'cityZawiya', latitude: 32.7596665, longitude: 12.7355967 },
  { key: 'bayda', labelKey: 'cityBayda', latitude: 32.7609529, longitude: 21.7577175 },
  { key: 'tobruk', labelKey: 'cityTobruk', latitude: 32.0773764, longitude: 23.9599988 },
  { key: 'sirte', labelKey: 'citySirte', latitude: 31.2059625, longitude: 16.5836206 },
  { key: 'khoms', labelKey: 'cityKhoms', latitude: 32.6521830, longitude: 14.2680100 },
  { key: 'zliten', labelKey: 'cityZliten', latitude: 32.4675620, longitude: 14.5656400 },
];

// Pinned to the top of the city picker, in this order, ahead of the rest of
// CITIES (which sorts alphabetically after these) — the 4 biggest cities,
// most likely to actually be picked.
export const PRIORITY_CITY_KEYS = ['tripoli', 'benghazi', 'misrata', 'sabha'];

// Sorted by city here purely for source readability — both
// AddListingScreen.js and HomeMapScreen.js sort each city's districts
// alphabetically by the current language's translated label at render time
// (Arabic and English alphabetical order aren't the same), not by this
// array's order.
export const DISTRICTS = [
  // Tripoli
  { key: 'abu_salim', city: 'tripoli', labelKey: 'districtAbuSalim', latitude: 32.8495473, longitude: 13.1712207 },
  { key: 'ain_zara', city: 'tripoli', labelKey: 'districtAinZara', latitude: 32.7952137, longitude: 13.2869321 },
  { key: 'bab_ben_ghashir', city: 'tripoli', labelKey: 'districtBabBenGhashir', latitude: 32.8723335, longitude: 13.1956239 },
  { key: 'ben_ashour', city: 'tripoli', labelKey: 'districtBenAshour', latitude: 32.8830947, longitude: 13.1997824 },
  { key: 'dahra', city: 'tripoli', labelKey: 'districtDahra', latitude: 32.8900458, longitude: 13.1942888 },
  { key: 'fashloum', city: 'tripoli', labelKey: 'districtFashloum', latitude: 32.8888264, longitude: 13.2025519 },
  { key: 'gargaresh', city: 'tripoli', labelKey: 'districtGargaresh', latitude: 32.8681627, longitude: 13.1115155 },
  { key: 'ghout_shaal', city: 'tripoli', labelKey: 'districtGhoutShaal', latitude: 32.8528243, longitude: 13.0965673 },
  { key: 'gorji', city: 'tripoli', labelKey: 'districtGorji', latitude: 32.8662953, longitude: 13.1278719 },
  { key: 'hay_andalus', city: 'tripoli', labelKey: 'districtHayAndalus', latitude: 32.8751045, longitude: 13.1282512 },
  { key: 'hay_islami', city: 'tripoli', labelKey: 'districtHayIslami', latitude: 32.8487252, longitude: 13.1199083 },
  { key: 'janzour', city: 'tripoli', labelKey: 'districtJanzour', latitude: 32.8254462, longitude: 13.0262526 },
  { key: 'kremia', city: 'tripoli', labelKey: 'districtKremia', latitude: 32.7751455, longitude: 13.0834242 },
  { key: 'mizran', city: 'tripoli', labelKey: 'districtMizran', latitude: 32.8874054, longitude: 13.1830838 },
  { key: 'nawfaliyeen', city: 'tripoli', labelKey: 'districtNawfaliyeen', latitude: 32.8887606, longitude: 13.2162125 },
  { key: 'old_city', city: 'tripoli', labelKey: 'districtOldCity', latitude: 32.8973286, longitude: 13.1772779 },
  { key: 'qasr_bin_ghashir', city: 'tripoli', labelKey: 'districtQasrBinGhashir', latitude: 32.8437768, longitude: 13.2053968 },
  { key: 'ras_hassan', city: 'tripoli', labelKey: 'districtRasHassan', latitude: 32.8699034, longitude: 13.2095390 },
  { key: 'sawani', city: 'tripoli', labelKey: 'districtSawani', latitude: 32.8507787, longitude: 13.1431199 },
  { key: 'serraj', city: 'tripoli', labelKey: 'districtSerraj', latitude: 32.8329312, longitude: 13.0816378 },
  { key: 'sidi_masri', city: 'tripoli', labelKey: 'districtSidiMasri', latitude: 32.8692191, longitude: 13.2106863 },
  { key: 'siyahiya', city: 'tripoli', labelKey: 'districtSiyahiya', latitude: 32.8545352, longitude: 13.0724249 },
  { key: 'souq_juma', city: 'tripoli', labelKey: 'districtSouqJuma', latitude: 32.8833769, longitude: 13.2570714 },
  { key: 'tajura', city: 'tripoli', labelKey: 'districtTajura', latitude: 32.8834447, longitude: 13.3525476 },
  { key: 'zanata', city: 'tripoli', labelKey: 'districtZanata', latitude: 32.8633454, longitude: 13.2304714 },
  { key: 'zawiyat_dahmani', city: 'tripoli', labelKey: 'districtZawiyatDahmani', latitude: 32.8936513, longitude: 13.2075290 },

  // Benghazi
  { key: 'baraka', city: 'benghazi', labelKey: 'districtBaraka', latitude: 32.0973959, longitude: 20.0745004 },
  { key: 'sabri', city: 'benghazi', labelKey: 'districtSabri', latitude: 32.1383316, longitude: 20.0835363 },
  { key: 'qaryounis', city: 'benghazi', labelKey: 'districtQaryounis', latitude: 32.0464862, longitude: 20.0417797 },
  { key: 'fuwayhat', city: 'benghazi', labelKey: 'districtFuwayhat', latitude: 32.0762932, longitude: 20.0875903 },
  { key: 'salmani_gharbi', city: 'benghazi', labelKey: 'districtSalmaniGharbi', latitude: 32.1141150, longitude: 20.0908616 },

  // Misrata
  { key: 'qasr_ahmed', city: 'misrata', labelKey: 'districtQasrAhmed', latitude: 32.3718900, longitude: 15.1986150 },
];
