import { StyleSheet, Text, View } from 'react-native';
import { FEATURED_GOLD } from '../../theme/colors';
import { BOOST_PURCHASES_ENABLED } from '../../config/features';

// Both platform map implementations render these same two components as
// marker content, so an Apple Maps pin and a MapLibre pin are pixel-identical
// — the map underneath differs, the app's own markers don't.

export function PricePin({ listing, selected, colors }) {
  return (
    <View
      style={[
        styles.pricePin,
        { borderColor: colors.accent, backgroundColor: colors.surface },
        selected && { backgroundColor: colors.accent },
        BOOST_PURCHASES_ENABLED && listing.isFeatured && styles.pricePinFeatured,
      ]}
    >
      <Text style={[styles.pricePinText, { color: selected ? colors.accentText : colors.accent }]}>
        {listing.price.toLocaleString('en-US')}
      </Text>
    </View>
  );
}

export function ClusterBubble({ count, colors }) {
  return (
    <View style={[styles.clusterBubble, { backgroundColor: colors.accent }]}>
      <Text style={styles.clusterBubbleText}>{count}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pricePin: {
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
  },
  pricePinFeatured: {
    borderColor: FEATURED_GOLD,
    borderWidth: 2,
  },
  pricePinText: {
    fontWeight: '700',
    fontSize: 12,
  },
  clusterBubble: {
    minWidth: 40,
    height: 40,
    paddingHorizontal: 6,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  clusterBubbleText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 14,
  },
});
