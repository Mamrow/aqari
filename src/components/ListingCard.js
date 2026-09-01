import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppContext } from '../context/AppContext';
import { useT } from '../i18n/useT';
import { useThemeColors } from '../theme/useThemeColors';
import { FEATURED_GOLD } from '../theme/colors';
import { LISTING_TYPE_LABEL_KEYS, PROPERTY_TYPE_LABEL_KEYS } from '../data/propertyTypes';
import { STATUS_LABEL_KEYS, getStatusColor } from '../data/listingStatus';
import { isVideoUrl } from '../utils/media';
import SkeletonImage from './SkeletonImage';
import { BOOST_PURCHASES_ENABLED } from '../config/features';

// The flashing/pulsing treatment for Featured lives only in the map view's
// bottom carousel (HomeMapScreen.js's own Animated mini-cards) — everywhere
// this component is used (list view, saved listings, My Listings, the
// selected-pin preview) gets the static gold border/banner only, no pulse.
export default function ListingCard({
  listing,
  style,
  onPress,
  showStatus,
  onDelete,
  showSaveButton = true,
  footer,
}) {
  const { saved, toggleSave, language } = useAppContext();
  const t = useT();
  const colors = useThemeColors();
  const isRTL = language === 'ar';
  const isSaved = saved.includes(listing.id);
  // Prefer an actual photo for the thumbnail — a live video player per list
  // row would be both slow and pointless at this size. Only fall back to a
  // placeholder if every picked item is a video.
  const thumbnailUri = listing.images?.find((uri) => !isVideoUrl(uri));

  // One spoken sentence for the whole card. Without this a screen reader
  // walks the price, title, area and badge as four separate stops, which is
  // slow and loses the association between them. The inner Text nodes are
  // hidden from accessibility below so nothing is announced twice.
  const spokenParts = [
    BOOST_PURCHASES_ENABLED && listing.isFeatured && t('a11yFeatured'),
    showStatus && listing.status && t(STATUS_LABEL_KEYS[listing.status]),
    `${listing.price.toLocaleString('en-US')} ${t('priceCurrency')}`,
    listing.title,
    `${listing.area.toLocaleString('en-US')} ${t('areaUnit')}`,
    listing.propertyType && t(PROPERTY_TYPE_LABEL_KEYS[listing.propertyType]),
    listing.listingType && t(LISTING_TYPE_LABEL_KEYS[listing.listingType]),
  ].filter(Boolean);

  return (
    <View style={[styles.card, BOOST_PURCHASES_ENABLED && listing.isFeatured && styles.featuredCard, style]}>
      <View
        style={[
          styles.cardInner,
          { backgroundColor: colors.surface },
          BOOST_PURCHASES_ENABLED && listing.isFeatured && { borderWidth: 2, borderColor: FEATURED_GOLD },
        ]}
      >
        {showStatus && listing.status && (
          <View
            style={[
              styles.statusBanner,
              { backgroundColor: getStatusColor(listing.status, colors) },
            ]}
          >
            <Text style={styles.statusText}>{t(STATUS_LABEL_KEYS[listing.status])}</Text>
          </View>
        )}
        <View style={[styles.contentRow, { direction: isRTL ? 'rtl' : 'ltr' }]}>
          <Pressable
            style={[styles.body, { direction: isRTL ? 'rtl' : 'ltr' }]}
            onPress={onPress}
            disabled={!onPress}
            accessibilityRole={onPress ? 'button' : undefined}
            accessibilityLabel={spokenParts.join('، ')}
            accessibilityHint={onPress ? t('a11yOpenListingHint') : undefined}
            testID="listing-card"
          >
            {thumbnailUri ? (
              <View accessibilityElementsHidden importantForAccessibility="no">
                <SkeletonImage uri={thumbnailUri} style={styles.image} colors={colors} />
              </View>
            ) : (
              <View style={[styles.image, styles.videoPlaceholder, { backgroundColor: colors.border }]}>
                <Ionicons name="play-circle" size={24} color={colors.text} />
              </View>
            )}
            <View style={styles.info} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
              <Text
                style={[
                  styles.price,
                  { color: colors.accent, textAlign: isRTL ? 'right' : 'left', writingDirection: isRTL ? 'rtl' : 'ltr' },
                ]}
              >
                {listing.price.toLocaleString('en-US')} {t('priceCurrency')}
                {listing.propertyType === 'chalet' && listing.listingType === 'rent'
                  ? ` ${t('perDay')}`
                  : ''}
              </Text>
              <Text
                style={[
                  styles.title,
                  { color: colors.text, textAlign: isRTL ? 'right' : 'left', writingDirection: isRTL ? 'rtl' : 'ltr' },
                ]}
                numberOfLines={1}
              >
                {listing.title}
              </Text>
              <Text
                style={[
                  styles.area,
                  { color: colors.textMuted, textAlign: isRTL ? 'right' : 'left', writingDirection: isRTL ? 'rtl' : 'ltr' },
                ]}
              >
                {listing.area.toLocaleString('en-US')} {t('areaUnit')}
              </Text>
              {(listing.propertyType || listing.listingType) && (
                <Text
                  style={[
                    styles.badge,
                    { color: colors.accent, textAlign: isRTL ? 'right' : 'left', writingDirection: isRTL ? 'rtl' : 'ltr' },
                  ]}
                >
                  {[
                    listing.propertyType && t(PROPERTY_TYPE_LABEL_KEYS[listing.propertyType]),
                    listing.listingType && t(LISTING_TYPE_LABEL_KEYS[listing.listingType]),
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
              )}
            </View>
          </Pressable>
          {showSaveButton && (
            <Pressable
              onPress={() => toggleSave(listing.id)}
              style={styles.saveButton}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={isSaved ? t('a11yUnsaveListing') : t('a11ySaveListing')}
              accessibilityState={{ selected: isSaved }}
              testID="listing-card-save"
            >
              <Ionicons
                name={isSaved ? 'heart' : 'heart-outline'}
                size={22}
                color={colors.danger}
              />
            </Pressable>
          )}
          {onDelete && (
            <Pressable
              onPress={onDelete}
              style={styles.saveButton}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={t('a11yDeleteListing')}
              testID="listing-card-delete"
            >
              <Ionicons name="trash" size={20} color={colors.danger} />
            </Pressable>
          )}
        </View>
        {footer && (
          <View style={[styles.footer, { borderTopColor: colors.border }]}>{footer}</View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  // A warmer, more noticeable shadow than the plain card default — part of
  // making Featured read as a real, worthwhile distinction at a glance.
  featuredCard: {
    shadowColor: FEATURED_GOLD,
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 5,
  },
  cardInner: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  statusBanner: {
    paddingVertical: 5,
    alignItems: 'center',
  },
  statusText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
  },
  body: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  image: {
    width: 72,
    height: 72,
    borderRadius: 8,
  },
  videoPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: {
    flex: 1,
    marginStart: 12,
    gap: 2,
  },
  price: {
    fontSize: 16,
    fontWeight: '700',
  },
  title: {
    fontSize: 14,
  },
  area: {
    fontSize: 12,
  },
  badge: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },
  saveButton: {
    // 44x44 is the iOS HIG minimum and comfortably above Android's 48dp
    // guidance once hitSlop is added; previously this was an ~38x30 box
    // that only met the target via hitSlop, which assistive tech doesn't
    // account for when reporting element size.
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  footer: {
    borderTopWidth: 1,
    padding: 10,
  },
});
