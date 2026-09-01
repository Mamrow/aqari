import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppContext } from '../context/AppContext';
import PlaceholderScreen from '../components/PlaceholderScreen';
import { useT } from '../i18n/useT';
import { useThemeColors } from '../theme/useThemeColors';

// Reached from Settings. Names come from the same registered-sellers
// directory (agents) ListingDetailScreen/AdminAgentsScreen use — a blocked
// phone whose seller entry no longer exists (removed by admin) just shows
// the phone number on its own.
export default function BlockedSellersScreen() {
  const { blockedSellers, agents, unblockSeller, language } = useAppContext();
  const t = useT();
  const colors = useThemeColors();
  const rtlText = { textAlign: language === 'ar' ? 'right' : 'left' };

  if (blockedSellers.length === 0) {
    return (
      <PlaceholderScreen
        icon="person-remove-outline"
        title={t('blockedSellersTitle')}
        subtitle={t('noBlockedSellersYet')}
      />
    );
  }

  return (
    <FlatList
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.listContent}
      data={blockedSellers}
      keyExtractor={(phone) => phone}
      renderItem={({ item: phone }) => {
        const seller = agents.find((agent) => agent.phone === phone);
        return (
          <View style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.info}>
              <Text style={[styles.name, rtlText, { color: colors.text }]} numberOfLines={1}>
                {seller?.name ?? phone}
              </Text>
              {seller?.name && (
                <Text style={[styles.phone, rtlText, { color: colors.textMuted }]}>{phone}</Text>
              )}
            </View>
            <Pressable
              style={[styles.iconButton, { borderColor: colors.accent }]}
              onPress={() => unblockSeller(phone)}
              accessibilityRole="button"
              accessibilityLabel={t('a11yUnblockSeller')}
              testID="unblock-seller"
            >
              <Ionicons name="person-add-outline" size={18} color={colors.accent} />
              <Text style={[styles.iconButtonText, { color: colors.accent }]}>
                {t('unblockSellerButton')}
              </Text>
            </Pressable>
          </View>
        );
      }}
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    gap: 10,
  },
  info: {
    flex: 1,
  },
  name: {
    fontSize: 15,
    fontWeight: '700',
  },
  phone: {
    fontSize: 13,
    marginTop: 2,
  },
  iconButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  iconButtonText: {
    fontSize: 12,
    fontWeight: '600',
  },
});
