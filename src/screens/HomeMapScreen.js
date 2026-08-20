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
import { Marker } from 'react-native-maps';
// Clustering-aware MapView wrapper, not the plain react-native-maps one —
// same MapView props/behavior otherwise (region, customMapStyle, children,
// etc. all pass through), it just groups nearby Markers into a count bubble
// when zoomed out. Individual (non-clustered) Markers are untouched — the
// library only intercepts children once 2+ end up within `radius` of each
// other, so the existing per-platform pin rendering below still applies as-is.
import MapView from 'react-native-map-clustering';
import * as Location from 'expo-location';
import { useAppContext } from '../context/AppContext';
import ListingCard from '../components/ListingCard';
import PlaceholderScreen from '../components/PlaceholderScreen';
import LoadingView from '../components/LoadingView';
import StatusScreen from '../components/StatusScreen';
import { friendlyErrorMessage } from '../utils/friendlyError';
import SearchBar from '../components/SearchBar';
import PriceMarkerCapture from '../components/PriceMarkerCapture';
import ClusterMarkerCapture from '../components/ClusterMarkerCapture';
import { TRIPOLI_CENTER } from '../data/constants';
import { toEnglishDigits } from '../utils/digits';
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
// drift by at this rate. Tick is 100ms, not the original 50ms — same speed
// (increment is scaled to match), but half as many scrollToOffset/bridge
// calls per second, which is what was making a light tap sometimes lose to
// the scroll view's own gesture recognition and occasionally showing a
// laggy "catch up" jump under any JS-thread pressure.
const FEATURED_SCROLL_SPEED = 25; // px/second
const FEATURED_SCROLL_TICK_MS = 100;

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

export default function HomeMapScreen({ navigation }) {
  const { listings, theme, dataLoading, dataErrors, fetchListings, language } = useAppContext();
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
  // Android only: real captured PNGs of the price pill, keyed by `${id}:${price}`
  // so a price edit invalidates the old capture. See PriceMarkerCapture.js —
  // this is the experimental "real price on Android pins" attempt using
  // react-native-view-shot instead of the static branded badge.
  const [capturedPriceImages, setCapturedPriceImages] = useState({});
  // Android only, same reasoning as capturedPriceImages above: a cluster's
  // count "bubble" is a live View by default (see react-native-map-clustering's
  // own ClusteredMarker), which hits the same Fabric custom-View-marker bug.
  // Captured once per distinct count value (not per specific cluster/group of
  // listings — every "5" bubble looks identical), via renderAndroidCluster
  // below. clusterCounts is just "which counts are currently on screen,"
  // refreshed from the library's own onMarkersChange callback.
  const [clusterCounts, setClusterCounts] = useState([]);
  const [capturedClusterImages, setCapturedClusterImages] = useState({});
  const handleMarkersChange = useCallback((markers) => {
    if (Platform.OS !== 'android') return;
    const counts = [...new Set((markers ?? []).filter((m) => m.properties.point_count > 0).map((m) => m.properties.point_count))];
    setClusterCounts(counts);
  }, []);
  const handleClusterCaptured = useCallback((count, uri) => {
    setCapturedClusterImages((prev) => ({ ...prev, [count]: uri }));
  }, []);
  // Falls back to the plain default pin badge (not a native red teardrop)
  // for the brief moment before a given count's capture resolves — same
  // "self-correcting flash" every other captured-image marker in this
  // screen already accepts.
  const renderAndroidCluster = useCallback(
    ({ onPress, id, geometry, properties }) => {
      const count = properties.point_count;
      return (
        <Marker
          key={`cluster-${id}`}
          coordinate={{ latitude: geometry.coordinates[1], longitude: geometry.coordinates[0] }}
          onPress={onPress}
          image={capturedClusterImages[count] ? { uri: capturedClusterImages[count] } : PIN_DEFAULT}
        />
      );
    },
    [capturedClusterImages]
  );

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
      const isInLibya =
        latitude >= LIBYA_BOUNDS.minLat &&
        latitude <= LIBYA_BOUNDS.maxLat &&
        longitude >= LIBYA_BOUNDS.minLon &&
        longitude <= LIBYA_BOUNDS.maxLon;
      // Outside Libya (e.g. browsing from genuinely overseas): keep the
      // default TRIPOLI_REGION instead of zooming to wherever the device
      // actually is.
      if (!isInLibya) return;
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

  // The carousel below only actually renders (and its FlatList only exists
  // as a live native instance) when this is true — a fresh mount means a
  // fresh instance with nothing measured yet, so the "ready" gate above
  // must be reset in step with it, not just set once and left stale across
  // a hide/show cycle (e.g. selecting then deselecting a map pin).
  const featuredCarouselVisible =
    viewMode === 'map' && !selectedListing && featuredListings.length > 0;
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
        <MapView
          style={StyleSheet.absoluteFill}
          region={region}
          onRegionChangeComplete={setRegion}
          userInterfaceStyle={theme}
          customMapStyle={theme === 'dark' ? darkMapStyle : []}
          clusteringEnabled
          clusterColor={colors.accent}
          clusterTextColor="#fff"
          onMarkersChange={handleMarkersChange}
          // iOS keeps the library's own default View-based cluster bubble
          // (unaffected by the Android-only Fabric marker bug) — only
          // Android needs the captured-PNG workaround.
          renderCluster={Platform.OS === 'android' ? renderAndroidCluster : undefined}
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
            filteredListings[0]?.isFeatured ? (
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
            { top: contentTopOffset - 50, backgroundColor: colors.surface },
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

        <View style={[styles.filterPillRow, styles.audienceRow]}>
          <Pressable
            onPress={() => setPropertyTypePickerVisible(true)}
            style={[
              styles.pickerDropdown,
              { backgroundColor: colors.surface, borderColor: colors.accent },
            ]}
            accessibilityRole="button"
          >
            <Text style={[styles.filterChipText, { color: colors.accent }]} numberOfLines={1}>
              {/* Always prefixed with what the pill actually is, not just its
                  current value — "Apartment" alone doesn't tell a
                  first-time user this is the property-type filter. Same
                  reasoning applies to the three pills below. */}
              {t('propertyTypeLabel')}: {propertyType === 'all' ? t('allFilter') : t(PROPERTY_TYPE_LABEL_KEYS[propertyType])}
            </Text>
            <Ionicons name="chevron-down" size={16} color={colors.accent} />
          </Pressable>

          <Pressable
            onPress={() => setPriceFilterVisible(true)}
            style={[
              styles.pickerDropdown,
              { backgroundColor: colors.surface, borderColor: colors.accent },
            ]}
            accessibilityRole="button"
          >
            <Text style={[styles.filterChipText, { color: colors.accent }]} numberOfLines={1}>
              {t('priceFilterLabel')}:{' '}
              {minPrice.trim() || maxPrice.trim()
                ? `${minPrice.trim() || '0'} - ${maxPrice.trim() || '∞'}`
                : t('allFilter')}
            </Text>
            <Ionicons name="chevron-down" size={16} color={colors.accent} />
          </Pressable>

          <Pressable
            onPress={openLocationFilter}
            style={[
              styles.pickerDropdown,
              { backgroundColor: colors.surface, borderColor: colors.accent },
            ]}
            accessibilityRole="button"
          >
            <Text style={[styles.filterChipText, { color: colors.accent }]} numberOfLines={1}>
              {t('cityLabel')}:{' '}
              {cityFilter === 'all'
                ? t('allFilter')
                : districtFilter === 'all'
                ? t(CITIES.find((item) => item.key === cityFilter)?.labelKey)
                : t(DISTRICTS.find((item) => item.key === districtFilter)?.labelKey)}
            </Text>
            <Ionicons name="chevron-down" size={16} color={colors.accent} />
          </Pressable>

          {/* List-view only — map pin order isn't meaningful to sort. */}
          {viewMode === 'list' && (
            <Pressable
              onPress={() => setSortPickerVisible(true)}
              style={[
                styles.pickerDropdown,
                { backgroundColor: colors.surface, borderColor: colors.accent },
              ]}
            >
              <Text style={[styles.filterChipText, { color: colors.accent }]} numberOfLines={1}>
                {t('sortLabel')}: {t(SORT_LABEL_KEYS[sortBy])}
              </Text>
              <Ionicons name="chevron-down" size={16} color={colors.accent} />
            </Pressable>
          )}
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
                  onChangeText={(text) => setMinPrice(toEnglishDigits(text))}
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
                  onChangeText={(text) => setMaxPrice(toEnglishDigits(text))}
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
              <Text style={[styles.pickerModalTitle, { color: colors.text }]}>
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
                      style={[styles.pickerOption, active && { backgroundColor: `${colors.accent}22` }]}
                    >
                      <Text
                        style={[
                          styles.pickerOptionText,
                          { color: active ? colors.accent : colors.text },
                          active && styles.pickerOptionTextActive,
                        ]}
                      >
                        {t(SORT_LABEL_KEYS[option])}
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
                  accessibilityRole="button"
                  accessibilityLabel={label}
                  accessibilityState={{ selected: active }}
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
        testID="map-list-toggle"
      >
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

      {Platform.OS === 'android' &&
        clusterCounts
          .filter((count) => !capturedClusterImages[count])
          .map((count) => (
            <ClusterMarkerCapture
              key={`cluster-capture-${count}`}
              count={count}
              colors={colors}
              onCaptured={(uri) => handleClusterCaptured(count, uri)}
            />
          ))}
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
