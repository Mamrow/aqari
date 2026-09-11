import { useState } from 'react';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import SimpleMap from '../components/map/SimpleMap';
import { Ionicons } from '@expo/vector-icons';
import { useAppContext } from '../context/AppContext';
import PlaceholderScreen from '../components/PlaceholderScreen';
import { useT } from '../i18n/useT';
import { useThemeColors } from '../theme/useThemeColors';
import { WHATSAPP_GREEN } from '../theme/colors';
import {
  LISTING_TYPE_LABEL_KEYS,
  PROPERTY_TYPE_LABEL_KEYS,
  AMENITY_LABEL_KEYS,
  AUDIENCE_LABEL_KEYS,
} from '../data/propertyTypes';
import { REPORT_REASONS, REPORT_REASON_LABEL_KEYS } from '../data/reportReasons';
import { callAgent, whatsappAgent } from '../utils/contactActions';
import { isVideoUrl } from '../utils/media';
import MediaGalleryModal from '../components/MediaGalleryModal';
import GalleryImageItem from '../components/GalleryImageItem';

export default function ListingDetailScreen({ route, navigation }) {
  const { listingId } = route.params;
  const {
    listings,
    saved,
    toggleSave,
    requireAuth,
    theme,
    getMyId,
    reportListing,
    agents,
    blockedSellers,
    blockSeller,
    unblockSeller,
    language,
  } = useAppContext();
  const t = useT();
  const colors = useThemeColors();
  const isRTL = language === 'ar';
  const rtlText = { textAlign: isRTL ? 'right' : 'left' };
  const insets = useSafeAreaInsets();
  const [galleryIndex, setGalleryIndex] = useState(null);
  const [reportModalVisible, setReportModalVisible] = useState(false);
  const [reportReason, setReportReason] = useState(null);
  const [reportNote, setReportNote] = useState('');
  const [reportSubmitting, setReportSubmitting] = useState(false);

  const listing = listings.find((item) => item.id === listingId);

  if (!listing) {
    return <PlaceholderScreen title={t('listingNotFoundTitle')} subtitle={t('listingNotFoundSubtitle')} />;
  }

  const isSaved = saved.includes(listing.id);
  // The owner viewing their own listing gets an Edit button instead of
  // Call/WhatsApp — contacting yourself isn't a real action.
  const isOwner = listing.agentId === getMyId();
  // Looked up from the registered-sellers directory (agents), not stored on
  // the listing itself — the same directory AdminAgentsScreen's verify
  // toggle writes to. A listing whose agent never got registered (shouldn't
  // normally happen — submitListing always upserts one) just shows no name.
  const listingAgent = agents.find((agent) => agent.phone === listing.agentId);
  const isBlocked = blockedSellers.includes(listing.agentId);

  // This screen is reachable from three different stacks (Home, Favorites,
  // My Listings) — 'AddListing' only actually exists inside MyListingsStack,
  // so a plain navigation.navigate('AddListing', ...) works when reached via
  // My Listings but silently fails from Home/Favorites (e.g. an owner
  // browsing the map who taps their own listing, or one they'd favorited).
  // Routing explicitly through the MyListings tab works from all three.
  const handleEdit = () => {
    navigation
      .getParent()
      ?.navigate('MyListings', { screen: 'AddListing', params: { listingId: listing.id } });
  };

  const handleContactError = () => {
    Alert.alert(t('contactErrorTitle'), t('contactErrorMessage'));
  };

  const handleCall = () => {
    requireAuth(() => callAgent(listing.agentPhone, handleContactError));
  };

  const handleWhatsapp = () => {
    requireAuth(() => {
      const message = t('whatsappMessageTemplate').replace('{title}', listing.title);
      whatsappAgent(listing.agentPhone, message, handleContactError);
    });
  };

  // No sign-in required — sharing doesn't write anything, same as browsing.
  const handleShare = () => {
    const message = t('shareMessageTemplate')
      .replace('{title}', listing.title)
      .replace('{price}', listing.price.toLocaleString('en-US'))
      .replace('{currency}', t('priceCurrency'))
      .replace('{area}', listing.area.toLocaleString('en-US'))
      .replace('{areaUnit}', t('areaUnit'));
    Share.share({ message }).catch(() => {});
  };

  const handleToggleBlock = () => {
    if (isBlocked) {
      unblockSeller(listing.agentId);
      return;
    }
    requireAuth(() => {
      Alert.alert(
        t('blockSellerConfirmTitle'),
        t('blockSellerConfirmMessage'),
        [
          { text: t('cancel'), style: 'cancel' },
          {
            text: t('blockSellerButton'),
            style: 'destructive',
            onPress: () => blockSeller(listing.agentId),
          },
        ]
      );
    });
  };

  const openReportModal = () => {
    requireAuth(() => {
      setReportReason(null);
      setReportNote('');
      setReportModalVisible(true);
    });
  };

  const handleSubmitReport = async () => {
    if (!reportReason) return;
    setReportSubmitting(true);
    try {
      await reportListing(listing.id, reportReason, reportNote);
      setReportModalVisible(false);
      Alert.alert(t('reportSubmittedTitle'), t('reportSubmittedMessage'));
    } catch (error) {
      console.warn('reportListing error', error);
      Alert.alert(t('reportErrorTitle'), t('reportErrorMessage'));
    } finally {
      setReportSubmitting(false);
    }
  };

  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={styles.container}>
      {listing.images?.length > 0 ? (
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.gallery}
          data={listing.images}
          keyExtractor={(uri) => uri}
          renderItem={({ item: uri, index }) => (
            <Pressable
              onPress={() => setGalleryIndex(index)}
              accessibilityRole="imagebutton"
              accessibilityLabel={`${index + 1} / ${listing.images.length}`}
              accessibilityHint={t('a11yOpenGalleryHint')}
            >
              {isVideoUrl(uri) ? (
                <View style={[styles.image, styles.videoThumbPlaceholder, { backgroundColor: colors.border }]}>
                  <Ionicons name="play-circle" size={36} color={colors.text} />
                </View>
              ) : (
                <GalleryImageItem uri={uri} style={styles.image} colors={colors} />
              )}
            </Pressable>
          )}
        />
      ) : (
        <View style={[styles.image, styles.imagePlaceholder, { backgroundColor: colors.border }]} />
      )}

      <MediaGalleryModal
        visible={galleryIndex !== null}
        media={listing.images ?? []}
        initialIndex={galleryIndex ?? 0}
        onClose={() => setGalleryIndex(null)}
        topInset={insets.top}
      />

      <View style={styles.headerRow}>
        <Text style={[styles.price, rtlText, { color: colors.accent }]}>
          {listing.price.toLocaleString('en-US')} {t('priceCurrency')}
          {listing.propertyType === 'chalet' && listing.listingType === 'rent' ? ` ${t('perDay')}` : ''}
        </Text>
        <View style={styles.headerActions}>
          <Pressable
            onPress={handleShare}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={t('a11yShareListing')}
            testID="listing-share"
          >
            <Ionicons name="share-social-outline" size={24} color={colors.text} />
          </Pressable>
          <Pressable
            onPress={() => toggleSave(listing.id)}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={isSaved ? t('a11yUnsaveListing') : t('a11ySaveListing')}
            accessibilityState={{ selected: isSaved }}
            testID="listing-favorite"
          >
            <Ionicons
              name={isSaved ? 'heart' : 'heart-outline'}
              size={26}
              color={colors.danger}
            />
          </Pressable>
        </View>
      </View>

      <Text style={[styles.title, rtlText, { color: colors.text }]}>{listing.title}</Text>
      <Text style={[styles.area, rtlText, { color: colors.textMuted }]}>
        {listing.area.toLocaleString('en-US')} {t('areaUnit')}
        {listing.rooms ? ` · ${listing.rooms} ${t('roomsSuffix')}` : ''}
      </Text>

      {(listing.propertyType || listing.listingType) && (
        <Text style={[styles.badge, rtlText, { color: colors.accent }]}>
          {[
            listing.propertyType && t(PROPERTY_TYPE_LABEL_KEYS[listing.propertyType]),
            listing.listingType && t(LISTING_TYPE_LABEL_KEYS[listing.listingType]),
          ]
            .filter(Boolean)
            .join(' · ')}
        </Text>
      )}

      {listing.audienceTarget && (
        <Text style={[styles.badge, rtlText, { color: colors.textMuted }]}>
          {t('audienceLabel')}: {t(AUDIENCE_LABEL_KEYS[listing.audienceTarget])}
        </Text>
      )}

      {listing.amenities?.length > 0 && (
        <View style={styles.amenitiesRow}>
          {listing.amenities.map((amenity) => (
            <View
              key={amenity}
              style={[styles.amenityChip, { backgroundColor: colors.surface, borderColor: colors.border }]}
            >
              <Text style={[styles.amenityText, { color: colors.text }]}>
                {t(AMENITY_LABEL_KEYS[amenity])}
              </Text>
            </View>
          ))}
        </View>
      )}

      {listing.description ? (
        <Text style={[styles.description, rtlText, { color: colors.text }]}>{listing.description}</Text>
      ) : null}

      {listing.latitude != null && listing.longitude != null && (
        <>
          <Text style={[styles.label, rtlText, { color: colors.textMuted }]}>{t('locationLabel')}</Text>
          <SimpleMap
            style={styles.map}
            latitude={listing.latitude}
            longitude={listing.longitude}
            zoom={15}
            theme={theme}
            colors={colors}
          />
        </>
      )}

      {!isOwner && listingAgent && (
        <View style={styles.listedByRow}>
          <Text style={[styles.listedByText, rtlText, { color: colors.textMuted }]}>
            {t('listedByLabel')} {listingAgent.name}
          </Text>
          {listingAgent.verified && (
            <View style={styles.verifiedBadge}>
              <Ionicons name="checkmark-circle" size={13} color={colors.accent} />
              <Text style={[styles.verifiedBadgeText, { color: colors.accent }]}>
                {t('verifiedAgentLabel')}
              </Text>
            </View>
          )}
        </View>
      )}

      {/* A listing whose seller deleted their account has an empty
          agentPhone (see supabase/functions/delete-account) — showing Call/
          WhatsApp buttons that are guaranteed to fail is worse than not
          showing them at all. */}
      {isOwner || listing.agentPhone ? (
        <View style={styles.actionRow}>
          {isOwner ? (
            <ActionButton
              icon="create-outline"
              label={t('editListingButton')}
              colors={colors}
              onPress={handleEdit}
            />
          ) : (
            <>
              <ActionButton
                icon="call"
                label={t('callButton')}
                colors={colors}
                onPress={handleCall}
                accessibilityLabel={t('a11yCallSeller')}
                testID="listing-call"
              />
              <ActionButton
                icon="logo-whatsapp"
                label={t('whatsappButton')}
                colors={colors}
                backgroundColor={WHATSAPP_GREEN}
                onPress={handleWhatsapp}
                accessibilityLabel={t('a11yWhatsappSeller')}
                testID="listing-whatsapp"
              />
            </>
          )}
        </View>
      ) : (
        <Text style={[styles.sellerUnavailable, { color: colors.textMuted }]}>
          {t('sellerUnavailableMessage')}
        </Text>
      )}

      {!isOwner && (
        <View style={styles.safetyRow}>
          <Pressable
            style={styles.reportLink}
            onPress={openReportModal}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={t('a11yReportListing')}
            testID="listing-report"
          >
            <Ionicons name="flag-outline" size={14} color={colors.textMuted} />
            <Text style={[styles.reportLinkText, { color: colors.textMuted }]}>
              {t('reportListingButton')}
            </Text>
          </Pressable>
          <Pressable
            style={styles.reportLink}
            onPress={handleToggleBlock}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={isBlocked ? t('a11yUnblockSeller') : t('a11yBlockSeller')}
            accessibilityState={{ selected: isBlocked }}
            testID="listing-block-seller"
          >
            <Ionicons
              name={isBlocked ? 'person-remove' : 'person-remove-outline'}
              size={14}
              color={colors.textMuted}
            />
            <Text style={[styles.reportLinkText, { color: colors.textMuted }]}>
              {isBlocked ? t('unblockSellerButton') : t('blockSellerButton')}
            </Text>
          </Pressable>
        </View>
      )}

      <Modal
        visible={reportModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setReportModalVisible(false)}
        statusBarTranslucent
        navigationBarTranslucent
      >
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
        <Pressable
          style={[styles.reportBackdrop, { backgroundColor: colors.backdrop }]}
          onPress={() => setReportModalVisible(false)}
        >
          <Pressable style={[styles.reportCard, { backgroundColor: colors.surface }]} onPress={() => {}}>
            <Text style={[styles.reportTitle, rtlText, { color: colors.text }]}>{t('reportModalTitle')}</Text>

            {REPORT_REASONS.map((reason) => {
              const active = reportReason === reason;
              return (
                <Pressable
                  key={reason}
                  onPress={() => setReportReason(reason)}
                  style={[styles.reportOption, active && { backgroundColor: `${colors.accent}22` }]}
                >
                  <Text
                    style={[
                      styles.reportOptionText,
                      rtlText,
                      { color: active ? colors.accent : colors.text },
                      active && styles.reportOptionTextActive,
                    ]}
                  >
                    {t(REPORT_REASON_LABEL_KEYS[reason])}
                  </Text>
                  {active && <Ionicons name="checkmark" size={18} color={colors.accent} />}
                </Pressable>
              );
            })}

            <TextInput
              style={[styles.reportNoteInput, rtlText, { borderColor: colors.inputBorder, color: colors.text }]}
              placeholder={t('reportNotePlaceholder')}
              placeholderTextColor={colors.placeholderText}
              value={reportNote}
              onChangeText={setReportNote}
              multiline
            />

            <Pressable
              style={[
                styles.reportSubmitButton,
                { backgroundColor: reportReason ? colors.accent : colors.disabled },
              ]}
              disabled={!reportReason || reportSubmitting}
              onPress={handleSubmitReport}
            >
              <Text style={[styles.reportSubmitText, { color: colors.accentText }]}>
                {reportSubmitting ? '…' : t('reportSubmitButton')}
              </Text>
            </Pressable>
          </Pressable>
        </Pressable>
        </KeyboardAvoidingView>
      </Modal>
    </ScrollView>
  );
}

function ActionButton({ icon, label, colors, backgroundColor, onPress, accessibilityLabel, testID }) {
  return (
    <Pressable
      style={[styles.actionButton, { backgroundColor: backgroundColor ?? colors.accent }]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      testID={testID}
    >
      {/* Decorative: the button's own label already carries the meaning. */}
      <Ionicons name={icon} size={20} color={colors.accentText} accessibilityElementsHidden importantForAccessibility="no" />
      <Text style={[styles.actionLabel, { color: colors.accentText }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  container: {
    padding: 16,
    // Breathing room under the last control (Edit/Delete on your own
    // listing), so it never ends flush against the tab bar.
    paddingBottom: 40,
  },
  gallery: {
    marginBottom: 16,
  },
  image: {
    width: 320,
    height: 220,
    borderRadius: 14,
    marginEnd: 10,
  },
  imagePlaceholder: {
    width: '100%',
  },
  videoThumbPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  price: {
    fontSize: 22,
    fontWeight: '700',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  title: {
    fontSize: 16,
    marginTop: 8,
  },
  area: {
    fontSize: 13,
    marginTop: 4,
  },
  badge: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: 8,
  },
  amenitiesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  amenityChip: {
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  amenityText: {
    fontSize: 12,
    fontWeight: '600',
  },
  description: {
    fontSize: 14,
    lineHeight: 20,
    marginTop: 16,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: 16,
    marginBottom: 8,
  },
  map: {
    width: '100%',
    height: 180,
    borderRadius: 12,
  },
  locationPin: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 3,
    borderColor: '#fff',
  },
  listedByRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 16,
  },
  listedByText: {
    fontSize: 13,
  },
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  verifiedBadgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 24,
  },
  sellerUnavailable: {
    marginTop: 24,
    fontSize: 13,
    textAlign: 'center',
  },
  actionButton: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    gap: 4,
  },
  actionLabel: {
    fontWeight: '700',
    fontSize: 12,
  },
  safetyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: 20,
    marginTop: 14,
  },
  reportLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  reportLinkText: {
    fontSize: 12,
    fontWeight: '600',
  },
  reportBackdrop: {
    flex: 1,
    justifyContent: 'center',
    padding: 32,
  },
  reportCard: {
    borderRadius: 16,
    padding: 16,
  },
  reportTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  reportOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    paddingVertical: 12,
    borderRadius: 10,
  },
  reportOptionText: {
    fontSize: 15,
    fontWeight: '500',
  },
  reportOptionTextActive: {
    fontWeight: '700',
  },
  reportNoteInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    marginTop: 8,
    minHeight: 70,
    textAlignVertical: 'top',
  },
  reportSubmitButton: {
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 12,
  },
  reportSubmitText: {
    fontWeight: '700',
    fontSize: 14,
  },
});
