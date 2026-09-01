import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAppContext } from '../context/AppContext';
import { useT } from '../i18n/useT';
import { dayWord } from '../i18n/pluralDays';
import { useThemeColors } from '../theme/useThemeColors';
import { FEATURED_GOLD } from '../theme/colors';
import PlaceholderScreen from '../components/PlaceholderScreen';
import LoadingView from '../components/LoadingView';
import StatusScreen from '../components/StatusScreen';
import { friendlyErrorMessage } from '../utils/friendlyError';

const STATUS_COLORS = {
  paid: '#2E8B57',
  pending: '#4A6FA5',
  failed: '#c0392b',
  expired: '#8a8a8a',
};

// Whole days between now and the given ISO timestamp, rounded up — same
// rounding MyListingsScreen/BoostListingSection use for their countdowns.
const daysUntil = (iso) => {
  if (!iso) return null;
  return Math.ceil((new Date(iso).getTime() - Date.now()) / (24 * 60 * 60 * 1000));
};

// Featured-purchase history — for a regular seller, their own payments plus
// a quick summary of which of their listings are currently Featured and how
// long that lasts; for admin, every seller's payments (RLS alone decides
// the scope, see migration_admin_read_boost_payments.sql — same query, no
// client-side branching needed for that part).
export default function PaymentHistoryScreen({ navigation }) {
  const { listings, getMyId, isAdmin, fetchBoostPayments, language } = useAppContext();
  const t = useT();
  const colors = useThemeColors();
  const rtlText = { textAlign: language === 'ar' ? 'right' : 'left' };
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const data = await fetchBoostPayments();
      setPayments(data);
    } catch (error) {
      console.warn('fetchBoostPayments error', error);
      setLoadError(error);
    }
  }, [fetchBoostPayments]);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const myFeaturedListings = isAdmin
    ? []
    : listings.filter((item) => item.agentId === getMyId() && item.isFeatured);

  if (loading) {
    return <LoadingView />;
  }

  if (loadError && payments.length === 0) {
    return (
      <StatusScreen
        variant="error"
        title={t('errorGenericTitle')}
        subtitle={friendlyErrorMessage(loadError, t)}
        primaryAction={{ label: t('tryAgainButton'), onPress: load }}
      />
    );
  }

  if (payments.length === 0) {
    return (
      <PlaceholderScreen
        icon="receipt-outline"
        title={t('paymentHistoryEmptyTitle')}
        subtitle={t('paymentHistoryEmptySubtitle')}
      />
    );
  }

  return (
    <SafeAreaView edges={['bottom']} style={[styles.container, { backgroundColor: colors.background }]}>
      <FlatList
        data={payments}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.accent} />
        }
        ListHeaderComponent={
          myFeaturedListings.length > 0 ? (
            <View style={styles.featuredSummary}>
              <Text style={[styles.sectionLabel, rtlText, { color: colors.textMuted }]}>
                {t('currentlyFeaturedLabel')}
              </Text>
              {myFeaturedListings.map((item) => {
                const daysLeft = daysUntil(item.featuredUntil);
                return (
                  <View
                    key={item.id}
                    style={[
                      styles.featuredRow,
                      { backgroundColor: colors.surface, borderColor: FEATURED_GOLD },
                    ]}
                  >
                    <Ionicons name="star" size={16} color={FEATURED_GOLD} />
                    <Text
                      style={[styles.featuredRowTitle, rtlText, { color: colors.text }]}
                      numberOfLines={1}
                    >
                      {item.title}
                    </Text>
                    <Text style={[styles.featuredRowDays, { color: FEATURED_GOLD }]}>
                      {daysLeft !== null && daysLeft > 0
                        ? t('featuredDaysLeftLabel')
                            .replace('{days}', String(daysLeft))
                            .replace('{daysWord}', dayWord(daysLeft, language))
                        : t('featuredLabel')}
                    </Text>
                    <Pressable
                      onPress={() => {
                        // Two calls, not one: navigating straight to
                        // 'ListingDetail' the first time the My Listings tab
                        // is ever visited this session can initialize that
                        // stack with ListingDetail as its only route — no
                        // MyListingsHome underneath it, so there's nothing
                        // to go back to and the header shows no back button.
                        // Landing on the tab's default screen first
                        // guarantees the stack is already initialized before
                        // pushing the detail screen on top of it.
                        const parent = navigation.getParent();
                        parent?.navigate('MyListings', { screen: 'MyListingsHome' });
                        parent?.navigate('MyListings', {
                          screen: 'ListingDetail',
                          params: { listingId: item.id },
                        });
                      }}
                      hitSlop={8}
                    >
                      <Text style={[styles.manageLink, { color: colors.accent }]}>
                        {t('manageLabel')}
                      </Text>
                    </Pressable>
                  </View>
                );
              })}
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <View style={[styles.paymentCard, { backgroundColor: colors.surface }]}>
            <View style={styles.paymentTopRow}>
              <Text style={[styles.paymentTitle, rtlText, { color: colors.text }]} numberOfLines={1}>
                {item.listingTitle ?? t('paymentListingDeletedLabel')}
              </Text>
              <View
                style={[
                  styles.statusPill,
                  { backgroundColor: `${STATUS_COLORS[item.status] ?? colors.textMuted}22` },
                ]}
              >
                <Text
                  style={[
                    styles.statusPillText,
                    { color: STATUS_COLORS[item.status] ?? colors.textMuted },
                  ]}
                >
                  {t(`paymentStatus_${item.status}`)}
                </Text>
              </View>
            </View>
            {isAdmin && item.agentPhone && (
              <Text style={[styles.paymentMeta, rtlText, { color: colors.textMuted }]}>{item.agentPhone}</Text>
            )}
            <View style={styles.paymentBottomRow}>
              <Text style={[styles.paymentMeta, rtlText, { color: colors.textMuted }]}>
                {t(`payMethod_${item.payMethod}`)} · {item.durationDays}{' '}
                {dayWord(item.durationDays, language)}
              </Text>
              <Text style={[styles.paymentAmount, { color: colors.text }]}>
                {item.amount.toLocaleString('en-US')} {t('priceCurrency')}
              </Text>
            </View>
            <Text style={[styles.paymentDate, rtlText, { color: colors.textMuted }]}>
              {new Date(item.createdAt).toLocaleDateString()}
            </Text>
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
    padding: 16,
    paddingBottom: 40,
    gap: 10,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
  },
  featuredSummary: {
    marginBottom: 16,
  },
  featuredRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
  },
  featuredRowTitle: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
  },
  featuredRowDays: {
    fontSize: 12,
    fontWeight: '700',
  },
  manageLink: {
    fontSize: 12,
    fontWeight: '700',
  },
  paymentCard: {
    borderRadius: 14,
    padding: 14,
    gap: 6,
  },
  paymentTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  paymentTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
  },
  statusPill: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  statusPillText: {
    fontSize: 11,
    fontWeight: '700',
  },
  paymentBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  paymentMeta: {
    fontSize: 12,
  },
  paymentAmount: {
    fontSize: 14,
    fontWeight: '700',
  },
  paymentDate: {
    fontSize: 11,
  },
});
