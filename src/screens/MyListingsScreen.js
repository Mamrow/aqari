import { useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useAppContext } from '../context/AppContext';
import ListingCard from '../components/ListingCard';
import BoostListingSection from '../components/BoostListingSection';
import { BOOST_PURCHASES_ENABLED } from '../config/features';
import PlaceholderScreen from '../components/PlaceholderScreen';
import LoadingView from '../components/LoadingView';
import SearchBar from '../components/SearchBar';
import { useT } from '../i18n/useT';
import { dayWord } from '../i18n/pluralDays';
import { useThemeColors } from '../theme/useThemeColors';
import { friendlyErrorMessage } from '../utils/friendlyError';
import StatusScreen from '../components/StatusScreen';

// Only the last day gets a banner — a 30-day-out countdown nagging on every
// approved listing was more noise than signal.
const EXPIRING_SOON_DAYS = 1;

// Whole days between now and the given ISO timestamp, rounded up so
// "expires in a few hours" still reads as 1 day left, not 0.
const daysUntil = (iso) => {
  if (!iso) return null;
  return Math.ceil((new Date(iso).getTime() - Date.now()) / (24 * 60 * 60 * 1000));
};

export default function MyListingsScreen({ navigation }) {
  const {
    listings,
    getMyId,
    deleteListing,
    dataLoading,
    requireAuth,
    renewListing,
    markListingSold,
    markListingAvailable,
    language,
    dataErrors,
    fetchListings,
  } = useAppContext();
  const t = useT();
  const colors = useThemeColors();
  const [searchQuery, setSearchQuery] = useState('');
  const allMyListings = listings.filter((listing) => listing.agentId === getMyId());
  const myListings = allMyListings.filter((listing) =>
    searchQuery.trim()
      ? listing.title.toLowerCase().includes(searchQuery.trim().toLowerCase())
      : true
  );

  const handleRenew = (listing) => {
    Alert.alert(t('renewListingConfirmTitle'), t('renewListingConfirmMessage'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('renewListingButton'),
        onPress: async () => {
          try {
            await renewListing(listing.id);
            Alert.alert(t('renewListingSuccessTitle'), t('renewListingSuccessMessage'));
          } catch (error) {
            console.warn('renewListing failed', error);
            Alert.alert(t('errorGenericTitle'), friendlyErrorMessage(error, t));
          }
        },
      },
    ]);
  };

  const handleMarkSold = (listing) => {
    const isRent = listing.listingType === 'rent';
    Alert.alert(
      isRent ? t('markAsRentedConfirmTitle') : t('markAsSoldConfirmTitle'),
      isRent ? t('markAsRentedConfirmMessage') : t('markAsSoldConfirmMessage'),
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: isRent ? t('markAsRentedButton') : t('markAsSoldButton'),
          style: 'destructive',
          onPress: async () => {
            try {
              await markListingSold(listing.id);
              Alert.alert(
                t('markSoldSuccessTitle'),
                isRent ? t('markRentedSuccessMessage') : t('markSoldSuccessMessage')
              );
            } catch (error) {
              console.warn('markListingSold failed', error);
              Alert.alert(t('errorGenericTitle'), friendlyErrorMessage(error, t));
            }
          },
        },
      ]
    );
  };

  const handleMarkAvailable = (listing) => {
    const isRent = listing.listingType === 'rent';
    Alert.alert(
      isRent ? t('markAsRentedAvailableConfirmTitle') : t('markAsSoldAvailableConfirmTitle'),
      t('markAsAvailableConfirmMessage'),
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('markAsAvailableButton'),
          onPress: async () => {
            try {
              await markListingAvailable(listing.id);
              Alert.alert(t('markAvailableSuccessTitle'), t('markAvailableSuccessMessage'));
            } catch (error) {
              console.warn('markListingAvailable failed', error);
              Alert.alert(t('errorGenericTitle'), friendlyErrorMessage(error, t));
            }
          },
        },
      ]
    );
  };

  const handleDelete = (listing) => {
    Alert.alert(
      t('deleteListingConfirmTitle'),
      t('deleteListingConfirmMessage').replace('{title}', listing.title),
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteListing(listing.id);
            } catch (error) {
              console.warn('deleteListing failed', error);
              Alert.alert(t('errorGenericTitle'), friendlyErrorMessage(error, t));
            }
          },
        },
      ]
    );
  };

  if (dataLoading) {
    return <LoadingView />;
  }

  if (dataErrors.listings && allMyListings.length === 0) {
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
      {allMyListings.length === 0 ? (
        <PlaceholderScreen
          icon="business-outline"
          title={t('myListingsEmptyTitle')}
          subtitle={t('myListingsEmptySubtitle')}
        />
      ) : (
        <>
          <SearchBar
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder={t('searchMyListingsPlaceholder')}
            colors={colors}
            style={styles.searchBar}
          />
          {myListings.length === 0 ? (
            <PlaceholderScreen title={t('noSearchResultsTitle')} subtitle={t('noSearchResultsSubtitle')} />
          ) : (
            <FlatList
              data={myListings}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.listContent}
              renderItem={({ item }) => {
                const isSold = item.listingState === 'sold';
                const isExpired = item.listingState === 'expired';
                const daysLeft = daysUntil(item.expiresAt);
                const isExpiringSoon =
                  !isSold && !isExpired && daysLeft !== null && daysLeft <= EXPIRING_SOON_DAYS;
                const isRent = item.listingType === 'rent';
                return (
                  <ListingCard
                    listing={item}
                    showStatus
                    showSaveButton={false}
                    onPress={() => navigation.navigate('ListingDetail', { listingId: item.id })}
                    onDelete={() => handleDelete(item)}
                    footer={
                      item.status === 'approved' ? (
                        <View style={styles.footerStack}>
                          {isSold ? (
                            <View style={styles.soldRow}>
                              <View style={[styles.soldBadge, { backgroundColor: `${colors.textMuted}22` }]}>
                                <Text style={[styles.soldBadgeText, { color: colors.textMuted }]}>
                                  {isRent ? t('markedRentedBadge') : t('markedSoldBadge')}
                                </Text>
                              </View>
                              <Pressable
                                style={[styles.markAvailableButton, { borderColor: colors.accent }]}
                                onPress={() => handleMarkAvailable(item)}
                              >
                                <Text style={[styles.markAvailableButtonText, { color: colors.accent }]}>
                                  {t('markAsAvailableButton')}
                                </Text>
                              </Pressable>
                            </View>
                          ) : (
                            <>
                              {(isExpired || isExpiringSoon) && (
                                <View style={styles.expiryRow}>
                                  <Text style={[styles.expiryText, { color: colors.danger }]}>
                                    {isExpired
                                      ? t('listingExpiredBanner')
                                      : t('listingExpiringSoonBanner')
                                          .replace('{days}', String(daysLeft))
                                          .replace('{daysWord}', dayWord(daysLeft, language))}
                                  </Text>
                                  <Pressable
                                    style={[styles.renewButton, { backgroundColor: colors.accent }]}
                                    onPress={() => handleRenew(item)}
                                  >
                                    <Text style={[styles.renewButtonText, { color: colors.accentText }]}>
                                      {t('renewListingButton')}
                                    </Text>
                                  </Pressable>
                                </View>
                              )}
                              <Pressable
                                style={[styles.markSoldButton, { borderColor: colors.inputBorder }]}
                                onPress={() => handleMarkSold(item)}
                              >
                                <Text style={[styles.markSoldButtonText, { color: colors.textMuted }]}>
                                  {isRent ? t('markAsRentedButton') : t('markAsSoldButton')}
                                </Text>
                              </Pressable>
                              {BOOST_PURCHASES_ENABLED && (
                                <BoostListingSection listing={item} colors={colors} />
                              )}
                            </>
                          )}
                        </View>
                      ) : null
                    }
                  />
                );
              }}
            />
          )}
        </>
      )}

      <Pressable
        style={[styles.addButton, { backgroundColor: colors.accent }]}
        onPress={() => requireAuth(() => navigation.navigate('AddListing'))}
      >
        <Text style={[styles.addButtonText, { color: colors.accentText }]}>
          {t('addListingButton')}
        </Text>
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
    paddingBottom: 90,
    gap: 10,
  },
  footerStack: {
    gap: 10,
  },
  expiryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  expiryText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
  },
  renewButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  renewButtonText: {
    fontWeight: '700',
    fontSize: 13,
  },
  markSoldButton: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  markSoldButtonText: {
    fontWeight: '600',
    fontSize: 12,
  },
  soldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  soldBadge: {
    alignSelf: 'flex-start',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  soldBadgeText: {
    fontWeight: '700',
    fontSize: 12,
  },
  markAvailableButton: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  markAvailableButtonText: {
    fontWeight: '600',
    fontSize: 12,
  },
  searchBar: {
    marginHorizontal: 12,
    marginTop: 12,
  },
  addButton: {
    position: 'absolute',
    bottom: 24,
    start: 16,
    end: 16,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  addButtonText: {
    fontWeight: '700',
    fontSize: 15,
  },
});
