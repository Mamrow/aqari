import { Ionicons } from '@expo/vector-icons';

export function tabIcon(name) {
  return ({ focused, color, size }) => (
    <Ionicons name={focused ? name : `${name}-outline`} size={size} color={color} />
  );
}
