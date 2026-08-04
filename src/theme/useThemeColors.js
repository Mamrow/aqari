import { useAppContext } from '../context/AppContext';
import { lightColors, darkColors } from './colors';

export function useThemeColors() {
  const { theme } = useAppContext();
  return theme === 'dark' ? darkColors : lightColors;
}
