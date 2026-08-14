import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppContext } from '../context/AppContext';
import PlaceholderScreen from '../components/PlaceholderScreen';
import { useT } from '../i18n/useT';
import { useThemeColors } from '../theme/useThemeColors';
import { callAgent } from '../utils/contactActions';

export default function AdminAgentsScreen({ navigation }) {
  const { agents, removeAgent, setAgentVerified } = useAppContext();
  const t = useT();
  const colors = useThemeColors();

  const handleRemove = (agent) => {
    Alert.alert(
      t('removeAgentConfirmTitle'),
      t('removeAgentConfirmMessage').replace('{name}', agent.name),
      [
        { text: t('cancel'), style: 'cancel' },
        { text: t('delete'), style: 'destructive', onPress: () => removeAgent(agent.phone) },
      ]
    );
  };

  if (agents.length === 0) {
    return <PlaceholderScreen title={t('registeredAgentsTitle')} subtitle={t('noAgentsYet')} />;
  }

  return (
    <FlatList
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.listContent}
      data={agents}
      keyExtractor={(item) => item.phone}
      renderItem={({ item }) => (
        <View style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Pressable
            style={styles.info}
            onPress={() => navigation.navigate('AdminSellerListings', { phone: item.phone, name: item.name })}
          >
            <View style={styles.nameRow}>
              <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
                {item.name}
              </Text>
              {item.verified && (
                <Ionicons name="checkmark-circle" size={16} color={colors.accent} />
              )}
            </View>
            <Text style={[styles.phone, { color: colors.textMuted }]}>{item.phone}</Text>
          </Pressable>
          <Pressable
            style={[styles.iconButton, { borderColor: colors.accent }]}
            onPress={() => setAgentVerified(item.phone, !item.verified)}
            accessibilityRole="button"
            accessibilityLabel={item.verified ? t('a11yUnverifySeller') : t('a11yVerifySeller')}
            accessibilityState={{ selected: !!item.verified }}
            testID="admin-verify-seller"
          >
            <Ionicons
              name={item.verified ? 'checkmark-circle' : 'checkmark-circle-outline'}
              size={18}
              color={colors.accent}
            />
          </Pressable>
          <Pressable
            style={[styles.iconButton, { borderColor: colors.border }]}
            onPress={() => callAgent(item.phone)}
            accessibilityRole="button"
            accessibilityLabel={t('a11yCallSellerNamed').replace('{name}', item.name)}
            testID="admin-call-seller"
          >
            <Ionicons name="call" size={18} color={colors.accent} />
          </Pressable>
          <Pressable
            style={[styles.iconButton, { borderColor: colors.danger }]}
            onPress={() => handleRemove(item)}
            accessibilityRole="button"
            accessibilityLabel={t('a11yRemoveSeller')}
            testID="admin-remove-seller"
          >
            <Ionicons name="trash" size={18} color={colors.danger} />
          </Pressable>
        </View>
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
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
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
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
