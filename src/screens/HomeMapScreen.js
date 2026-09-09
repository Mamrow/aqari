import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  FlatList,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
// Apple Maps on iOS, MapLibre + MapTiler on Android. Metro picks the right
// implementation from the .ios.js / .android.js pair, so nothing here — and
// nothing in the two other map screens — branches on Platform itself. Both
// sides share the same props, the same ref API (`centerOn`), the same
// supercluster index and the same marker components, so the two platforms
// cluster identically and the pins are pixel-identical; only the map
// underneath differs. See src/components/map/.
import ListingsMap from '../components/map/ListingsMap';
import * as Location from 'expo-location';
import { useAppContext } from '../context/AppContext';
import ListingCard from '../components/ListingCard';
import PlaceholderScreen from '../components/PlaceholderScreen';
import LoadingView from '../components/LoadingView';
import StatusScreen from '../components/StatusScreen';
import { friendlyErrorMessage } from '../utils/friendlyError';
import SearchBar from '../components/SearchBar';
import MultiSlider from '@ptomasroos/react-native-multi-slider';
import { CITIES, DISTRICTS, PRIORITY_CITY_KEYS } from '../data/districts';
import {
  LISTING_TYPES,
  PROPERTY_TYPES,
  AUDIENCE_OPTIONS,
  CHALET_PROPERTY_TYPE,
  LISTING_TYPE_LABEL_KEYS,
  PROPERTY_TYPE_LABEL_KEYS,
  AUDIENCE_LABEL_KEYS,
} from '../data/propertyTypes';
import { useT } from '../i18n/useT';
import { useThemeColors } from '../theme/useThemeColors';
import { FEATURED_GOLD } from '../theme/colors';
import { BOOST_PURCHASES_ENABLED } from '../config/features';

const FEATURED_CARD_WIDTH = 160;
const FEATURED_CARD_GAP = 12;
// Continuous-drift speed, not a per-card jump interval — see the auto-scroll
// effect below. Slow on purpose: a card (160px + 12px gap) takes ~7s to
// drift by at this rate. Tick is 100ms, not the original 50ms — same speed
// (increment is scaled to match), but half as many scrollToOffset/bridge
// calls per second, which is what was making a light tap sometimes lose to
// the scroll view's own gesture recognition and occasionally showing a
// laggy "catch up" jump under any JS-thread pressure.
const FEATURED_SCROLL_SPEED = 25; // px/second
const FEATURED_SCROLL_TICK_MS = 100;


// Slider bounds for the price filter — the ends of the range stand in for
// "no lower/upper bound" (same meaning the old empty-string min/max had),
// so listings above PRICE_MAX still show up when the upper thumb is left at
// the max. Round LYD figure, not derived from live listing data, so it
// doesn't shift under a user's feet as new listings come in.
const PRICE_MIN = 0;
const PRICE_MAX = 2000000;
const PRICE_STEP = 5000;
// pickerModalBackdrop has 32px padding each side, pickerModalCard has 16px
// padding each side, and the slider thumbs need a little breathing room of
// their own so they don't clip against the card edge mid-drag.
const SLIDER_WIDTH = Dimensions.get('window').width - 32 * 2 - 16 * 2 - 24;

// List-view-only sort options — map view has no meaningful sort order (pin
// position is spatial), so this never affects marker iteration. 'featured'
// is the default/floor: featured listings always lead regardless of which
// sort is picked, this only reorders within each of those two groups.
const SORT_OPTIONS = ['featured', 'priceAsc', 'priceDesc', 'newest', 'areaDesc'];
const SORT_LABEL_KEYS = {
  featured: 'sortFeatured',
  priceAsc: 'sortPriceAsc',
  priceDesc: 'sortPriceDesc',
  newest: 'sortNewest',
  areaDesc: 'sortAreaDesc',
};

// The whole country, not just Tripoli metro — the app now covers Benghazi,
// Misrata, Sabha, and more (see data/districts.js), so someone opening the
// app from any of those should still get their real location, not get
// silently forced back to Tripoli. Only zooming to the device's real GPS
// position when it falls inside this box is what stops the map opening on a
// user's actual location if they're browsing from genuinely overseas.
const LIBYA_BOUNDS = { minLat: 19.5, maxLat: 33.2, minLon: 9.3, maxLon: 25.2 };

// Shared by every filter modal below (and mirrored in AuthModal) — "end",
// not "right", so it lands top-right in English and top-left in Arabic on
// its own, no isRTL branch needed.
// isRTL branches explicitly to a literal left/right — no "end", no relying
// on the app-wide native RTL auto-mirror. A Modal mounts its content into a
// separate native root, which doesn't reliably inherit either of those, so
// this is the one spot on the screen that has to pick its own side.
/**
 * One row of the filter menu: what the facet is, what it's currently set to,
 * and a chevron into its picker. The value is coloured when it's an actual
 * choice rather than the default, so a glance down the sheet shows what's
 * been narrowed without reading every line.
 */
function FilterFacetRow({ label, value, active, colors, filterAccent, isRTL, onPress }) {
  const textAlign = isRTL ? 'right' : 'left';
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}`}
      style={({ pressed }) => [
        styles.facetRow,
        { borderBottomColor: colors.border },
        pressed && { opacity: 0.6 },
      ]}
    >
      <View style={styles.facetTextBlock}>
        <Text style={[styles.facetLabel, { color: colors.text, textAlign }]}>{label}</Text>
        <Text
          style={[
            styles.facetValue,
            { color: active ? filterAccent : colors.textMuted, textAlign },
          ]}
          numberOfLines={1}
        >
          {value}
        </Text>
      </View>
      <Ionicons
        name={isRTL ? 'chevron-back' : 'chevron-forward'}
        size={18}
        color={colors.textMuted}
      />
    </Pressable>
  );
}

function ModalCloseButton({ onPress, colors, label, isRTL }) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={10}
      style={[styles.pickerModalCloseButton, isRTL ? styles.pickerModalCloseButtonRTL : styles.pickerModalCloseButtonLTR]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Ionicons name="close" size={20} color={colors.textMuted} />
    </Pressable>
  );
}

// Deliberately isolated from HomeMapScreen's own state/re-render cycle.
// MultiSlider's onValuesChange fires on every pixel of drag; wiring that
// straight to HomeMapScreen's minPrice/maxPrice state re-rendered the whole
// screen — live MapView included — dozens of times a second while dragging,
// which is what fed react-native-map-clustering into React's own "Maximum
// update depth exceeded" crash. Keeping the live drag position in this
// component's own state means dragging never touches HomeMapScreen at all;
// the real minPrice/maxPrice only updates once, via onApply, when the user
// actually confirms.
function PriceRangeModal({ visible, onClose, minPrice, maxPrice, onApply, colors, t, isRTL }) {
  const [draftMin, setDraftMin] = useState(minPrice);
  const [draftMax, setDraftMax] = useState(maxPrice);

  // Re-sync the draft to the committed values on every open — covers both a
  // fresh open and a Clear that happened while this modal stayed mounted.
  useEffect(() => {
    if (visible) {
      setDraftMin(minPrice);
      setDraftMax(maxPrice);
    }
  }, [visible, minPrice, maxPrice]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
      navigationBarTranslucent
    >
      <Pressable style={[styles.pickerModalBackdrop, { backgroundColor: colors.backdrop }]} onPress={onClose}>
        <Pressable style={[styles.pickerModalCard, { backgroundColor: colors.surface }]} onPress={() => {}}>
          <ModalCloseButton onPress={onClose} colors={colors} label={t('close')} isRTL={isRTL} />
          <Text style={[styles.pickerModalTitle, { color: colors.text, textAlign: isRTL ? 'right' : 'left' }]}>
            {t('priceFilterLabel')}
          </Text>
          <View style={styles.priceValueRow}>
            <Text style={[styles.priceValueText, { color: colors.text }]}>
              {draftMin.toLocaleString('en-US')}
            </Text>
            <Text style={[styles.priceInputSeparator, { color: colors.textMuted }]}>—</Text>
            <Text style={[styles.priceValueText, { color: colors.text }]}>
              {draftMax >= PRICE_MAX ? `${PRICE_MAX.toLocaleString('en-US')}+` : draftMax.toLocaleString('en-US')}
            </Text>
          </View>
          <View style={styles.priceSliderWrap}>
            <MultiSlider
              values={[draftMin, draftMax]}
              min={PRICE_MIN}
              max={PRICE_MAX}
              step={PRICE_STEP}
              sliderLength={SLIDER_WIDTH}
              onValuesChange={([nextMin, nextMax]) => {
                setDraftMin(nextMin);
                setDraftMax(nextMax);
              }}
              allowOverlap={false}
              snapped
              selectedStyle={{ backgroundColor: colors.accent }}
              unselectedStyle={{ backgroundColor: colors.inputBorder }}
              markerStyle={{
                backgroundColor: colors.accent,
                borderWidth: 0,
                height: 22,
                width: 22,
              }}
              pressedMarkerStyle={{ height: 26, width: 26 }}
              containerStyle={styles.priceSliderContainer}
              trackStyle={styles.priceSliderTrack}
            />
          </View>
          <View style={styles.priceButtonRow}>
            <Pressable
              style={[styles.priceClearButton, { borderColor: colors.inputBorder }]}
              onPress={() => {
                setDraftMin(PRICE_MIN);
                setDraftMax(PRICE_MAX);
              }}
            >
              <Text style={[styles.priceClearButtonText, { color: colors.textMuted }]}>
                {t('clearFilter')}
              </Text>
            </Pressable>
            <Pressable
              style={[styles.priceApplyButton, { backgroundColor: colors.accent }]}
              onPress={() => {
                onApply(draftMin, draftMax);
                onClose();
              }}
            >
              <Text style={[styles.priceApplyButtonText, { color: colors.accentText }]}>
                {t('applyFilter')}
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export default function HomeMapScreen({ navigation }) {
  const { listings, blockedSellers, theme, dataLoading, dataErrors, fetchListings, language } =
    useAppContext();
  const t = useT();
  const isRTL = language === 'ar';
  // Sorted by the currently displayed label, not by the fixed key order in
  // districts.js — Arabic and English alphabetical order aren't the same,
  // so this can't be a single hardcoded order.
  const localeSort = (a, b) =>
    t(a.labelKey).localeCompare(t(b.labelKey), language === 'ar' ? 'ar' : 'en');
  // The 4 biggest cities pinned first (in PRIORITY_CITY_KEYS order), then
  // everything else alphabetically by translated label.
  const sortedCities = [...CITIES].sort((a, b) => {
    const ai = PRIORITY_CITY_KEYS.indexOf(a.key);
    const bi = PRIORITY_CITY_KEYS.indexOf(b.key);
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    return localeSort(a, b);
  });
  const colors = useThemeColors();
  const filterAccent = theme === 'dark' ? '#66A3FF' : colors.accent;
  const insets = useSafeAreaInsets();
  const [viewMode, setViewMode] = useState('map'); // 'map' | 'list'
  // Viewport tracking and clustering now live inside ListingsMap — each
  // platform's map reports its viewport differently, so that stayed with the
  // implementation rather than leaking up here. All this screen needs back is
  // `centerOn`, for the one-time GPS recenter below.
  const mapRef = useRef(null);
  // Only turns on once we've confirmed the device's real GPS fix is inside
  // Libya — stays off for denied permission, a fix outside Libya, or before
  // the one-time location effect below has resolved.
  const [showsUserLocation, setShowsUserLocation] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [listingType, setListingType] = useState('sale');
  const [selectedPropertyTypes, setSelectedPropertyTypes] = useState([]);
  const [propertyTypePickerVisible, setPropertyTypePickerVisible] = useState(false);
  // Numeric, not string state — the price filter is a drag-only slider now,
  // there's no typed digit input to normalize with toEnglishDigits anymore.
  // PRICE_MIN/PRICE_MAX at the ends of the range mean "no bound", same as
  // the old empty-string min/max did.
  const [minPrice, setMinPrice] = useState(PRICE_MIN);
  const [maxPrice, setMaxPrice] = useState(PRICE_MAX);
  const [priceFilterVisible, setPriceFilterVisible] = useState(false);
  const [cityFilter, setCityFilter] = useState('all');
  const [districtFilter, setDistrictFilter] = useState('all');
  // One combined modal instead of two separate popups: picking a city moves
  // to the district step in the same modal (rather than closing it), so
  // choosing a location reads as one continuous menu — "all of this city"
  // is just the first option of that second step, not a whole separate pill.
  const [locationFilterVisible, setLocationFilterVisible] = useState(false);
  const [locationFilterStep, setLocationFilterStep] = useState('city'); // 'city' | 'district'
  // Reopening with a city already picked lands back on that city's
  // district step, not the top-level city list — changing your mind about
  // the district shouldn't require re-picking the city first.
  const openLocationFilter = () => {
    setLocationFilterStep(cityFilter !== 'all' ? 'district' : 'city');
    setLocationFilterVisible(true);
  };
  // Picking a place moves the map to it. Filtering alone used to leave the
  // camera wherever it was, so choosing Benghazi from a map of Tripoli
  // emptied the screen — the listings matched the filter, they were just
  // 600km outside the viewport, which reads as "the filter broke".
  //
  // Ceilings, not targets — moveTo only zooms out to them, never in, so
  // picking a place slides the map across rather than diving into it.
  // Standard 256px-tile scale (see MAPLIBRE_ZOOM_OFFSET).
  const CITY_ZOOM = 11.5;
  const DISTRICT_ZOOM = 13;

  const handleCityFilterChange = (key) => {
    setCityFilter(key);
    setDistrictFilter('all');
    if (key === 'all') {
      setLocationFilterVisible(false);
      return;
    }
    const city = CITIES.find((item) => item.key === key);
    if (city) mapRef.current?.moveTo(city.latitude, city.longitude, CITY_ZOOM);

    const hasDistricts = DISTRICTS.some((item) => item.city === key);
    if (hasDistricts) {
      setLocationFilterStep('district');
    } else {
      setLocationFilterVisible(false);
    }
  };
  const handleDistrictFilterChange = (key) => {
    setDistrictFilter(key);
    setLocationFilterVisible(false);
    if (key === 'all') {
      // Back to the whole city rather than staying zoomed into whichever
      // district was showing.
      const city = CITIES.find((item) => item.key === cityFilter);
      if (city) mapRef.current?.moveTo(city.latitude, city.longitude, CITY_ZOOM);
      return;
    }
    const district = DISTRICTS.find((item) => item.key === key);
    if (district) {
      mapRef.current?.moveTo(district.latitude, district.longitude, DISTRICT_ZOOM);
    }
  };
  const [audienceFilter, setAudienceFilter] = useState('all');
  const [filterSheetVisible, setFilterSheetVisible] = useState(false);
  const [audiencePickerVisible, setAudiencePickerVisible] = useState(false);
  const [sortBy, setSortBy] = useState('featured');
  const [sortPickerVisible, setSortPickerVisible] = useState(false);
  // Real measured height of the floating topBar, not a hardcoded guess — the
  // filter pill row's actual height varies (wraps to a second line once a
  // long-enough label like "Price: Low to High" no longer fits, vs. staying
  // on one line for "Default"/"All"), so a fixed offset for the content
  // below it was either too much (awkward gap) or too little (overlap)
  // depending on which filter/sort label happened to be active. Starts at 0
  // before the first layout pass; self-corrects on the next render, same
  // "brief flash while it settles" tradeoff already accepted elsewhere on
  // this screen (e.g. the captured price-pin images).
  const [topBarHeight, setTopBarHeight] = useState(0);
  const districtsForCityFilter =
    cityFilter === 'all' ? [] : [...DISTRICTS.filter((item) => item.city === cityFilter)].sort(localeSort);
  const [searchQuery, setSearchQuery] = useState('');

  // Switching Sale/Rent resets the secondary filters — a property-type/audience
  // choice made under one purpose isn't necessarily meaningful under the other.
  const handleListingTypeChange = (type) => {
    setListingType(type);
    setSelectedPropertyTypes([]);
    setAudienceFilter('all');
  };
  // Istiraha rentals get an extra audience sub-filter (Families/Youth) — that
  // distinction is specific to renting a chalet short-term, not buying one.
  const showAudienceFilter = listingType === 'rent' && selectedPropertyTypes.includes(CHALET_PROPERTY_TYPE);
  const formatFilterSummary = (category, values) => {
    const selected = values.filter(Boolean);
    if (selected.length === 0) return category;
    if (selected.length === 1) return selected[0];
    return `${category} ${selected.length.toLocaleString(language === 'ar' ? 'ar' : 'en')}`;
  };
  // Its own format, not formatFilterSummary — "Properties" (not "Property
  // Type") when nothing's picked, the type name itself for exactly one, and
  // "Type: 3" (not "Property Type 3") once 2+ are selected.
  const propertyTypeSummary =
    selectedPropertyTypes.length === 0
      ? t('propertiesLabel')
      : selectedPropertyTypes.length === 1
        ? t(PROPERTY_TYPE_LABEL_KEYS[selectedPropertyTypes[0]])
        : `${t('propertyTypeShortLabel')}: ${selectedPropertyTypes.length.toLocaleString(
            language === 'ar' ? 'ar' : 'en'
          )}`;
  const priceSummary = formatFilterSummary(
    t('priceFilterLabel'),
    minPrice > PRICE_MIN || maxPrice < PRICE_MAX
      ? [
          `${minPrice.toLocaleString('en-US')} - ${
            maxPrice >= PRICE_MAX ? '∞' : maxPrice.toLocaleString('en-US')
          }`,
        ]
      : []
  );
  const locationSummary = formatFilterSummary(
    t('cityLabel'),
    cityFilter === 'all'
      ? []
      : [
          districtFilter === 'all'
            ? t(CITIES.find((item) => item.key === cityFilter)?.labelKey)
            : t(DISTRICTS.find((item) => item.key === districtFilter)?.labelKey),
        ]
  );
  const sortSummary = formatFilterSummary(
    t('sortLabel'),
    sortBy === 'featured' ? [] : [t(SORT_LABEL_KEYS[sortBy])]
  );

  // What the badge on the Filters button counts: only choices the user
  // actively made, so the default state shows no badge at all. Sort only
  // counts in list view, where it's the only place it has any effect.
  const activeFilterCount =
    (selectedPropertyTypes.length > 0 ? 1 : 0) +
    (cityFilter !== 'all' ? 1 : 0) +
    (minPrice > PRICE_MIN || maxPrice < PRICE_MAX ? 1 : 0) +
    (showAudienceFilter && audienceFilter !== 'all' ? 1 : 0) +
    (viewMode === 'list' && sortBy !== 'featured' ? 1 : 0);

  const clearAllFilters = () => {
    setSelectedPropertyTypes([]);
    setCityFilter('all');
    setDistrictFilter('all');
    setMinPrice(PRICE_MIN);
    setMaxPrice(PRICE_MAX);
    setAudienceFilter('all');
    setSortBy('featured');
  };

  // Buyer-facing map/list only ever shows admin-approved listings, filtered by
  // purpose + type — featured ones are pinned to the top of that same list
  // (not a separate section) via the sort below.
  const filteredListings = listings
    .filter((listing) => {
      if (listing.status !== 'approved' || listing.listingType !== listingType) return false;
      if (blockedSellers.includes(listing.agentId)) return false;
      // Sold/rented is excluded the same way expired is — gone from buyer
      // browsing regardless of which one, just for a different reason.
      if (listing.listingState === 'expired' || listing.listingState === 'sold') return false;
      if (selectedPropertyTypes.length > 0 && !selectedPropertyTypes.includes(listing.propertyType)) return false;
      if (minPrice > PRICE_MIN && listing.price < minPrice) return false;
      if (maxPrice < PRICE_MAX && listing.price > maxPrice) return false;
      if (cityFilter !== 'all' && listing.city !== cityFilter) return false;
      if (districtFilter !== 'all' && listing.district !== districtFilter) return false;
      if (showAudienceFilter && audienceFilter !== 'all' && listing.audienceTarget !== audienceFilter) {
        return false;
      }
      if (searchQuery.trim() && !listing.title.toLowerCase().includes(searchQuery.trim().toLowerCase())) {
        return false;
      }
      return true;
    })
    // Featured stays the floor regardless of sortBy — only reorders within
    // each of the two featured/non-featured groups. 'featured' itself picks
    // no secondary order (0), same as the original behavior before sorting
    // was added.
    .sort((a, b) => {
      if (a.isFeatured !== b.isFeatured) return a.isFeatured ? -1 : 1;
      switch (sortBy) {
        case 'priceAsc':
          return a.price - b.price;
        case 'priceDesc':
          return b.price - a.price;
        case 'newest':
          return new Date(b.createdAt) - new Date(a.createdAt);
        case 'areaDesc':
          return b.area - a.area;
        default:
          return 0;
      }
    });

  // Map view's own bottom carousel — independent of the sale/rent/type
  // filters above, same as the list view's featured-first sort.
  // Matches the currently selected Sale/Rent tab — mixing both together in
  // the same carousel made it unclear which purpose a featured card was for.
  const featuredListings = listings.filter(
    (listing) =>
      listing.status === 'approved' &&
      listing.listingState !== 'expired' &&
      listing.listingState !== 'sold' &&
      listing.isFeatured &&
      listing.listingType === listingType
  );
  const featuredListRef = useRef(null);
  // Rendered 2x back-to-back — the minimum that keeps the wrap seamless
  // (there's always one full copy's width still ahead when the reset
  // happens, so it lands on pixel-identical content instead of a visible
  // jump-cut). Kept to 2, not 3: if you drag manually past the copy
  // boundary, onScrollEndDrag/onMomentumScrollEnd below silently normalizes
  // the resting position back into the first copy's range, so there's never
  // a dead end and nothing keeps showing duplicated content once you let go.
  const featuredLoopData =
    featuredListings.length > 1 ? [...featuredListings, ...featuredListings] : featuredListings;
  const featuredScrollXRef = useRef(0);
  // Paused for the whole duration of any touch contact — not just a
  // confirmed drag — so the drift can never fight a tap. Without this, the
  // content could shift by a pixel or two under a finger that's just
  // resting to tap a card, which is enough for the tap gesture to read as a
  // scroll and get swallowed instead of opening the listing.
  const featuredDraggingRef = useRef(false);
  // Guards every scrollToOffset call (both below) until the FlatList has
  // actually measured its content at least once. Calling scrollToOffset
  // before that — which the old code did immediately on mount via the
  // listingType effect below — is what RN's own
  // "scrollToOffset may not be called in RTL before content is laid out"
  // warning is about, and in Arabic (RTL) it wasn't just a harmless
  // console warning: the offset it computed before layout was wrong, which
  // is what made the carousel occasionally lag then jump/"glitch."
  const featuredCarouselReadyRef = useRef(false);

  const oneSetWidth = featuredListings.length * (FEATURED_CARD_WIDTH + FEATURED_CARD_GAP);

  // Switching Sale/Rent swaps in a different (often shorter) filtered list —
  // without this, the carousel could be left scrolled past the end of the
  // new list, or drifting from a stale offset that no longer matches it.
  useEffect(() => {
    featuredScrollXRef.current = 0;
    if (!featuredCarouselReadyRef.current) return;
    featuredListRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, [listingType]);

  // A slow, continuous drift rather than a jump-pause-jump cadence — a
  // discrete scrollToIndex tick every few seconds reads as an abrupt flick;
  // this instead nudges the offset by a tiny amount on a fast timer, which
  // is what actually looks like a smooth, unhurried scroll. Wraps by
  // subtracting exactly one copy's width once it's crossed, landing back on
  // identical content — the actual seamless loop, not a visible reset.
  useEffect(() => {
    if (featuredListings.length <= 1) return undefined;
    const incrementPerTick = FEATURED_SCROLL_SPEED * (FEATURED_SCROLL_TICK_MS / 1000);
    const interval = setInterval(() => {
      if (featuredDraggingRef.current || !featuredCarouselReadyRef.current) return;
      featuredScrollXRef.current += incrementPerTick;
      if (featuredScrollXRef.current >= oneSetWidth) {
        featuredScrollXRef.current -= oneSetWidth;
      }
      featuredListRef.current?.scrollToOffset({ offset: featuredScrollXRef.current, animated: false });
    }, FEATURED_SCROLL_TICK_MS);
    return () => clearInterval(interval);
  }, [featuredListings.length, oneSetWidth]);

  // After any manual drag, silently fold the resting position back into the
  // first copy's range — lets you drag as far as you like without ever
  // hitting a dead end or settling somewhere that shows the duplicated tail.
  const normalizeFeaturedScroll = (offsetX) => {
    const normalized = oneSetWidth > 0 ? offsetX % oneSetWidth : offsetX;
    featuredScrollXRef.current = normalized;
    if (normalized !== offsetX) {
      featuredListRef.current?.scrollToOffset({ offset: normalized, animated: false });
    }
  };

  // Shared across every mini-card so they all flash in sync — whole card
  // pulses, same treatment as ListingCard itself.
  const featuredFlashAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (featuredListings.length === 0) return undefined;
    // Dips to 0.85, not lower — low enough to read as a pulse, but never
    // faint enough to wash the card out against the map underneath it.
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(featuredFlashAnim, { toValue: 0.85, duration: 550, useNativeDriver: true }),
        Animated.timing(featuredFlashAnim, { toValue: 1, duration: 550, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [featuredListings.length, featuredFlashAnim]);

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      const position = await Location.getCurrentPositionAsync({
        // The default is Balanced (roughly city-block accuracy). Request the
        // best available fix so the native user-location marker and initial
        // map center use the device's precise GPS position when the OS allows it.
        accuracy: Location.Accuracy.Highest,
        mayShowUserSettingsDialog: true,
      });
      const { latitude, longitude } = position.coords;
      const isInLibya =
        latitude >= LIBYA_BOUNDS.minLat &&
        latitude <= LIBYA_BOUNDS.maxLat &&
        longitude >= LIBYA_BOUNDS.minLon &&
        longitude <= LIBYA_BOUNDS.maxLon;
      // Outside Libya (e.g. browsing from genuinely overseas): keep the
      // default Tripoli-centered camera instead of zooming to wherever the
      // device actually is, and don't show the native blue dot either — it
      // would just be sitting off in another country, out of context.
      if (!isInLibya) return;
      setShowsUserLocation(true);
      mapRef.current?.centerOn(latitude, longitude);
    })();
  }, []);

  const toggleViewMode = useCallback(() => {
    setViewMode((prev) => (prev === 'map' ? 'list' : 'map'));
    setSelectedId(null);
  }, []);

  const selectedListing = filteredListings.find((item) => item.id === selectedId);

  // The carousel below only actually renders (and its FlatList only exists
  // as a live native instance) when this is true — a fresh mount means a
  // fresh instance with nothing measured yet, so the "ready" gate above
  // must be reset in step with it, not just set once and left stale across
  // a hide/show cycle (e.g. selecting then deselecting a map pin).
  const featuredCarouselVisible =
    BOOST_PURCHASES_ENABLED && viewMode === 'map' && !selectedListing && featuredListings.length > 0;
  if (!featuredCarouselVisible) {
    featuredCarouselReadyRef.current = false;
  }

  const openDetail = useCallback(
    (listingId) => navigation.navigate('ListingDetail', { listingId }),
    [navigation]
  );

  // topBar itself sits at `insets.top + 12` (its own top offset below the
  // status bar/notch) — content below it starts right after that plus its
  // real measured height plus a small breathing-room gap, instead of a
  // magic number tuned for whatever the filter row happened to look like at
  // the time.
  const contentTopOffset = insets.top + 12 + topBarHeight + 16;

  if (dataLoading) {
    return <LoadingView />;
  }

  if (dataErrors.listings && listings.length === 0) {
    return (
      <StatusScreen
        variant="error"
        title={t('errorGenericTitle')}
        subtitle={friendlyErrorMessage(dataErrors.listings, t)}
        primaryAction={{ label: t('tryAgainButton'), onPress: fetchListings }}
      />
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {viewMode === 'map' ? (
        <ListingsMap
          ref={mapRef}
          listings={filteredListings}
          selectedId={selectedId}
          onSelectListing={setSelectedId}
          showsUserLocation={showsUserLocation}
          theme={theme}
          colors={colors}
        />
      ) : filteredListings.length === 0 ? (
        <View style={[styles.listEmptyContainer, { paddingTop: contentTopOffset }]}>
          <PlaceholderScreen
            icon="search-outline"
            title={t('homeEmptyTitle')}
            subtitle={t('homeEmptySubtitle')}
          />
        </View>
      ) : (
        <FlatList
          data={filteredListings}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[
            styles.listContent,
            { paddingTop: contentTopOffset },
          ]}
          // filteredListings is already sorted featured-first — this just
          // labels that leading run, right under the filter row above.
          ListHeaderComponent={
            BOOST_PURCHASES_ENABLED && filteredListings[0]?.isFeatured ? (
              <View style={styles.featuredSectionHeader}>
                <Ionicons name="star" size={14} color={FEATURED_GOLD} />
                <Text style={[styles.featuredSectionHeaderText, { color: FEATURED_GOLD }]}>
                  {t('featuredLabel')}
                </Text>
              </View>
            ) : null
          }
          renderItem={({ item }) => (
            <ListingCard listing={item} onPress={() => openDetail(item.id)} />
          )}
        />
      )}

      {viewMode === 'map' && filteredListings.length === 0 && (
        <View
          style={[
            styles.mapEmptyBanner,
            { top: contentTopOffset, backgroundColor: colors.surface },
          ]}
        >
          <Text style={[styles.mapEmptyTitle, { color: colors.text }]}>
            {t('homeEmptyTitle')}
          </Text>
          <Text style={[styles.mapEmptySubtitle, { color: colors.textMuted }]}>
            {t('homeEmptySubtitle')}
          </Text>
        </View>
      )}

      <View
        style={[styles.topBar, { top: insets.top + 12 }]}
        onLayout={(event) => setTopBarHeight(event.nativeEvent.layout.height)}
      >
        <SearchBar
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder={t('searchListingsPlaceholder')}
          colors={colors}
          style={styles.searchBar}
        />

        <View style={[styles.segmentRow, { backgroundColor: colors.surface }]}>
          {LISTING_TYPES.map((type) => {
            const active = listingType === type;
            return (
              <Pressable
                key={type}
                style={[styles.segment, active && { backgroundColor: colors.accent }]}
                onPress={() => handleListingTypeChange(type)}
                accessibilityRole="tab"
                accessibilityLabel={t(LISTING_TYPE_LABEL_KEYS[type])}
                accessibilityState={{ selected: active }}
                testID={`listing-type-${type}`}
              >
                <Text
                  style={[
                    styles.segmentText,
                    { color: active ? colors.accentText : colors.text },
                  ]}
                >
                  {t(LISTING_TYPE_LABEL_KEYS[type])}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* One button instead of a row of pills. The pills scrolled
            horizontally, which hid whichever filters didn't fit — worst in
            Arabic, where the row starts at the right and the overflow falls
            off the left edge — and they took a third of the map with them.
            Everything now lives behind this, the way a marketplace app's
            filter button works. */}
        <Pressable
          onPress={() => setFilterSheetVisible(true)}
          style={({ pressed }) => [
            styles.filtersButton,
            { backgroundColor: colors.surface, borderColor: filterAccent },
            pressed && { opacity: 0.6 },
          ]}
          accessibilityRole="button"
          accessibilityLabel={t('filtersLabel')}
          testID="filters-button"
        >
          <Ionicons name="options-outline" size={16} color={filterAccent} />
          <Text style={[styles.filtersButtonText, { color: filterAccent }]}>
            {t('filtersLabel')}
          </Text>
          {activeFilterCount > 0 && (
            <View style={[styles.filterCountBadge, { backgroundColor: colors.accent }]}>
              <Text style={[styles.filterCountText, { color: colors.accentText }]}>
                {activeFilterCount}
              </Text>
            </View>
          )}
        </Pressable>


        {/* The menu itself: one row per facet, each showing what it's
            currently set to and opening the existing picker on top. Rows
            rather than everything inline, so the sheet stays scannable as
            filters get added — and so the audience filter, which only exists
            for chalet rentals, can appear without reflowing a chip row. */}
        <Modal
          visible={filterSheetVisible}
          transparent
          animationType="slide"
          onRequestClose={() => setFilterSheetVisible(false)}
          statusBarTranslucent
          navigationBarTranslucent
        >
          <Pressable
            style={[styles.pickerModalBackdrop, { backgroundColor: colors.backdrop }]}
            onPress={() => setFilterSheetVisible(false)}
          >
            <Pressable
              style={[styles.filterSheetCard, { backgroundColor: colors.surface }]}
              onPress={() => {}}
            >
              <ModalCloseButton
                onPress={() => setFilterSheetVisible(false)}
                colors={colors}
                label={t('close')}
                isRTL={isRTL}
              />
              <Text
                style={[
                  styles.pickerModalTitle,
                  styles.filterSheetTitle,
                  { color: colors.heading, borderBottomColor: colors.border, textAlign: isRTL ? 'right' : 'left' },
                ]}
              >
                {t('filtersLabel')}
              </Text>

              <ScrollView>
                <FilterFacetRow
                  label={t('propertyTypeLabel')}
                  value={selectedPropertyTypes.length > 0 ? propertyTypeSummary : t('allFilter')}
                  active={selectedPropertyTypes.length > 0}
                  colors={colors}
                  filterAccent={filterAccent}
                  isRTL={isRTL}
                  onPress={() => setPropertyTypePickerVisible(true)}
                />
                <FilterFacetRow
                  label={t('cityLabel')}
                  value={cityFilter === 'all' ? t('allCitiesFilter') : locationSummary}
                  active={cityFilter !== 'all'}
                  colors={colors}
                  filterAccent={filterAccent}
                  isRTL={isRTL}
                  onPress={openLocationFilter}
                />
                <FilterFacetRow
                  label={t('priceFilterLabel')}
                  value={
                    minPrice > PRICE_MIN || maxPrice < PRICE_MAX ? priceSummary : t('allFilter')
                  }
                  active={minPrice > PRICE_MIN || maxPrice < PRICE_MAX}
                  colors={colors}
                  filterAccent={filterAccent}
                  isRTL={isRTL}
                  onPress={() => setPriceFilterVisible(true)}
                />
                {showAudienceFilter && (
                  <FilterFacetRow
                    label={t('audienceLabel')}
                    value={
                      audienceFilter === 'all'
                        ? t('allFilter')
                        : t(AUDIENCE_LABEL_KEYS[audienceFilter])
                    }
                    active={audienceFilter !== 'all'}
                    colors={colors}
                    filterAccent={filterAccent}
                    isRTL={isRTL}
                    onPress={() => setAudiencePickerVisible(true)}
                  />
                )}
                {/* Map pin order isn't meaningful, so sorting is list-only. */}
                {viewMode === 'list' && (
                  <FilterFacetRow
                    label={t('sortLabel')}
                    value={sortSummary}
                    active={sortBy !== 'featured'}
                    colors={colors}
                    filterAccent={filterAccent}
                    isRTL={isRTL}
                    onPress={() => setSortPickerVisible(true)}
                  />
                )}
              </ScrollView>

              <View style={styles.filterSheetFooter}>
                <Pressable
                  style={[styles.priceClearButton, { borderColor: colors.inputBorder }]}
                  onPress={clearAllFilters}
                  disabled={activeFilterCount === 0}
                >
                  <Text
                    style={[
                      styles.priceClearButtonText,
                      { color: activeFilterCount === 0 ? colors.disabled : colors.textMuted },
                    ]}
                  >
                    {t('clearFilter')}
                  </Text>
                </Pressable>
                <Pressable
                  style={[styles.priceApplyButton, { backgroundColor: colors.accent }]}
                  onPress={() => setFilterSheetVisible(false)}
                >
                  <Text style={[styles.priceApplyButtonText, { color: colors.accentText }]}>
                    {t('showResults')}
                  </Text>
                </Pressable>
              </View>
            </Pressable>
          </Pressable>
        </Modal>

        <Modal
          visible={propertyTypePickerVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setPropertyTypePickerVisible(false)}
          statusBarTranslucent
          navigationBarTranslucent
        >
          <Pressable
            style={[styles.pickerModalBackdrop, { backgroundColor: colors.backdrop }]}
            onPress={() => setPropertyTypePickerVisible(false)}
          >
            <Pressable
              style={[styles.pickerModalCard, { backgroundColor: colors.surface }]}
              onPress={() => {}}
            >
              <ModalCloseButton
                onPress={() => setPropertyTypePickerVisible(false)}
                colors={colors}
                label={t('close')}
                isRTL={isRTL}
              />
              <Text style={[styles.pickerModalTitle, { color: colors.text, textAlign: isRTL ? 'right' : 'left' }]}>
                {t('propertyTypeLabel')}
              </Text>
              <ScrollView>
                {['all', ...PROPERTY_TYPES].map((type) => {
                  const active = type === 'all'
                    ? selectedPropertyTypes.length === 0
                    : selectedPropertyTypes.includes(type);
                  const label = type === 'all' ? t('allFilter') : t(PROPERTY_TYPE_LABEL_KEYS[type]);
                  return (
                    <Pressable
                      key={type}
                      onPress={() => {
                        if (type === 'all') {
                          setSelectedPropertyTypes([]);
                          return;
                        }
                        setSelectedPropertyTypes((previous) =>
                          previous.includes(type)
                            ? previous.filter((value) => value !== type)
                            : [...previous, type]
                        );
                      }}
                      style={[styles.pickerOption, active && { backgroundColor: `${filterAccent}22` }]}
                    >
                      <Text
                        style={[
                          styles.pickerOptionText,
                          { color: active ? filterAccent : colors.text, textAlign: isRTL ? 'right' : 'left' },
                          active && styles.pickerOptionTextActive,
                        ]}
                      >
                        {label}
                      </Text>
                      {active && <Ionicons name="checkmark" size={18} color={filterAccent} />}
                    </Pressable>
                  );
                })}
              </ScrollView>
              <Pressable
                style={[styles.modalApplyButton, { backgroundColor: colors.accent }]}
                onPress={() => setPropertyTypePickerVisible(false)}
              >
                <Text style={[styles.priceApplyButtonText, { color: colors.accentText }]}>
                  {t('applyFilter')}
                </Text>
              </Pressable>
            </Pressable>
          </Pressable>
        </Modal>

        <PriceRangeModal
          visible={priceFilterVisible}
          onClose={() => setPriceFilterVisible(false)}
          minPrice={minPrice}
          maxPrice={maxPrice}
          onApply={(nextMin, nextMax) => {
            setMinPrice(nextMin);
            setMaxPrice(nextMax);
          }}
          colors={colors}
          t={t}
          isRTL={isRTL}
        />

        <Modal
          visible={locationFilterVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setLocationFilterVisible(false)}
          statusBarTranslucent
          navigationBarTranslucent
        >
          <Pressable
            style={[styles.pickerModalBackdrop, { backgroundColor: colors.backdrop }]}
            onPress={() => setLocationFilterVisible(false)}
          >
            <Pressable
              style={[styles.pickerModalCard, { backgroundColor: colors.surface }]}
              onPress={() => {}}
            >
              <ModalCloseButton
                onPress={() => setLocationFilterVisible(false)}
                colors={colors}
                label={t('close')}
                isRTL={isRTL}
              />
              <View
                style={[styles.pickerModalHeaderRow, { justifyContent: isRTL ? 'flex-end' : 'flex-start' }]}
              >
                {locationFilterStep === 'district' && (
                  <Pressable
                    onPress={() => setLocationFilterStep('city')}
                    hitSlop={10}
                    style={styles.pickerModalBackButton}
                  >
                    <Ionicons
                      name={language === 'ar' ? 'chevron-forward' : 'chevron-back'}
                      size={20}
                      color={filterAccent}
                    />
                  </Pressable>
                )}
                <Text style={[styles.pickerModalTitle, { color: colors.text, textAlign: isRTL ? 'right' : 'left' }]}>
                  {locationFilterStep === 'city'
                    ? t('cityLabel')
                    : t(CITIES.find((item) => item.key === cityFilter)?.labelKey)}
                </Text>
              </View>
              <ScrollView>
                {locationFilterStep === 'city'
                  ? ['all', ...sortedCities.map((item) => item.key)].map((key) => {
                      // "All cities" (clearing the city filter) never renders
                      // as pre-checked — it's the default absence of a
                      // choice, not something the user actively picked, so
                      // showing it as already-active read as if a choice had
                      // been made for them.
                      const active = key !== 'all' && cityFilter === key;
                      const label =
                        key === 'all'
                          ? t('allCitiesFilter')
                          : t(CITIES.find((item) => item.key === key).labelKey);
                      return (
                        <Pressable
                          key={key}
                          onPress={() => handleCityFilterChange(key)}
                          style={[styles.pickerOption, active && { backgroundColor: `${filterAccent}22` }]}
                        >
                          <Text
                            style={[
                              styles.pickerOptionText,
                              { color: active ? filterAccent : colors.text, textAlign: isRTL ? 'right' : 'left' },
                              active && styles.pickerOptionTextActive,
                            ]}
                          >
                            {label}
                          </Text>
                          {active && <Ionicons name="checkmark" size={18} color={filterAccent} />}
                        </Pressable>
                      );
                    })
                  : ['all', ...districtsForCityFilter.map((item) => item.key)].map((key) => {
                      const active = districtFilter === key;
                      const label =
                        key === 'all'
                          ? t('allFilter')
                          : t(DISTRICTS.find((item) => item.key === key).labelKey);
                      return (
                        <Pressable
                          key={key}
                          onPress={() => handleDistrictFilterChange(key)}
                          style={[styles.pickerOption, active && { backgroundColor: `${filterAccent}22` }]}
                        >
                          <Text
                            style={[
                              styles.pickerOptionText,
                              { color: active ? filterAccent : colors.text, textAlign: isRTL ? 'right' : 'left' },
                              active && styles.pickerOptionTextActive,
                            ]}
                          >
                            {label}
                          </Text>
                          {active && <Ionicons name="checkmark" size={18} color={filterAccent} />}
                        </Pressable>
                      );
                    })}
              </ScrollView>
            </Pressable>
          </Pressable>
        </Modal>

        <Modal
          visible={audiencePickerVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setAudiencePickerVisible(false)}
          statusBarTranslucent
          navigationBarTranslucent
        >
          <Pressable
            style={[styles.pickerModalBackdrop, { backgroundColor: colors.backdrop }]}
            onPress={() => setAudiencePickerVisible(false)}
          >
            <Pressable
              style={[styles.pickerModalCard, { backgroundColor: colors.surface }]}
              onPress={() => {}}
            >
              <ModalCloseButton
                onPress={() => setAudiencePickerVisible(false)}
                colors={colors}
                label={t('close')}
                isRTL={isRTL}
              />
              <Text
                style={[
                  styles.pickerModalTitle,
                  { color: colors.heading, borderBottomColor: colors.border, textAlign: isRTL ? 'right' : 'left' },
                ]}
              >
                {t('audienceLabel')}
              </Text>
              <ScrollView>
                {['all', ...AUDIENCE_OPTIONS].map((option) => {
                  const active = audienceFilter === option;
                  const label = option === 'all' ? t('allFilter') : t(AUDIENCE_LABEL_KEYS[option]);
                  return (
                    <Pressable
                      key={option}
                      onPress={() => {
                        setAudienceFilter(option);
                        setAudiencePickerVisible(false);
                      }}
                      style={[styles.pickerOption, active && { backgroundColor: `${filterAccent}22` }]}
                    >
                      <Text
                        style={[
                          styles.pickerOptionText,
                          { color: active ? filterAccent : colors.text, textAlign: isRTL ? 'right' : 'left' },
                          active && styles.pickerOptionTextActive,
                        ]}
                      >
                        {label}
                      </Text>
                      {active && <Ionicons name="checkmark" size={18} color={filterAccent} />}
                    </Pressable>
                  );
                })}
              </ScrollView>
            </Pressable>
          </Pressable>
        </Modal>

        <Modal
          visible={sortPickerVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setSortPickerVisible(false)}
          statusBarTranslucent
          navigationBarTranslucent
        >
          <Pressable
            style={[styles.pickerModalBackdrop, { backgroundColor: colors.backdrop }]}
            onPress={() => setSortPickerVisible(false)}
          >
            <Pressable
              style={[styles.pickerModalCard, { backgroundColor: colors.surface }]}
              onPress={() => {}}
            >
              <ModalCloseButton
                onPress={() => setSortPickerVisible(false)}
                colors={colors}
                label={t('close')}
                isRTL={isRTL}
              />
              <Text style={[styles.pickerModalTitle, { color: colors.text, textAlign: isRTL ? 'right' : 'left' }]}>
                {t('sortLabel')}
              </Text>
              <ScrollView>
                {SORT_OPTIONS.map((option) => {
                  const active = sortBy === option;
                  return (
                    <Pressable
                      key={option}
                      onPress={() => {
                        setSortBy(option);
                        setSortPickerVisible(false);
                      }}
                      style={[styles.pickerOption, active && { backgroundColor: `${filterAccent}22` }]}
                    >
                      <Text
                        style={[
                          styles.pickerOptionText,
                          { color: active ? filterAccent : colors.text, textAlign: isRTL ? 'right' : 'left' },
                          active && styles.pickerOptionTextActive,
                        ]}
                      >
                        {t(SORT_LABEL_KEYS[option])}
                      </Text>
                      {active && <Ionicons name="checkmark" size={18} color={filterAccent} />}
                    </Pressable>
                  );
                })}
              </ScrollView>
            </Pressable>
          </Pressable>
        </Modal>

      </View>

      {viewMode === 'map' && selectedListing && (
        <View style={styles.floatingCard}>
          <ListingCard listing={selectedListing} onPress={() => openDetail(selectedListing.id)} />
        </View>
      )}

      {/* Hidden while a pin's own preview card is showing (above) — the two
          would otherwise occupy the same space near the bottom of the map. */}
      {featuredCarouselVisible && (
        <FlatList
          ref={featuredListRef}
          horizontal
          data={featuredLoopData}
          keyExtractor={(item, index) => `${item.id}-${index}`}
          showsHorizontalScrollIndicator={false}
          style={styles.featuredCarousel}
          contentContainerStyle={styles.featuredCarouselContent}
          getItemLayout={(_, index) => ({
            length: FEATURED_CARD_WIDTH + FEATURED_CARD_GAP,
            offset: (FEATURED_CARD_WIDTH + FEATURED_CARD_GAP) * index,
            index,
          })}
          // The one signal that this specific native instance has actually
          // measured its content and it's now safe to call scrollToOffset
          // against it — see featuredCarouselReadyRef above.
          onContentSizeChange={() => {
            featuredCarouselReadyRef.current = true;
          }}
          // Paused for the whole touch, not just a confirmed drag/scroll —
          // see featuredDraggingRef above for why a tap needs this too.
          onTouchStart={() => {
            featuredDraggingRef.current = true;
          }}
          onTouchEnd={() => {
            featuredDraggingRef.current = false;
          }}
          onTouchCancel={() => {
            featuredDraggingRef.current = false;
          }}
          onMomentumScrollEnd={(event) => {
            normalizeFeaturedScroll(event.nativeEvent.contentOffset.x);
          }}
          onScrollEndDrag={(event) => {
            normalizeFeaturedScroll(event.nativeEvent.contentOffset.x);
          }}
          renderItem={({ item }) => (
            <Pressable style={styles.featuredMiniCard} onPress={() => openDetail(item.id)}>
              <Animated.View
                style={[
                  styles.featuredMiniCardInner,
                  { backgroundColor: colors.surface, opacity: featuredFlashAnim },
                ]}
              >
                {item.images?.[0] ? (
                  <Image source={{ uri: item.images[0] }} style={styles.featuredMiniImage} />
                ) : (
                  <View style={[styles.featuredMiniImage, { backgroundColor: colors.border }]} />
                )}
                <View style={styles.featuredMiniBadge}>
                  <Ionicons name="star" size={10} color="#fff" />
                  <Text style={styles.featuredMiniBadgeText}>{t('featuredLabel')}</Text>
                </View>
                <Text style={[styles.featuredMiniPrice, { color: colors.text }]} numberOfLines={1}>
                  {item.price.toLocaleString('en-US')} {t('priceCurrency')}
                </Text>
              </Animated.View>
            </Pressable>
          )}
        />
      )}

      <Pressable
        style={styles.fab}
        onPress={toggleViewMode}
        accessibilityRole="button"
        accessibilityLabel={viewMode === 'map' ? t('showList') : t('showMap')}
        // The testID encodes what the button *does next*, not just what it is,
        // so a Maestro flow can put the screen in a known view mode
        // (tapOn: map-list-toggle-to-list) instead of blind-toggling and
        // inheriting whatever mode the previous flow left behind.
        testID={viewMode === 'map' ? 'map-list-toggle-to-list' : 'map-list-toggle-to-map'}
      >
        <Ionicons name={viewMode === 'map' ? 'list' : 'map'} size={18} color="#fff" />
        <Text style={styles.fabText}>{viewMode === 'map' ? t('showList') : t('showMap')}</Text>
      </Pressable>

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  listContent: {
    padding: 12,
    gap: 10,
  },
  featuredSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
    marginStart: 4,
  },
  featuredSectionHeaderText: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  listEmptyContainer: {
    flex: 1,
  },
  mapEmptyBanner: {
    position: 'absolute',
    start: 16,
    end: 16,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  mapEmptyTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  mapEmptySubtitle: {
    fontSize: 12,
    marginTop: 4,
    textAlign: 'center',
  },
  topBar: {
    position: 'absolute',
    start: 16,
    end: 16,
  },
  searchBar: {
    marginBottom: 10,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  segmentRow: {
    flexDirection: 'row',
    borderRadius: 12,
    padding: 4,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  segment: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 9,
  },
  segmentText: {
    fontWeight: '700',
    fontSize: 14,
  },
  pickerModalBackdrop: {
    flex: 1,
    justifyContent: 'center',
    padding: 32,
  },
  pickerModalCard: {
    borderRadius: 16,
    padding: 16,
    // Extra headroom above the title/back row specifically, so the close
    // button (position:absolute, ignores this padding) has its own clear
    // strip instead of sitting on top of them.
    paddingTop: 40,
    maxHeight: '70%',
  },
  pickerModalCloseButton: {
    position: 'absolute',
    top: 12,
    zIndex: 1,
    padding: 4,
  },
  pickerModalCloseButtonLTR: {
    right: 12,
  },
  pickerModalCloseButtonRTL: {
    left: 12,
  },
  // Bigger and underlined, so the sheet's title reads as a heading rather
  // than as another option in the list below it.
  pickerModalTitle: {
    fontSize: 19,
    fontWeight: '800',
    marginBottom: 10,
    paddingHorizontal: 8,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  filterSheetCard: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 16,
    paddingTop: 40,
    maxHeight: '80%',
    marginTop: 'auto',
  },
  filterSheetTitle: {
    marginBottom: 4,
  },
  filterSheetFooter: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  facetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 16,
    paddingHorizontal: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  facetTextBlock: {
    flex: 1,
    gap: 3,
  },
  facetLabel: {
    fontSize: 15,
    fontWeight: '700',
  },
  facetValue: {
    fontSize: 13.5,
    fontWeight: '600',
  },
  filtersButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 7,
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  filtersButtonText: {
    fontSize: 14,
    fontWeight: '700',
  },
  filterCountBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterCountText: {
    fontSize: 12,
    fontWeight: '800',
  },
  pickerModalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  pickerModalBackButton: {
    padding: 4,
    marginBottom: 8,
  },
  pickerOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    paddingVertical: 12,
    borderRadius: 10,
  },
  pickerOptionText: {
    fontSize: 15,
    fontWeight: '500',
  },
  pickerOptionTextActive: {
    fontWeight: '700',
  },
  priceValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 8,
  },
  priceValueText: {
    fontSize: 16,
    fontWeight: '700',
  },
  priceInputSeparator: {
    fontSize: 15,
  },
  priceSliderWrap: {
    alignItems: 'center',
    marginTop: 12,
    marginBottom: 16,
  },
  priceSliderContainer: {
    height: 40,
  },
  priceSliderTrack: {
    height: 4,
    borderRadius: 2,
  },
  priceButtonRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 8,
  },
  priceClearButton: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  priceClearButtonText: {
    fontWeight: '600',
    fontSize: 14,
  },
  // Row variant: shares a line with the Clear button, hence flex:1.
  priceApplyButton: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  // Column variant, for a modal where the button is the only thing under a
  // scrolling list. The row variant's flex:1 collapses to a few pixels here —
  // in a column it means "share the leftover height with the ScrollView", and
  // the ScrollView takes all of it. That rendered as a thin blue bar with the
  // label clipped out of existence.
  modalApplyButton: {
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 12,
  },
  priceApplyButtonText: {
    fontWeight: '700',
    fontSize: 14,
  },
  floatingCard: {
    position: 'absolute',
    bottom: 100,
    start: 16,
    end: 16,
    gap: 8,
  },
  // Sits above the map/list toggle FAB, which stays at its normal fixed
  // position right at the bottom of the screen.
  featuredCarousel: {
    position: 'absolute',
    bottom: 86,
    start: 16,
    end: 16,
  },
  featuredCarouselContent: {
    gap: FEATURED_CARD_GAP,
    paddingEnd: FEATURED_CARD_GAP,
  },
  featuredMiniCard: {
    width: FEATURED_CARD_WIDTH,
    borderRadius: 14,
    shadowColor: FEATURED_GOLD,
    shadowOpacity: 0.4,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
  // Separate from featuredMiniCard so only this (photo/badge/price) pulses —
  // the shadow above stays constant instead of flickering with it.
  featuredMiniCardInner: {
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: FEATURED_GOLD,
  },
  featuredMiniImage: {
    width: '100%',
    height: 72,
  },
  featuredMiniBadge: {
    position: 'absolute',
    top: 6,
    start: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 3,
    backgroundColor: FEATURED_GOLD,
  },
  featuredMiniBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  featuredMiniPrice: {
    fontSize: 13,
    fontWeight: '800',
    padding: 7,
  },
  fab: {
    position: 'absolute',
    bottom: 30,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#1a1a1a',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 24,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  fabText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
});
