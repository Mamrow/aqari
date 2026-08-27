import { FlatList, StyleSheet } from 'react-native';
import { useAppContext } from '../context/AppContext';
import ListingCard from '../components/ListingCard';
import PlaceholderScreen from '../components/PlaceholderScreen';
import LoadingView from '../components/LoadingView';
import { useT } from '../i18n/useT';
import { useThemeColors } from '../theme/useThemeColors';
import StatusScreen from '../components/StatusScreen';
import { friendlyErrorMessage } from '../utils/friendlyError';

export default function FavoritesScreen({ navigation }) {
  const { listings, saved, blockedSellers, dataLoading, dataErrors, fetchListings, fetchFavorites, auth } =
    useAppContext();
  const t = useT();
  const colors = useThemeColors();
  const savedListings = listings.filter(
    (listing) => saved.includes(listing.id) && !blockedSellers.includes(listing.agentId)
  );
  const readError = dataErrors.favorites ?? dataErrors.listings;
  const retry = () => Promise.all([fetchListings(), fetchFavorites(auth.phone)]);

  if (dataLoading) {
    return <LoadingView />;
  }

  if (readError && savedListings.length === 0) {
    return (
      <StatusScreen
        variant="error"
        title={t('errorGenericTitle')}
        subtitle={friendlyErrorMessage(readError, t)}
        primaryAction={{ label: t('tryAgainButton'), onPress: retry }}
      />
    );
  }

  if (savedListings.length === 0) {
    return (
      <PlaceholderScreen
        icon="heart-outline"
        title={t('favoritesTitle')}
        subtitle={t('favoritesSubtitle')}
      />
    );
  }

  return (
    <FlatList
      style={{ backgroundColor: colors.background }}
      data={savedListings}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.listContent}
      renderItem={({ item }) => (
        <ListingCard
          listing={item}
          onPress={() => navigation.navigate('ListingDetail', { listingId: item.id })}
        />
      )}
    />
  );
}

const styles = StyleSheet.create({
  listContent: {
    padding: 12,
    gap: 10,
  },
});
