import { useEffect } from 'react';
import { Alert, FlatList, StyleSheet, Text, View, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAppContext } from '../context/AppContext';
import ListingCard from '../components/ListingCard';
import PlaceholderScreen from '../components/PlaceholderScreen';
import LoadingView from '../components/LoadingView';
import { useT } from '../i18n/useT';
import { useThemeColors } from '../theme/useThemeColors';
import { WHATSAPP_GREEN } from '../theme/colors';
import { callAgent, whatsappAgent } from '../utils/contactActions';

// Reached by tapping a row in AdminAgentsScreen ("Registered Sellers") —
// same approve/reject/call/whatsapp/delete actions as the main approvals
// queue, just filtered down to one seller's own listings.
export default function AdminSellerListingsScreen({ navigation, route }) {
  const { phone, name } = route.params;
  const { listings, approveListing, rejectListing, deleteListing, dataLoading } = useAppContext();
  const t = useT();
  const colors = useThemeColors();

  useEffect(() => {
    navigation.setOptions({ title: name });
  }, [navigation, name]);

  const sellerListings = listings.filter((listing) => listing.agentId === phone);

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

  if (sellerListings.length === 0) {
    return <PlaceholderScreen title={t('approvalsEmptyTitle')} subtitle={t('approvalsEmptySubtitle')} />;
  }

  return (
    <SafeAreaView edges={['bottom']} style={[styles.container, { backgroundColor: colors.background }]}>
      <FlatList
        data={sellerListings}
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
                  <Text style={[styles.actionText, { color: colors.accentText }]}>{t('approve')}</Text>
                </Pressable>
                <Pressable
                  style={[styles.actionButton, { backgroundColor: colors.danger }]}
                  onPress={() => rejectListing(item.id)}
                >
                  <Text style={[styles.actionText, { color: colors.accentText }]}>{t('reject')}</Text>
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
