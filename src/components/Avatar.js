import { Image, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

// Shows the photo if set; otherwise the name's first letter on an accent-tinted
// circle, falling back to a generic person icon if there's no name either.
export default function Avatar({ uri, name, size = 64, colors }) {
  const dimension = { width: size, height: size, borderRadius: size / 2 };

  if (uri) {
    return <Image source={{ uri }} style={[styles.image, dimension]} />;
  }

  const initial = name?.trim()?.[0]?.toUpperCase();

  return (
    <View style={[styles.placeholder, dimension, { backgroundColor: colors.accent }]}>
      {initial ? (
        <Text style={[styles.initial, { fontSize: size * 0.4 }]}>{initial}</Text>
      ) : (
        <Ionicons name="person" size={size * 0.5} color={colors.accentText} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  image: {
    backgroundColor: '#ccc',
  },
  placeholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  initial: {
    color: '#ffffff',
    fontWeight: '700',
  },
});
