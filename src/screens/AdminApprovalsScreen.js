import { useState } from 'react';
import { Alert, FlatList, I18nManager, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAppContext } from '../context/AppContext';
import ListingCard from '../components/ListingCard';
import PlaceholderScreen from '../components/PlaceholderScreen';
import LoadingView from '../components/LoadingView';
import SearchBar from '../components/SearchBar';
import { useT } from '../i18n/useT';
import { useThemeColors } from '../theme/useThemeColors';
import { WHATSAPP_GREEN } from '../theme/colors';
import { callAgent, whatsappAgent } from '../utils/contactActions';

export default function AdminApprovalsScreen({ navigation }) {
  const { listings, agents, reports, approveListing, rejectListing, deleteListing, dataLoading } =
    useAppContext();
  const t = useT();
  const colors = useThemeColors();
  const [searchQuery, setSearchQuery] = useState('');

  const matchesSearch = (listing) => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return true;
    if (listing.title.toLowerCase().includes(query)) return true;
    if (listing.agentPhone?.toLowerCase().includes(query)) return true;
    const agent = agents.find(
      (item) => item.phone === listing.agentId || item.phone === listing.agentPhone
    );
    return agent?.name?.toLowerCase().includes(query) ?? false;
  };

  // Plain chronological order (listings already arrives newest-first from
  // fetchListings) — not grouped by status. Admin wants to review in the
  // order things actually came in, regardless of pending/approved/rejected.
  const sortedListings = listings.filter(matchesSearch);

  const handleWhatsapp = (listing) => {
    const message = t('adminContactMessageTemplate').replace('{title}', listing.title);
    whatsappAgent(listing.agentPhone, message);
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
    <SafeAreaView edges={['top']} style={[styles.container, { backgroundColor: colors.background }]}>
      <Text style={[styles.heading, { color: colors.heading }]}>{t('adminHeading')}</Text>

      <Pressable
        style={[styles.agentsLink, { backgroundColor: colors.surface, borderColor: colors.border }]}
        onPress={() => navigation.navigate('AdminAgents')}
      >
        <Text style={[styles.agentsLinkText, { color: colors.text }]}>
          {t('registeredAgentsTitle')} ({agents.length})
        </Text>
        <Ionicons
          name={I18nManager.isRTL ? 'chevron-back' : 'chevron-forward'}
          size={18}
          color={colors.textMuted}
        />
      </Pressable>

      {/* Open count, not total — a screen full of already-resolved reports
          isn't what needs surfacing here at a glance. */}
      <Pressable
        style={[styles.agentsLink, { backgroundColor: colors.surface, borderColor: colors.border }]}
        onPress={() => navigation.navigate('AdminReports')}
      >
        <Text style={[styles.agentsLinkText, { color: colors.text }]}>
          {t('reportsTitle')} ({reports.filter((item) => item.status === 'open').length})
        </Text>
        <Ionicons
          name={I18nManager.isRTL ? 'chevron-back' : 'chevron-forward'}
          size={18}
          color={colors.textMuted}
        />
      </Pressable>

      {listings.length > 0 && (
        <SearchBar
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder={t('searchAdminPlaceholder')}
          colors={colors}
          style={styles.searchBar}
        />
      )}

      {listings.length === 0 ? (
        <PlaceholderScreen title={t('approvalsEmptyTitle')} subtitle={t('approvalsEmptySubtitle')} />
      ) : sortedListings.length === 0 ? (
        <PlaceholderScreen title={t('noSearchResultsTitle')} subtitle={t('noSearchResultsSubtitle')} />
      ) : (
        <FlatList
          data={sortedListings}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <ListingCard listing={item} showStatus />

              {item.status === 'pending' && (
                <View style={styles.actions}>
                  <Pressable
                    style={[styles.actionButton, { backgroundColor: colors.accent }]}
                    onPress={() => approveListing(item.id)}
                  >
                    <Text style={[styles.actionText, { color: colors.accentText }]}>
                      {t('approve')}
                    </Text>
                  </Pressable>
                  <Pressable
                    style={[styles.actionButton, { backgroundColor: colors.danger }]}
                    onPress={() => rejectListing(item.id)}
                  >
                    <Text style={[styles.actionText, { color: colors.accentText }]}>
                      {t('reject')}
                    </Text>
                  </Pressable>
                </View>
              )}

              <View style={styles.actions}>
                <Pressable
                  style={[styles.iconButton, { backgroundColor: colors.surface, borderColor: colors.border }]}
                  onPress={() => callAgent(item.agentPhone)}
                >
                  <Ionicons name="call" size={16} color={colors.text} />
                  <Text style={[styles.iconButtonText, { color: colors.text }]}>{t('callButton')}</Text>
                </Pressable>
                <Pressable
                  style={[styles.iconButton, { backgroundColor: colors.surface, borderColor: WHATSAPP_GREEN }]}
                  onPress={() => handleWhatsapp(item)}
                >
                  <Ionicons name="logo-whatsapp" size={16} color={WHATSAPP_GREEN} />
                  <Text style={[styles.iconButtonText, { color: WHATSAPP_GREEN }]}>
                    {t('whatsappButton')}
                  </Text>
                </Pressable>
                <Pressable
                  style={[styles.iconButton, { backgroundColor: colors.surface, borderColor: colors.danger }]}
                  onPress={() => handleDelete(item)}
                >
                  <Ionicons name="trash" size={16} color={colors.danger} />
                  <Text style={[styles.iconButtonText, { color: colors.danger }]}>{t('delete')}</Text>
                </Pressable>
              </View>
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  heading: {
    fontSize: 20,
    fontWeight: '700',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
  },
  agentsLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  agentsLinkText: {
    fontSize: 14,
    fontWeight: '600',
  },
  searchBar: {
    marginHorizontal: 16,
    marginTop: 12,
  },
  listContent: {
    padding: 12,
    gap: 14,
  },
  row: {
    gap: 8,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  actionText: {
    fontWeight: '700',
  },
  iconButton: {
    flex: 1,
    flexDirection: 'row',
    borderRadius: 10,
    borderWidth: 1,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  iconButtonText: {
    fontSize: 12,
    fontWeight: '600',
  },
});
