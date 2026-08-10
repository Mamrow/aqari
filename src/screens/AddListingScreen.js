import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { useAppContext } from '../context/AppContext';
import BoostListingSection from '../components/BoostListingSection';
import StatusScreen from '../components/StatusScreen';
import { friendlyErrorMessage } from '../utils/friendlyError';
import { TRIPOLI_CENTER } from '../data/constants';
import { CITIES, DISTRICTS, PRIORITY_CITY_KEYS } from '../data/districts';
import {
  LISTING_TYPES,
  PROPERTY_TYPES,
  AMENITIES,
  AUDIENCE_OPTIONS,
  CHALET_PROPERTY_TYPE,
  LISTING_TYPE_LABEL_KEYS,
  PROPERTY_TYPE_LABEL_KEYS,
  AMENITY_LABEL_KEYS,
  AUDIENCE_LABEL_KEYS,
} from '../data/propertyTypes';
import { useT } from '../i18n/useT';
import { useThemeColors } from '../theme/useThemeColors';
import { darkMapStyle } from '../theme/darkMapStyle';
import PhoneInput, {
  stripLibyaPrefix,
  withLibyaPrefix,
  isValidLibyanMobile,
} from '../components/PhoneInput';
import { isRemoteMediaUrl, uploadListingImage, uploadListingVideo } from '../utils/uploadImage';
import { toEnglishDigits } from '../utils/digits';
import { isVideoUrl } from '../utils/media';

const INITIAL_REGION = {
  ...TRIPOLI_CENTER,
  latitudeDelta: 0.15,
  longitudeDelta: 0.15,
};

const ROOM_OPTIONS = ['1', '2', '3', '4', '5+'];
const ROOMS_APPLICABLE_TYPES = ['apartment', 'villa'];
const MIN_PHOTOS = 3;
const MAX_PHOTOS = 15;
// A one-word "nice" description shouldn't be enough to publish a listing —
// 20 chars is low enough not to be annoying, high enough to rule out that.
const MIN_DESCRIPTION_LENGTH = 20;
const MAX_DESCRIPTION_LENGTH = 1000;

export default function AddListingScreen({ navigation, route }) {
  const { listings, submitListing, updateListing, resubmitRejectedListing, theme, auth, language } =
    useAppContext();
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

  const editingId = route.params?.listingId ?? null;
  const existing = editingId ? listings.find((item) => item.id === editingId) : null;

  const [title, setTitle] = useState(existing?.title ?? '');
  const [price, setPrice] = useState(existing ? String(existing.price) : '');
  const [area, setArea] = useState(existing ? String(existing.area) : '');
  const [agentPhone, setAgentPhone] = useState(
    stripLibyaPrefix(existing?.agentPhone ?? auth.phone ?? '')
  );
  const [description, setDescription] = useState(existing?.description ?? '');
  const [images, setImages] = useState(existing?.images ?? []);
  const [listingType, setListingType] = useState(existing?.listingType ?? 'sale');
  const [propertyType, setPropertyType] = useState(existing?.propertyType ?? 'apartment');
  const [propertyTypePickerVisible, setPropertyTypePickerVisible] = useState(false);
  const [city, setCity] = useState(existing?.city ?? null);
  const [district, setDistrict] = useState(existing?.district ?? null);
  // One combined modal instead of two separate popups: picking a city moves
  // to the district step in the same modal (rather than closing it), so
  // assigning a location reads as one continuous menu.
  const [locationPickerVisible, setLocationPickerVisible] = useState(false);
  const [locationPickerStep, setLocationPickerStep] = useState('city'); // 'city' | 'district'
  // Reopening with a city already picked lands back on that city's
  // district step, not the top-level city list — changing your mind about
  // the district shouldn't require re-picking the city first.
  const openLocationPicker = () => {
    setLocationPickerStep(city ? 'district' : 'city');
    setLocationPickerVisible(true);
  };
  // Districts belong to a specific city — switching city clears whatever
  // district was picked under the previous one rather than leaving a
  // mismatched pairing in place.
  const handleCityChange = (key) => {
    setCity(key);
    setDistrict(null);
    const hasDistricts = DISTRICTS.some((item) => item.city === key);
    if (hasDistricts) {
      setLocationPickerStep('district');
    } else {
      setLocationPickerVisible(false);
    }
  };
  const handleDistrictChange = (key) => {
    setDistrict(key);
    setLocationPickerVisible(false);
  };
  const districtsForCity = [...DISTRICTS.filter((item) => item.city === city)].sort(localeSort);
  const [rooms, setRooms] = useState(existing?.rooms ?? null);
  const [amenities, setAmenities] = useState(existing?.amenities ?? []);
  const [audienceTarget, setAudienceTarget] = useState(existing?.audienceTarget ?? null);
  const [location, setLocation] = useState(
    existing ? { latitude: existing.latitude, longitude: existing.longitude } : TRIPOLI_CENTER
  );
  const [submitting, setSubmitting] = useState(false);
  const [submittedListing, setSubmittedListing] = useState(null);
  const [submitError, setSubmitError] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(null);

  useEffect(() => {
    navigation.setOptions({ title: editingId ? t('editListingTitle') : t('addListingTitle') });
  }, [navigation, editingId, t]);

  // Explicit target rather than goBack(): this screen can be reached with no
  // history underneath it (e.g. via the center "+" tab, which redirects
  // straight here — see AddListingRedirect.js), where goBack() has nothing
  // to pop and silently fails, leaving the form stuck on screen.
  const goToMyListings = () => navigation.navigate('MyListingsHome');

  const handleCancel = () => {
    if (!title && !price && !area && !description && images.length === 0) {
      goToMyListings();
      return;
    }
    Alert.alert(t('cancelListingConfirmTitle'), t('cancelListingConfirmMessage'), [
      { text: t('stayLabel'), style: 'cancel' },
      { text: t('discardLabel'), style: 'destructive', onPress: goToMyListings },
    ]);
  };

  const isChalet = propertyType === CHALET_PROPERTY_TYPE;
  const isChaletRental = isChalet && listingType === 'rent';
  const roomsRequired = ROOMS_APPLICABLE_TYPES.includes(propertyType);

  const toggleAmenity = (key) => {
    setAmenities((prev) =>
      prev.includes(key) ? prev.filter((item) => item !== key) : [...prev, key]
    );
  };

  const canSubmit =
    title.trim().length > 0 &&
    Number(price) > 0 &&
    Number(area) > 0 &&
    isValidLibyanMobile(agentPhone.trim()) &&
    description.trim().length >= MIN_DESCRIPTION_LENGTH &&
    images.length >= MIN_PHOTOS &&
    images.length <= MAX_PHOTOS &&
    (!roomsRequired || rooms !== null) &&
    (!isChaletRental || audienceTarget !== null);

  const handlePickImage = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;
    const remainingSlots = MAX_PHOTOS - images.length;
    if (remainingSlots <= 0) {
      Alert.alert(t('tooManyPhotosTitle'), t('tooManyPhotosMessage').replace('{max}', String(MAX_PHOTOS)));
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      allowsMultipleSelection: true,
      // Caps how many can be picked in one go at whatever's left of the
      // 15-photo max — belt-and-suspenders with the .slice() below, since
      // selectionLimit's enforcement isn't identical across iOS/Android.
      selectionLimit: remainingSlots,
      quality: 0.7,
      // Caps how large a picked video can be — uncompressed phone video can
      // easily be 50MB+/minute, which is what was making buyer-side loading
      // slow. videoExportPreset re-compresses on pick (iOS only); duration
      // cap applies on both platforms.
      videoMaxDuration: 60,
      videoExportPreset: ImagePicker.VideoExportPreset.MediumQuality,
    });
    if (!result.canceled) {
      setImages((prev) =>
        [...prev, ...result.assets.map((asset) => asset.uri)].slice(0, MAX_PHOTOS)
      );
    }
  };

  const removeImage = (uri) => {
    setImages((prev) => prev.filter((item) => item !== uri));
  };

  const handleSubmit = async () => {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      // Only freshly-picked local media needs uploading — items already on an
      // existing listing (editing) are already public Supabase Storage URLs.
      // Uploads and the DB save are wrapped separately so the failure screen
      // can say which stage actually failed instead of one generic message
      // for both. Progress ticks up per-file as each upload resolves — the
      // uploads run concurrently (Promise.all), so this isn't "file 1, then
      // file 2," just a live count of however many have finished so far.
      const toUploadCount = images.filter((uri) => !isRemoteMediaUrl(uri)).length;
      let uploadedSoFar = 0;
      if (toUploadCount > 0) setUploadProgress({ current: 0, total: toUploadCount });
      let uploadedImages;
      try {
        uploadedImages = await Promise.all(
          images.map(async (uri) => {
            if (isRemoteMediaUrl(uri)) return uri;
            const result = isVideoUrl(uri) ? await uploadListingVideo(uri) : await uploadListingImage(uri);
            uploadedSoFar += 1;
            setUploadProgress({ current: uploadedSoFar, total: toUploadCount });
            return result;
          })
        );
      } catch (uploadError) {
        console.warn('Photo upload failed', uploadError);
        setSubmitError(friendlyErrorMessage(uploadError, t));
        return;
      } finally {
        setUploadProgress(null);
      }

      const data = {
        title: title.trim(),
        price: Number(price),
        area: Number(area),
        agentPhone: withLibyaPrefix(agentPhone),
        description: description.trim(),
        images: uploadedImages,
        listingType,
        propertyType,
        rooms: roomsRequired ? rooms : null,
        amenities: isChaletRental ? amenities : [],
        audienceTarget: isChaletRental ? audienceTarget : null,
        city,
        district,
        latitude: location.latitude,
        longitude: location.longitude,
      };
      if (editingId) {
        await updateListing(editingId, data);
        // Resubmitting a rejected listing puts it back in front of admin for
        // review — a separate owner-gated RPC, not a plain field update
        // (status is column-locked from a direct client write; see
        // migration_fix_listings_column_lockdown.sql).
        if (existing?.status === 'rejected') {
          await resubmitRejectedListing(editingId);
        }
        Alert.alert(t('listingUpdatedTitle'), t('listingUpdatedMessage'), [
          { text: t('ok'), onPress: goToMyListings },
        ]);
      } else {
        // Offer Featured right at submission, instead of an "OK" alert that
        // immediately navigates away — see the submittedListing branch below.
        const listing = await submitListing(data);
        setSubmittedListing(listing);
      }
    } catch (error) {
      console.warn('Listing save failed', error);
      setSubmitError(friendlyErrorMessage(error, t));
    } finally {
      setSubmitting(false);
    }
  };

  if (submitting) {
    return (
      <StatusScreen
        variant="loading"
        // The "3/5" progress count on its own didn't say what it was
        // counting — the title now names it explicitly while photos are
        // actually uploading, then switches to the generic save title for
        // the brief final save once uploadProgress clears.
        title={uploadProgress ? t('uploadingPhotosTitle') : t('listingSubmittingTitle')}
        subtitle={uploadProgress ? t('uploadingPhotosSubtitle') : t('listingSubmittingSubtitle')}
        progress={uploadProgress}
      />
    );
  }

  if (submitError) {
    return (
      <StatusScreen
        variant="error"
        title={t('submitErrorTitle')}
        subtitle={submitError}
        primaryAction={{ label: t('tryAgainButton'), onPress: () => setSubmitError(null) }}
      />
    );
  }

  if (submittedListing) {
    return (
      <StatusScreen
        variant="success"
        title={t('listingSubmittedTitle')}
        subtitle={t('listingSubmittedMessage')}
        secondaryAction={{ label: t('skipForNowButton'), onPress: goToMyListings }}
      >
        <View style={styles.successBoostSection}>
          <BoostListingSection listing={submittedListing} colors={colors} />
        </View>
      </StatusScreen>
    );
  }

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.container}
    >
      <Text style={[styles.requiredLegend, { color: colors.textMuted }]}>
        {t('requiredFieldsLegend')}
      </Text>

      <RequiredLabel colors={colors}>{t('listingTitleLabel')}</RequiredLabel>
      <TextInput
        style={[styles.input, { borderColor: colors.inputBorder, color: colors.text }]}
        placeholder={t('listingTitlePlaceholder')}
        placeholderTextColor={colors.placeholderText}
        value={title}
        onChangeText={setTitle}
      />

      <RequiredLabel colors={colors}>
        {t(isChaletRental ? 'dailyPriceLabel' : 'listingPriceLabel')}
      </RequiredLabel>
      <TextInput
        style={[styles.input, { borderColor: colors.inputBorder, color: colors.text }]}
        placeholder={t('listingPricePlaceholder')}
        placeholderTextColor={colors.placeholderText}
        keyboardType="numeric"
        value={price}
        onChangeText={(text) => setPrice(toEnglishDigits(text))}
      />

      <RequiredLabel colors={colors}>{t('listingAreaLabel')}</RequiredLabel>
      <TextInput
        style={[styles.input, { borderColor: colors.inputBorder, color: colors.text }]}
        placeholder={t('listingAreaPlaceholder')}
        placeholderTextColor={colors.placeholderText}
        keyboardType="numeric"
        value={area}
        onChangeText={(text) => setArea(toEnglishDigits(text))}
      />

      <RequiredLabel colors={colors}>{t('agentPhoneLabel')}</RequiredLabel>
      <PhoneInput
        value={agentPhone}
        onChangeText={setAgentPhone}
        colors={colors}
        placeholder={t('authPhonePlaceholder')}
      />

      <RequiredLabel colors={colors}>{t('descriptionLabel')}</RequiredLabel>
      <TextInput
        style={[
          styles.input,
          styles.textArea,
          { borderColor: colors.inputBorder, color: colors.text },
        ]}
        placeholder={t('descriptionPlaceholder')}
        placeholderTextColor={colors.placeholderText}
        multiline
        numberOfLines={4}
        maxLength={MAX_DESCRIPTION_LENGTH}
        value={description}
        onChangeText={setDescription}
      />
      <Text
        style={[
          styles.charCount,
          {
            color: description.trim().length < MIN_DESCRIPTION_LENGTH ? colors.danger : colors.textMuted,
            // RN's Text has no logical 'start'/'end' textAlign — the same
            // physical-vs-logical gap the rest of this app works around by
            // checking `language` directly rather than assuming 'left'.
            textAlign: language === 'ar' ? 'left' : 'right',
          },
        ]}
      >
        {description.trim().length < MIN_DESCRIPTION_LENGTH
          ? t('descriptionTooShort').replace('{min}', String(MIN_DESCRIPTION_LENGTH))
          : `${description.length}/${MAX_DESCRIPTION_LENGTH}`}
      </Text>

      <Text style={[styles.label, { color: colors.textMuted }]}>{t('purposeLabel')}</Text>
      <View style={styles.chipRow}>
        {LISTING_TYPES.map((type) => (
          <Chip
            key={type}
            label={t(LISTING_TYPE_LABEL_KEYS[type])}
            active={listingType === type}
            colors={colors}
            onPress={() => setListingType(type)}
          />
        ))}
      </View>

      <Text style={[styles.label, styles.sectionSpacing, { color: colors.textMuted }]}>
        {t('propertyTypeLabel')}
      </Text>
      <Pressable
        onPress={() => setPropertyTypePickerVisible(true)}
        style={[styles.dropdownField, { borderColor: colors.inputBorder }]}
      >
        <Text style={{ color: colors.text }}>{t(PROPERTY_TYPE_LABEL_KEYS[propertyType])}</Text>
        <Ionicons name="chevron-down" size={16} color={colors.textMuted} />
      </Pressable>

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
              {PROPERTY_TYPES.map((type) => {
                const active = propertyType === type;
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
                      {t(PROPERTY_TYPE_LABEL_KEYS[type])}
                    </Text>
                    {active && <Ionicons name="checkmark" size={18} color={colors.accent} />}
                  </Pressable>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      <Text style={[styles.label, styles.sectionSpacing, { color: colors.textMuted }]}>
        {t('cityLabel')}
      </Text>
      <Pressable
        onPress={openLocationPicker}
        style={[styles.dropdownField, { borderColor: colors.inputBorder }]}
      >
        <Text style={{ color: city ? colors.text : colors.placeholderText }}>
          {!city
            ? t('cityPlaceholder')
            : district
            ? t(DISTRICTS.find((item) => item.key === district)?.labelKey)
            : t(CITIES.find((item) => item.key === city)?.labelKey)}
        </Text>
        <Ionicons name="chevron-down" size={16} color={colors.textMuted} />
      </Pressable>

      <Modal
        visible={locationPickerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setLocationPickerVisible(false)}
        statusBarTranslucent
        navigationBarTranslucent
      >
        <Pressable
          style={[styles.pickerModalBackdrop, { backgroundColor: colors.backdrop }]}
          onPress={() => setLocationPickerVisible(false)}
        >
          <Pressable
            style={[styles.pickerModalCard, { backgroundColor: colors.surface }]}
            onPress={() => {}}
          >
            <View style={styles.pickerModalHeaderRow}>
              {locationPickerStep === 'district' && (
                <Pressable
                  onPress={() => setLocationPickerStep('city')}
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
                {locationPickerStep === 'city'
                  ? t('cityLabel')
                  : t(CITIES.find((item) => item.key === city)?.labelKey)}
              </Text>
            </View>
            <ScrollView>
              {locationPickerStep === 'city'
                ? sortedCities.map((item) => {
                    const active = city === item.key;
                    return (
                      <Pressable
                        key={item.key}
                        onPress={() => handleCityChange(item.key)}
                        style={[styles.pickerOption, active && { backgroundColor: `${colors.accent}22` }]}
                      >
                        <Text
                          style={[
                            styles.pickerOptionText,
                            { color: active ? colors.accent : colors.text },
                            active && styles.pickerOptionTextActive,
                          ]}
                        >
                          {t(item.labelKey)}
                        </Text>
                        {active && <Ionicons name="checkmark" size={18} color={colors.accent} />}
                      </Pressable>
                    );
                  })
                : ['skip', ...districtsForCity.map((item) => item.key)].map((key) => {
                    const active = key === 'skip' ? !district : district === key;
                    const label =
                      key === 'skip' ? t('districtSkipOption') : t(DISTRICTS.find((item) => item.key === key).labelKey);
                    return (
                      <Pressable
                        key={key}
                        onPress={() => handleDistrictChange(key === 'skip' ? null : key)}
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

      {roomsRequired && (
        <>
          <RequiredLabel colors={colors} style={styles.sectionSpacing}>
            {t('roomsLabel')}
          </RequiredLabel>
          <View style={styles.chipRow}>
            {ROOM_OPTIONS.map((option) => (
              <Chip
                key={option}
                label={option}
                active={rooms === option}
                colors={colors}
                onPress={() => setRooms(option)}
              />
            ))}
          </View>
        </>
      )}

      {isChaletRental && (
        <>
          <Text style={[styles.label, styles.sectionSpacing, { color: colors.textMuted }]}>
            {t('amenitiesLabel')}
          </Text>
          <View style={styles.chipRow}>
            {AMENITIES.map((key) => (
              <Chip
                key={key}
                label={t(AMENITY_LABEL_KEYS[key])}
                active={amenities.includes(key)}
                colors={colors}
                onPress={() => toggleAmenity(key)}
              />
            ))}
          </View>
        </>
      )}

      {isChaletRental && (
        <>
          <RequiredLabel colors={colors} style={styles.sectionSpacing}>
            {t('audienceLabel')}
          </RequiredLabel>
          <View style={styles.chipRow}>
            {AUDIENCE_OPTIONS.map((option) => (
              <Chip
                key={option}
                label={t(AUDIENCE_LABEL_KEYS[option])}
                active={audienceTarget === option}
                colors={colors}
                onPress={() => setAudienceTarget(option)}
              />
            ))}
          </View>
        </>
      )}

      <RequiredLabel colors={colors} style={styles.sectionSpacing}>
        {t('photosLabel')}
      </RequiredLabel>
      <Text style={[styles.photosHint, { color: colors.textMuted }]}>
        {t('photosCountHint')
          .replace('{count}', String(images.length))
          .replace('{min}', String(MIN_PHOTOS))
          .replace('{max}', String(MAX_PHOTOS))}
      </Text>
      <View style={styles.photoRow}>
        {images.map((uri) =>
          isVideoUrl(uri) ? (
            <View key={uri} style={styles.photoThumbWrapper}>
              <View style={[styles.photoThumb, styles.videoThumbPlaceholder, { backgroundColor: colors.border }]}>
                <Ionicons name="play-circle" size={28} color={colors.text} />
              </View>
              <Pressable
                style={[styles.removePhotoButton, { backgroundColor: colors.danger }]}
                onPress={() => removeImage(uri)}
              >
                <Ionicons name="close" size={12} color="#fff" />
              </Pressable>
            </View>
          ) : (
            <View key={uri} style={styles.photoThumbWrapper}>
              <Image source={{ uri }} style={styles.photoThumb} />
              <Pressable
                style={[styles.removePhotoButton, { backgroundColor: colors.danger }]}
                onPress={() => removeImage(uri)}
              >
                <Ionicons name="close" size={12} color="#fff" />
              </Pressable>
            </View>
          )
        )}
        {images.length < MAX_PHOTOS && (
          <Pressable
            style={[styles.addPhotoButton, { borderColor: colors.accent }]}
            onPress={handlePickImage}
          >
            <Ionicons name="camera" size={20} color={colors.accent} />
          </Pressable>
        )}
      </View>

      <Text style={[styles.label, styles.sectionSpacing, { color: colors.textMuted }]}>
        {t('locationLabel')}
      </Text>
      <Text style={[styles.hint, { color: colors.textMuted }]}>{t('locationHint')}</Text>
      <MapView
        style={styles.map}
        initialRegion={{ ...location, latitudeDelta: 0.15, longitudeDelta: 0.15 }}
        onPress={(event) => setLocation(event.nativeEvent.coordinate)}
        userInterfaceStyle={theme}
        customMapStyle={theme === 'dark' ? darkMapStyle : []}
      >
        <Marker coordinate={location} />
      </MapView>

      <Pressable
        style={[
          styles.submitButton,
          { backgroundColor: canSubmit ? colors.accent : colors.disabled },
        ]}
        onPress={handleSubmit}
        disabled={!canSubmit || submitting}
      >
        {submitting ? (
          <ActivityIndicator color={colors.accentText} />
        ) : (
          <Text style={[styles.submitText, { color: colors.accentText }]}>
            {editingId ? t('saveChanges') : t('submitForReview')}
          </Text>
        )}
      </Pressable>

      <Pressable style={styles.cancelButton} onPress={handleCancel} disabled={submitting}>
        <Text style={[styles.cancelText, { color: colors.danger }]}>{t('cancel')}</Text>
      </Pressable>
    </ScrollView>
  );
}

// A red "*" appended to a field label — only for fields canSubmit actually
// gates on, not decorative on every label (amenities/city stay unmarked
// since they're genuinely optional).
function RequiredLabel({ children, colors, style }) {
  return (
    <Text style={[styles.label, style, { color: colors.textMuted }]}>
      {children} <Text style={{ color: colors.danger }}>*</Text>
    </Text>
  );
}

function Chip({ label, active, colors, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.chip,
        { borderColor: colors.accent },
        active && { backgroundColor: colors.accent },
      ]}
    >
      <Text style={[styles.chipText, { color: active ? colors.accentText : colors.accent }]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
  },
  successBoostSection: {
    width: '100%',
    marginTop: 8,
  },
  label: {
    fontSize: 14,
    marginBottom: 6,
  },
  photosHint: {
    fontSize: 12,
    marginBottom: 10,
  },
  charCount: {
    fontSize: 12,
    textAlign: 'right',
    marginTop: 4,
  },
  requiredLegend: {
    fontSize: 12,
    marginBottom: 12,
  },
  sectionSpacing: {
    marginTop: 12,
  },
  hint: {
    fontSize: 12,
    marginBottom: 10,
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    marginBottom: 16,
  },
  textArea: {
    minHeight: 90,
    textAlignVertical: 'top',
  },
  dropdownField: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 16,
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
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 6,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 18,
    borderWidth: 1,
  },
  chipText: {
    fontWeight: '600',
    fontSize: 13,
  },
  photoRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 6,
  },
  photoThumbWrapper: {
    width: 72,
    height: 72,
  },
  photoThumb: {
    width: 72,
    height: 72,
    borderRadius: 8,
  },
  videoThumbPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  removePhotoButton: {
    position: 'absolute',
    top: -6,
    end: -6,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addPhotoButton: {
    width: 72,
    height: 72,
    borderRadius: 8,
    borderWidth: 1,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  map: {
    width: '100%',
    height: 340,
    borderRadius: 12,
    marginBottom: 20,
  },
  submitButton: {
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  submitText: {
    fontWeight: '700',
    fontSize: 15,
  },
  cancelButton: {
    paddingVertical: 14,
    alignItems: 'center',
  },
  cancelText: {
    fontWeight: '600',
    fontSize: 14,
  },
});
