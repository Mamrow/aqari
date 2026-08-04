import { useCallback } from 'react';
import { useAppContext } from '../context/AppContext';
import { translations } from './translations';

export function useT() {
  const { language } = useAppContext();
  return useCallback((key) => translations[language]?.[key] ?? translations.ar[key] ?? key, [
    language,
  ]);
}
