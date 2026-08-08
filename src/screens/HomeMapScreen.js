import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  FlatList,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import MapView, { Marker } from 'react-native-maps';
import * as Location from 'expo-location';
import { useAppContext } from '../context/AppContext';
import ListingCard from '../components/ListingCard';
import PlaceholderScreen from '../components/PlaceholderScreen';
import LoadingView from '../components/LoadingView';
import SearchBar from '../components/SearchBar';
import PriceMarkerCapture from '../components/PriceMarkerCapture';
import { TRIPOLI_CENTER } from '../data/constants';
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
import { darkMapStyle } from '../theme/darkMapStyle';
import { FEATURED_GOLD } from '../theme/colors';

const FEATURED_CARD_WIDTH = 160;
const FEATURED_CARD_GAP = 12;
// Continuous-drift speed, not a per-card jump interval — see the auto-scroll
// effect below. Slow on purpose: a card (160px + 12px gap) takes ~7s to
// drift by at this rate.
const FEATURED_SCROLL_SPEED = 25; // px/second
const FEATURED_SCROLL_TICK_MS = 50;

// Static images, not live-rendered View content — Marker's `image` prop uses a
// plain native bitmap render path, sidestepping the Android custom-View-marker
// bug (see the platform branch below) entirely, unlike passing children.
const PIN_DEFAULT = require('../../assets/mapPinDefault.png');
const PIN_SELECTED = require('../../assets/mapPinSelected.png');

const TRIPOLI_REGION = {
  ...TRIPOLI_CENTER,
  latitudeDelta: 0.15,
  longitudeDelta: 0.15,
};

// Roughly the greater Tripoli metro area — generous on purpose (covers
// Janzour through Tajura), just enough to rule out "somewhere else in the
// world entirely." Only zooming to the device's real GPS position when it
// falls inside this box is what stops the map opening on a user's actual
// location if they're browsing from overseas — this app is Tripoli-only,
// so that would never be useful.
const TRIPOLI_BOUNDS = { minLat: 32.6, maxLat: 33.05, minLon: 12.9, maxLon: 13.6 };

export default function HomeMapScreen({ navigation }) {
  const { listings, theme, dataLoading, language } = useAppContext();
  const t = useT();
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
  const insets = useSafeAreaInsets();
  const [viewMode, setViewMode] = useState('map'); // 'map' | 'list'
  const [region, setRegion] = useState(TRIPOLI_REGION);
  const [selectedId, setSelectedId] = useState(null);
  const [listingType, setListingType] = useState('sale');
  const [propertyType, setPropertyType] = useState('all');
  const [propertyTypePickerVisible, setPropertyTypePickerVisible] = useState(false);
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
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
  const handleCityFilterChange = (key) => {
    setCityFilter(key);
    setDistrictFilter('all');
    if (key === 'all') {
      setLocationFilterVisible(false);
      return;
    }
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
  };
  const [audienceFilter, setAudienceFilter] = useState('all');
  const districtsForCityFilter =
    cityFilter === 'all' ? [] : [...DISTRICTS.filter((item) => item.city === cityFilter)].sort(localeSort);
  const [searchQuery, setSearchQuery] = useState('');
  // Android only: real captured PNGs of the price pill, keyed by `${id}:${price}`
  // so a price edit invalidates the old capture. See PriceMarkerCapture.js —
  // this is the experimental "real price on Android pins" attempt using
  // react-native-view-shot instead of the static branded badge.
  const [capturedPriceImages, setCapturedPriceImages] = useState({});

  // Switching Sale/Rent resets the secondary filters — a property-type/audience
  // choice made under one purpose isn't necessarily meaningful under the other.
  const handleListingTypeChange = (type) => {
    setListingType(type);
    setPropertyType('all');
    setAudienceFilter('all');
  };
  // Istiraha rentals get an extra audience sub-filter (Families/Youth) — that
  // distinction is specific to renting a chalet short-term, not buying one.
  const showAudienceFilter = listingType === 'rent' && propertyType === CHALET_PROPERTY_TYPE;

  // Buyer-facing map/list only ever shows admin-approved listings, filtered by
  // purpose + type — featured ones are pinned to the top of that same list
  // (not a separate section) via the sort below.
  const filteredListings = listings
    .filter((listing) => {
      if (listing.status !== 'approved' || listing.listingType !== listingType) return false;
      // Sold/rented is excluded the same way expired is — gone from buyer
      // browsing regardless of which one, just for a different reason.
      if (listing.listingState === 'expired' || listing.listingState === 'sold') return false;
      if (propertyType !== 'all' && listing.propertyType !== propertyType) return false;
      if (minPrice.trim() && listing.price < Number(minPrice)) return false;
      if (maxPrice.trim() && listing.price > Number(maxPrice)) return false;
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
    .sort((a, b) => (a.isFeatured === b.isFeatured ? 0 : a.isFeatured ? -1 : 1));

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

  const oneSetWidth = featuredListings.length * (FEATURED_CARD_WIDTH + FEATURED_CARD_GAP);

  // Switching Sale/Rent swaps in a different (often shorter) filtered list —
  // without this, the carousel could be left scrolled past the end of the
  // new list, or drifting from a stale offset that no longer matches it.
  useEffect(() => {
    featuredScrollXRef.current = 0;
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
      if (featuredDraggingRef.current) return;
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

  const captureKey = (listing) => `${listing.id}:${listing.price}`;
  const pendingCaptureListings =
    Platform.OS === 'android'
      ? filteredListings.filter((listing) => !capturedPriceImages[captureKey(listing)])
      : [];
  const handleCaptured = useCallback((key, uri) => {
    setCapturedPriceImages((prev) => ({ ...prev, [key]: uri }));
  }, []);

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      const position = await Location.getCurrentPositionAsync({});
      const { latitude, longitude } = position.coords;
      const isInTripoli =
        latitude >= TRIPOLI_BOUNDS.minLat &&
        latitude <= TRIPOLI_BOUNDS.maxLat &&
        longitude >= TRIPOLI_BOUNDS.minLon &&
        longitude <= TRIPOLI_BOUNDS.maxLon;
      // Outside Tripoli (e.g. browsing from overseas): keep the default
      // TRIPOLI_REGION instead of zooming to wherever the device actually is.
      if (!isInTripoli) return;
      setRegion({
        latitude,
        longitude,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      });
    })();
  }, []);

  const toggleViewMode = useCallback(() => {
    setViewMode((prev) => (prev === 'map' ? 'list' : 'map'));
    setSelectedId(null);
  }, []);

  const selectedListing = filteredListings.find((item) => item.id === selectedId);

  const openDetail = useCallback(
    (listingId) => navigation.navigate('ListingDetail', { listingId }),
    [navigation]
  );

  if (dataLoading) {
    return <LoadingView />;
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {viewMode === 'map' ? (
        <MapView
          style={StyleSheet.absoluteFill}
          region={region}
          onRegionChangeComplete={setRegion}
          userInterfaceStyle={theme}
          customMapStyle={theme === 'dark' ? darkMapStyle : []}
        >
          {filteredListings.map((listing) =>
            Platform.OS === 'android' ? (
              // Custom View marker content is currently broken on Android
              // under Expo SDK 54's New Architecture (react-native-maps
              // snapshots the view to a static image, and does so
              // unreliably — cropped text or flicker depending on
              // tracksViewChanges). Experimental attempt: capture the real
              // price pill to an actual PNG via react-native-view-shot (see
              // PriceMarkerCapture.js below) and use that as `image` — a
              // genuine static file, so it should sidestep the same bug the
              // pre-made branded badges do, but with the real price. Falls
              // back to the generic branded badge until that capture
              // resolves. iOS is unaffected and keeps the live price-on-pin.
              <Marker
                key={listing.id}
                coordinate={{ latitude: listing.latitude, longitude: listing.longitude }}
                onPress={() => setSelectedId(listing.id)}
                image={
                  capturedPriceImages[captureKey(listing)]
                    ? { uri: capturedPriceImages[captureKey(listing)] }
                    : selectedId === listing.id
                      ? PIN_SELECTED
                      : PIN_DEFAULT
                }
              />
            ) : (
              <Marker
                key={listing.id}
                coordinate={{ latitude: listing.latitude, longitude: listing.longitude }}
                onPress={() => setSelectedId(listing.id)}
              >
                <View
                  style={[
                    styles.pricePin,
                    { borderColor: colors.accent, backgroundColor: colors.surface },
                    selectedId === listing.id && { backgroundColor: colors.accent },
                    listing.isFeatured && styles.pricePinFeatured,
                  ]}
                >
                  <Text
                    style={[
                      styles.pricePinText,
                      { color: selectedId === listing.id ? colors.accentText : colors.accent },
                    ]}
                  >
                    {listing.price.toLocaleString('en-US')}
                  </Text>
                </View>
              </Marker>
            )
          )}
        </MapView>
      ) : filteredListings.length === 0 ? (
        <View style={[styles.listEmptyContainer, { paddingTop: insets.top + 230 }]}>
          <PlaceholderScreen title={t('homeEmptyTitle')} subtitle={t('homeEmptySubtitle')} />
        </View>
      ) : (
        <FlatList
          data={filteredListings}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[
            styles.listContent,
            { paddingTop: insets.top + 230 },
          ]}
          renderItem={({ item }) => (
            <ListingCard listing={item} onPress={() => openDetail(item.id)} />
          )}
        />
      )}

      {viewMode === 'map' && filteredListings.length === 0 && (
        <View
          style={[
            styles.mapEmptyBanner,
            { top: insets.top + 180, backgroundColor: colors.surface },
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

      <View style={[styles.topBar, { top: insets.top + 12 }]}>
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

        <View style={[styles.filterPillRow, styles.audienceRow]}>
          <Pressable
            onPress={() => setPropertyTypePickerVisible(true)}
            style={[
              styles.pickerDropdown,
              { backgroundColor: colors.surface, borderColor: colors.accent },
            ]}
          >
            <Text style={[styles.filterChipText, { color: colors.accent }]} numberOfLines={1}>
              {propertyType === 'all' ? t('allFilter') : t(PROPERTY_TYPE_LABEL_KEYS[propertyType])}
            </Text>
            <Ionicons name="chevron-down" size={16} color={colors.accent} />
          </Pressable>

          <Pressable
            onPress={() => setPriceFilterVisible(true)}
            style={[
              styles.pickerDropdown,
              { backgroundColor: colors.surface, borderColor: colors.accent },
            ]}
          >
            <Text style={[styles.filterChipText, { color: colors.accent }]} numberOfLines={1}>
              {minPrice.trim() || maxPrice.trim()
                ? `${minPrice.trim() || '0'} - ${maxPrice.trim() || '∞'}`
                : t('priceFilterLabel')}
            </Text>
            <Ionicons name="chevron-down" size={16} color={colors.accent} />
          </Pressable>

          <Pressable
            onPress={openLocationFilter}
            style={[
              styles.pickerDropdown,
              { backgroundColor: colors.surface, borderColor: colors.accent },
            ]}
          >
            <Text style={[styles.filterChipText, { color: colors.accent }]} numberOfLines={1}>
              {cityFilter === 'all'
                ? t('cityLabel')
                : districtFilter === 'all'
                ? t(CITIES.find((item) => item.key === cityFilter)?.labelKey)
                : t(DISTRICTS.find((item) => item.key === districtFilter)?.labelKey)}
            </Text>
            <Ionicons name="chevron-down" size={16} color={colors.accent} />
          </Pressable>
        </View>

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
              <Text style={[styles.pickerModalTitle, { color: colors.text }]}>
                {t('propertyTypeLabel')}
              </Text>
              <ScrollView>
                {['all', ...PROPERTY_TYPES].map((type) => {
                  const active = propertyType === type;
                  const label = type === 'all' ? t('allFilter') : t(PROPERTY_TYPE_LABEL_KEYS[type]);
                  return (
                    <Pressable
                      key={type}
                      onPress={() => {
                        setPropertyType(type);
                        setPropertyTypePickerVisible(false);
                      }}
                      style={[styles.pickerOption, active && { backgroundColor: `${colors.accent}22` }]}
                    >
                      <Text
                        style={[
                          styles.pickerOptionText,
                          { color: active ? colors.accent : colors.text },
                          active && styles.pickerOptionTextActive,
                        ]}
                      >
                        {label}
                      </Text>
                      {active && <Ionicons name="checkmark" size={18} color={colors.accent} />}
                    </Pressable>
                  );
                })}
              </ScrollView>
            </Pressable>
          </Pressable>
        </Modal>

        <Modal
          visible={priceFilterVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setPriceFilterVisible(false)}
          statusBarTranslucent
          navigationBarTranslucent
        >
          <Pressable
            style={[styles.pickerModalBackdrop, { backgroundColor: colors.backdrop }]}
            onPress={() => setPriceFilterVisible(false)}
          >
            <Pressable
              style={[styles.pickerModalCard, { backgroundColor: colors.surface }]}
              onPress={() => {}}
            >
              <Text style={[styles.pickerModalTitle, { color: colors.text }]}>
                {t('priceFilterLabel')}
              </Text>
              <View style={styles.priceInputRow}>
                <TextInput
                  style={[
                    styles.priceInput,
                    { borderColor: colors.inputBorder, color: colors.text },
                  ]}
                  placeholder={t('minPricePlaceholder')}
                  placeholderTextColor={colors.placeholderText}
                  keyboardType="number-pad"
                  value={minPrice}
                  onChangeText={setMinPrice}
                />
                <Text style={[styles.priceInputSeparator, { color: colors.textMuted }]}>—</Text>
                <TextInput
                  style={[
                    styles.priceInput,
                    { borderColor: colors.inputBorder, color: colors.text },
                  ]}
                  placeholder={t('maxPricePlaceholder')}
                  placeholderTextColor={colors.placeholderText}
                  keyboardType="number-pad"
                  value={maxPrice}
                  onChangeText={setMaxPrice}
                />
              </View>
              <View style={styles.priceButtonRow}>
                <Pressable
                  style={[styles.priceClearButton, { borderColor: colors.inputBorder }]}
                  onPress={() => {
                    setMinPrice('');
                    setMaxPrice('');
                  }}
                >
                  <Text style={[styles.priceClearButtonText, { color: colors.textMuted }]}>
                    {t('clearFilter')}
                  </Text>
                </Pressable>
                <Pressable
                  style={[styles.priceApplyButton, { backgroundColor: colors.accent }]}
                  onPress={() => setPriceFilterVisible(false)}
                >
                  <Text style={[styles.priceApplyButtonText, { color: colors.accentText }]}>
                    {t('applyFilter')}
                  </Text>
                </Pressable>
              </View>
            </Pressable>
          </Pressable>
        </Modal>

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
              <View style={styles.pickerModalHeaderRow}>
                {locationFilterStep === 'district' && (
                  <Pressable
                    onPress={() => setLocationFilterStep('city')}
                    hitSlop={10}
                    style={styles.pickerModalBackButton}
                  >
                    <Ionicons
                      name={language === 'ar' ? 'chevron-forward' : 'chevron-back'}
                      size={20}
                      color={colors.accent}
                    />
                  </Pressable>
                )}
                <Text style={[styles.pickerModalTitle, { color: colors.text }]}>
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
                          style={[styles.pickerOption, active && { backgroundColor: `${colors.accent}22` }]}
                        >
                          <Text
                            style={[
                              styles.pickerOptionText,
                              { color: active ? colors.accent : colors.text },
                              active && styles.pickerOptionTextActive,
                            ]}
                          >
                            {label}
                          </Text>
                          {active && <Ionicons name="checkmark" size={18} color={colors.accent} />}
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
                          style={[styles.pickerOption, active && { backgroundColor: `${colors.accent}22` }]}
                        >
                          <Text
                            style={[
                              styles.pickerOptionText,
                              { color: active ? colors.accent : colors.text },
                              active && styles.pickerOptionTextActive,
                            ]}
                          >
                            {label}
                          </Text>
                          {active && <Ionicons name="checkmark" size={18} color={colors.accent} />}
                        </Pressable>
                      );
                    })}
              </ScrollView>
            </Pressable>
          </Pressable>
        </Modal>

        {showAudienceFilter && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={[styles.filterRow, styles.audienceRow]}
          >
            {['all', ...AUDIENCE_OPTIONS].map((option) => {
              const active = audienceFilter === option;
              const label = option === 'all' ? t('allFilter') : t(AUDIENCE_LABEL_KEYS[option]);
              return (
                <Pressable
                  key={option}
                  onPress={() => setAudienceFilter(option)}
                  style={[
                    styles.filterChip,
                    { backgroundColor: colors.surface, borderColor: colors.accent },
                    active && { backgroundColor: colors.accent },
                  ]}
                >
                  <Text
                    style={[
                      styles.filterChipText,
                      { color: active ? colors.accentText : colors.accent },
                    ]}
                  >
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        )}
      </View>

      {viewMode === 'map' && selectedListing && (
        <View style={styles.floatingCard}>
          <ListingCard listing={selectedListing} onPress={() => openDetail(selectedListing.id)} />
        </View>
      )}

      {/* Hidden while a pin's own preview card is showing (above) — the two
          would otherwise occupy the same space near the bottom of the map. */}
      {viewMode === 'map' && !selectedListing && featuredListings.length > 0 && (
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

      <Pressable style={styles.fab} onPress={toggleViewMode}>
        <Ionicons name={viewMode === 'map' ? 'list' : 'map'} size={18} color="#fff" />
        <Text style={styles.fabText}>{viewMode === 'map' ? t('showList') : t('showMap')}</Text>
      </Pressable>

      {pendingCaptureListings.map((listing) => {
        const key = captureKey(listing);
        return (
          <PriceMarkerCapture
            key={key}
            priceText={listing.price.toLocaleString('en-US')}
            colors={colors}
            onCaptured={(uri) => handleCaptured(key, uri)}
          />
        );
      })}
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
  filterRow: {
    gap: 8,
    marginTop: 10,
    paddingEnd: 4,
  },
  audienceRow: {
    marginTop: 8,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 18,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  filterChipText: {
    fontWeight: '600',
    fontSize: 13,
  },
  pickerDropdown: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    alignSelf: 'flex-start',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 18,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  pickerModalBackdrop: {
    flex: 1,
    justifyContent: 'center',
    padding: 32,
  },
  pickerModalCard: {
    borderRadius: 16,
    padding: 16,
    maxHeight: '70%',
  },
  pickerModalTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 8,
    paddingHorizontal: 8,
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
  filterPillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  priceInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 8,
    marginBottom: 16,
  },
  priceInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
  },
  priceInputSeparator: {
    fontSize: 15,
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
  priceApplyButton: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  priceApplyButtonText: {
    fontWeight: '700',
    fontSize: 14,
  },
  pricePin: {
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
  },
  pricePinFeatured: {
    borderColor: FEATURED_GOLD,
    borderWidth: 2,
  },
  pricePinText: {
    fontWeight: '700',
    fontSize: 12,
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
