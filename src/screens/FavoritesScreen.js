import { FlatList, StyleSheet } from 'react-native';
import { useAppContext } from '../context/AppContext';
import ListingCard from '../components/ListingCard';
import PlaceholderScreen from '../components/PlaceholderScreen';
import LoadingView from '../components/LoadingView';
import { useT } from '../i18n/useT';
import { useThemeColors } from '../theme/useThemeColors';

export default function FavoritesScreen({ navigation }) {
  const { listings, saved, dataLoading } = useAppContext();
  const t = useT();
  const colors = useThemeColors();
  const savedListings = listings.filter((listing) => saved.includes(listing.id));

  if (dataLoading) {
    return <LoadingView />;
  }

  if (savedListings.length === 0) {
    return <PlaceholderScreen title={t('favoritesTitle')} subtitle={t('favoritesSubtitle')} />;
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
