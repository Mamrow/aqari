import { useEffect, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppContext } from '../context/AppContext';
import Avatar from '../components/Avatar';
import ListingCard from '../components/ListingCard';
import PlaceholderScreen from '../components/PlaceholderScreen';
import { useT } from '../i18n/useT';
import { useThemeColors } from '../theme/useThemeColors';

const formatMonthYear = (iso, language) => {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleDateString(language === 'ar' ? 'ar-LY' : 'en-GB', {
      month: 'long',
      year: 'numeric',
    });
  } catch {
    // Hermes' Intl is the one piece of this that can be missing; the year
    // alone still says how long someone has been around.
    return String(new Date(iso).getFullYear());
  }
};

/**
 * One seller: who they are, and what they have listed.
 *
 * Keyed on the seller's account id (listing.sellerId), not their phone — a
 * phone number can change, and after a change the listings follow the
 * account, not the old number.
 *
 * The listings come from the listings already in context, so this page works
 * with or without migration_seller_profiles.sql; only the name, photo and
 * join date need the RPC.
 */
export default function SellerProfileScreen({ route, navigation }) {
  const { sellerId, name: nameFromListing } = route.params;
  const { listings, isAdmin, blockedSellers, fetchSellerProfile, language } = useAppContext();
  const t = useT();
  const colors = useThemeColors();
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetchSellerProfile(sellerId).then((result) => {
      if (!cancelled) setProfile(result);
    });
    return () => {
      cancelled = true;
    };
  }, [sellerId, fetchSellerProfile]);

  const sellerListings = listings.filter((listing) => listing.sellerId === sellerId);
  // What a buyer can see anywhere else in the app: approved, and not expired
  // or sold. An admin sees everything, labelled, because this page is also
  // where they'd look at a seller's whole history — rejected listings are
  // part of deciding whether to trust the next one.
  const visibleListings = isAdmin
    ? sellerListings
    : sellerListings.filter(
        (listing) =>
          listing.status === 'approved' &&
          listing.listingState !== 'expired' &&
          listing.listingState !== 'sold'
      );
  // Blocks are by phone. Any of this seller's numbers counts, since one
  // account can have listed under more than one.
  const isBlocked =
    !isAdmin && sellerListings.some((listing) => blockedSellers.includes(listing.agentId));

  const displayName = profile?.name || nameFromListing || t('sellerFallbackName');
  const memberSince = formatMonthYear(profile?.memberSince, language);

  useEffect(() => {
    navigation.setOptions({ title: t('sellerProfileTitle') });
  }, [navigation, t]);

  const header = (
    <View style={styles.header}>
      <Avatar uri={profile?.avatarUrl} name={displayName} size={84} colors={colors} />
      <View style={styles.nameRow}>
        <Text style={[styles.name, { color: colors.heading }]} numberOfLines={2}>
          {displayName}
        </Text>
        {profile?.verified && <Ionicons name="checkmark-circle" size={20} color={colors.accent} />}
      </View>
      {memberSince && (
        <Text style={[styles.meta, { color: colors.textMuted }]}>
          {t('sellerMemberSince').replace('{date}', memberSince)}
        </Text>
      )}
      {!isBlocked && (
        <Text style={[styles.meta, { color: colors.textMuted }]}>
          {t('sellerListingsCount').replace('{count}', String(visibleListings.length))}
        </Text>
      )}
      <View style={[styles.rule, { backgroundColor: colors.border }]} />
    </View>
  );

  if (isBlocked) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        {header}
        <PlaceholderScreen
          icon="ban-outline"
          title={t('sellerBlockedTitle')}
          subtitle={t('sellerBlockedSubtitle')}
          inline
        />
      </View>
    );
  }

  return (
    <FlatList
      style={{ backgroundColor: colors.background }}
      data={visibleListings}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.listContent}
      ListHeaderComponent={header}
      ListEmptyComponent={
        <PlaceholderScreen
          icon="home-outline"
          title={t('sellerNoListingsTitle')}
          subtitle={t('sellerNoListingsSubtitle')}
          inline
        />
      }
      renderItem={({ item }) => (
        <ListingCard
          listing={item}
          showStatus={isAdmin}
          // push, not navigate: from a listing to its seller and back into
          // another of their listings should stack, so Back retraces the
          // path instead of jumping to whichever ListingDetail was open.
          onPress={() => navigation.push('ListingDetail', { listingId: item.id })}
        />
      )}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  listContent: { padding: 12, gap: 10, paddingBottom: 32 },
  header: { alignItems: 'center', paddingTop: 12, paddingBottom: 4 },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
    paddingHorizontal: 16,
  },
  name: { fontSize: 22, fontWeight: '700', textAlign: 'center' },
  meta: { marginTop: 4, fontSize: 13 },
  rule: { alignSelf: 'stretch', height: StyleSheet.hairlineWidth, marginTop: 16 },
});
