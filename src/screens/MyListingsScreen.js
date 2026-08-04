import { useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useAppContext } from '../context/AppContext';
import ListingCard from '../components/ListingCard';
import BoostListingSection from '../components/BoostListingSection';
import PlaceholderScreen from '../components/PlaceholderScreen';
import LoadingView from '../components/LoadingView';
import SearchBar from '../components/SearchBar';
import { useT } from '../i18n/useT';
import { dayWord } from '../i18n/pluralDays';
import { useThemeColors } from '../theme/useThemeColors';

const EXPIRING_SOON_DAYS = 5;

// Whole days between now and the given ISO timestamp, rounded up so
// "expires in a few hours" still reads as 1 day left, not 0.
const daysUntil = (iso) => {
  if (!iso) return null;
  return Math.ceil((new Date(iso).getTime() - Date.now()) / (24 * 60 * 60 * 1000));
};

export default function MyListingsScreen({ navigation }) {
  const { listings, getMyId, deleteListing, dataLoading, requireAuth, renewListing, language } =
    useAppContext();
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
          } catch (error) {
            Alert.alert(t('errorGenericTitle'), error.message ?? String(error));
          }
        },
      },
    ]);
  };

  const handleDelete = (listing) => {
    Alert.alert(
      t('deleteListingConfirmTitle'),
      t('deleteListingConfirmMessage').replace('{title}', listing.title),
      [
        { text: t('cancel'), style: 'cancel' },
        { text: t('delete'), style: 'destructive', onPress: () => deleteListing(listing.id) },
      ]
    );
  };

  if (dataLoading) {
    return <LoadingView />;
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {allMyListings.length === 0 ? (
        <PlaceholderScreen
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
                const isExpired = item.listingState === 'expired';
                const daysLeft = daysUntil(item.expiresAt);
                const isExpiringSoon =
                  !isExpired && daysLeft !== null && daysLeft <= EXPIRING_SOON_DAYS;
                return (
                  <ListingCard
                    listing={item}
                    showStatus
                    showSaveButton={false}
                    onPress={() => navigation.navigate('AddListing', { listingId: item.id })}
                    onDelete={() => handleDelete(item)}
                    footer={
                      item.status === 'approved' ? (
                        <View style={styles.footerStack}>
                          {daysLeft !== null && (
                            <View style={styles.expiryRow}>
                              <Text
                                style={[
                                  styles.expiryText,
                                  {
                                    color:
                                      isExpired || isExpiringSoon ? colors.danger : colors.textMuted,
                                  },
                                ]}
                              >
                                {isExpired
                                  ? t('listingExpiredBanner')
                                  : isExpiringSoon
                                  ? t('listingExpiringSoonBanner')
                                      .replace('{days}', String(daysLeft))
                                      .replace('{daysWord}', dayWord(daysLeft, language))
                                  : t('listingDaysLeftLabel')
                                      .replace('{days}', String(daysLeft))
                                      .replace('{daysWord}', dayWord(daysLeft, language))}
                              </Text>
                              {(isExpired || isExpiringSoon) && (
                                <Pressable
                                  style={[styles.renewButton, { backgroundColor: colors.accent }]}
                                  onPress={() => handleRenew(item)}
                                >
                                  <Text style={[styles.renewButtonText, { color: colors.accentText }]}>
                                    {t('renewListingButton')}
                                  </Text>
                                </Pressable>
                              )}
                            </View>
                          )}
                          <BoostListingSection listing={item} colors={colors} />
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
