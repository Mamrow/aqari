import { useState } from 'react';
import { FlatList, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MapView, { Marker } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { useAppContext } from '../context/AppContext';
import PlaceholderScreen from '../components/PlaceholderScreen';
import { useT } from '../i18n/useT';
import { useThemeColors } from '../theme/useThemeColors';
import { darkMapStyle } from '../theme/darkMapStyle';
import { WHATSAPP_GREEN } from '../theme/colors';
import {
  LISTING_TYPE_LABEL_KEYS,
  PROPERTY_TYPE_LABEL_KEYS,
  AMENITY_LABEL_KEYS,
  AUDIENCE_LABEL_KEYS,
} from '../data/propertyTypes';
import { callAgent, whatsappAgent } from '../utils/contactActions';
import { isVideoUrl } from '../utils/media';
import MediaGalleryModal from '../components/MediaGalleryModal';
import GalleryImageItem from '../components/GalleryImageItem';

export default function ListingDetailScreen({ route }) {
  const { listingId } = route.params;
  const { listings, saved, toggleSave, requireAuth, theme } = useAppContext();
  const t = useT();
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const [galleryIndex, setGalleryIndex] = useState(null);

  const listing = listings.find((item) => item.id === listingId);

  if (!listing) {
    return <PlaceholderScreen title={t('listingNotFoundTitle')} subtitle={t('listingNotFoundSubtitle')} />;
  }

  const isSaved = saved.includes(listing.id);

  const handleCall = () => {
    requireAuth(() => callAgent(listing.agentPhone));
  };

  const handleWhatsapp = () => {
    requireAuth(() => {
      const message = t('whatsappMessageTemplate').replace('{title}', listing.title);
      whatsappAgent(listing.agentPhone, message);
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
            <Pressable onPress={() => setGalleryIndex(index)}>
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
        <Text style={[styles.price, { color: colors.accent }]}>
          {listing.price.toLocaleString('en-US')} {t('priceCurrency')}
          {listing.propertyType === 'chalet' && listing.listingType === 'rent' ? ` ${t('perDay')}` : ''}
        </Text>
        <View style={styles.headerActions}>
          <Pressable onPress={handleShare} hitSlop={8}>
            <Ionicons name="share-social-outline" size={24} color={colors.text} />
          </Pressable>
          <Pressable onPress={() => toggleSave(listing.id)} hitSlop={8}>
            <Ionicons
              name={isSaved ? 'heart' : 'heart-outline'}
              size={26}
              color={colors.danger}
            />
          </Pressable>
        </View>
      </View>

      <Text style={[styles.title, { color: colors.text }]}>{listing.title}</Text>
      <Text style={[styles.area, { color: colors.textMuted }]}>
        {listing.area.toLocaleString('en-US')} {t('areaUnit')}
        {listing.rooms ? ` · ${listing.rooms} ${t('roomsSuffix')}` : ''}
      </Text>

      {(listing.propertyType || listing.listingType) && (
        <Text style={[styles.badge, { color: colors.accent }]}>
          {[
            listing.propertyType && t(PROPERTY_TYPE_LABEL_KEYS[listing.propertyType]),
            listing.listingType && t(LISTING_TYPE_LABEL_KEYS[listing.listingType]),
          ]
            .filter(Boolean)
            .join(' · ')}
        </Text>
      )}

      {listing.audienceTarget && (
        <Text style={[styles.badge, { color: colors.textMuted }]}>
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
        <Text style={[styles.description, { color: colors.text }]}>{listing.description}</Text>
      ) : null}

      {listing.latitude != null && listing.longitude != null && (
        <>
          <Text style={[styles.label, { color: colors.textMuted }]}>{t('locationLabel')}</Text>
          <MapView
            style={styles.map}
            initialRegion={{
              latitude: listing.latitude,
              longitude: listing.longitude,
              latitudeDelta: 0.02,
              longitudeDelta: 0.02,
            }}
            userInterfaceStyle={theme}
            customMapStyle={theme === 'dark' ? darkMapStyle : []}
          >
            <Marker coordinate={{ latitude: listing.latitude, longitude: listing.longitude }} />
          </MapView>
        </>
      )}

      <View style={styles.actionRow}>
        <ActionButton icon="call" label={t('callButton')} colors={colors} onPress={handleCall} />
        <ActionButton
          icon="logo-whatsapp"
          label={t('whatsappButton')}
          colors={colors}
          backgroundColor={WHATSAPP_GREEN}
          onPress={handleWhatsapp}
        />
      </View>
    </ScrollView>
  );
}

function ActionButton({ icon, label, colors, backgroundColor, onPress }) {
  return (
    <Pressable
      style={[styles.actionButton, { backgroundColor: backgroundColor ?? colors.accent }]}
      onPress={onPress}
    >
      <Ionicons name={icon} size={20} color={colors.accentText} />
      <Text style={[styles.actionLabel, { color: colors.accentText }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
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
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 24,
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
});
