import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppContext } from '../context/AppContext';
import PlaceholderScreen from '../components/PlaceholderScreen';
import { useT } from '../i18n/useT';
import { useThemeColors } from '../theme/useThemeColors';
import { REPORT_REASON_LABEL_KEYS, REPORT_STATUS_LABEL_KEYS } from '../data/reportReasons';
import { callAgent } from '../utils/contactActions';
import LoadingView from '../components/LoadingView';
import StatusScreen from '../components/StatusScreen';
import { friendlyErrorMessage } from '../utils/friendlyError';

// Open reports first (need triage), then reviewed/dismissed trailing behind
// in their existing chronological order — same "most-actionable first"
// ordering AdminApprovalsScreen already uses for pending listings.
function sortReports(reports) {
  return [...reports].sort((a, b) => (a.status === 'open') === (b.status === 'open') ? 0 : a.status === 'open' ? -1 : 1);
}

function statusColor(status, colors) {
  if (status === 'open') return colors.danger;
  if (status === 'reviewed') return colors.accent;
  return colors.textMuted;
}

export default function AdminReportsScreen({ navigation }) {
  const { reports, updateReportStatus, deleteReport, reportsLoading, dataErrors, fetchReports } =
    useAppContext();
  const t = useT();
  const colors = useThemeColors();

  const handleDelete = (report) => {
    Alert.alert(
      t('deleteReportConfirmTitle'),
      t('deleteReportConfirmMessage'),
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteReport(report.id);
            } catch (error) {
              console.warn('deleteReport failed', error);
              Alert.alert(t('errorGenericTitle'), friendlyErrorMessage(error, t));
            }
          },
        },
      ]
    );
  };

  if (reportsLoading) {
    return <LoadingView />;
  }

  if (dataErrors.reports && reports.length === 0) {
    return (
      <StatusScreen
        variant="error"
        title={t('errorGenericTitle')}
        subtitle={friendlyErrorMessage(dataErrors.reports, t)}
        primaryAction={{ label: t('tryAgainButton'), onPress: fetchReports }}
      />
    );
  }

  if (reports.length === 0) {
    return (
      <PlaceholderScreen
        icon="flag-outline"
        title={t('reportsTitle')}
        subtitle={t('reportsEmptySubtitle')}
      />
    );
  }

  return (
    <FlatList
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.listContent}
      data={sortReports(reports)}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => (
        <Pressable
          disabled={!item.listingId}
          onPress={() => navigation.navigate('ListingDetail', { listingId: item.listingId })}
          style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          <View style={styles.headerRow}>
            <Text style={[styles.listingTitle, { color: colors.text }]} numberOfLines={1}>
              {item.listingTitle ?? t('listingNotFoundTitle')}
            </Text>
            <View style={[styles.statusPill, { backgroundColor: `${statusColor(item.status, colors)}22` }]}>
              <Text style={[styles.statusPillText, { color: statusColor(item.status, colors) }]}>
                {t(REPORT_STATUS_LABEL_KEYS[item.status])}
              </Text>
            </View>
          </View>

          <Text style={[styles.reason, { color: colors.accent }]}>
            {t(REPORT_REASON_LABEL_KEYS[item.reason])}
          </Text>
          {item.note ? (
            <Text style={[styles.note, { color: colors.textMuted }]}>{item.note}</Text>
          ) : null}

          <View style={styles.actions}>
            {item.listingAgentPhone && (
              <Pressable
                style={[styles.iconButton, { borderColor: colors.border }]}
                onPress={() => callAgent(item.listingAgentPhone)}
              >
                <Ionicons name="call" size={16} color={colors.accent} />
                <Text style={[styles.iconButtonText, { color: colors.accent }]}>{t('callButton')}</Text>
              </Pressable>
            )}
            {item.status !== 'reviewed' && (
              <Pressable
                style={[styles.iconButton, { borderColor: colors.accent }]}
                onPress={async () => {
                  try {
                    await updateReportStatus(item.id, 'reviewed');
                  } catch (error) {
                    console.warn('updateReportStatus failed', error);
                    Alert.alert(t('errorGenericTitle'), friendlyErrorMessage(error, t));
                  }
                }}
              >
                <Text style={[styles.iconButtonText, { color: colors.accent }]}>
                  {t('markReviewedButton')}
                </Text>
              </Pressable>
            )}
            {item.status !== 'dismissed' && (
              <Pressable
                style={[styles.iconButton, { borderColor: colors.textMuted }]}
                onPress={async () => {
                  try {
                    await updateReportStatus(item.id, 'dismissed');
                  } catch (error) {
                    console.warn('updateReportStatus failed', error);
                    Alert.alert(t('errorGenericTitle'), friendlyErrorMessage(error, t));
                  }
                }}
              >
                <Text style={[styles.iconButtonText, { color: colors.textMuted }]}>
                  {t('dismissButton')}
                </Text>
              </Pressable>
            )}
            <Pressable
              style={[styles.iconButton, { borderColor: colors.danger }]}
              onPress={() => handleDelete(item)}
            >
              <Ionicons name="trash" size={16} color={colors.danger} />
              <Text style={[styles.iconButtonText, { color: colors.danger }]}>{t('delete')}</Text>
            </Pressable>
          </View>
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  listContent: {
    padding: 12,
    gap: 10,
  },
  card: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    gap: 6,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  listingTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
  },
  statusPill: {
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  statusPillText: {
    fontSize: 11,
    fontWeight: '700',
  },
  reason: {
    fontSize: 13,
    fontWeight: '600',
  },
  note: {
    fontSize: 13,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  iconButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  iconButtonText: {
    fontSize: 12,
    fontWeight: '600',
  },
});
