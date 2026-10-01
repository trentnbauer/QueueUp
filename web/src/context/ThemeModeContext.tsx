import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import {
  applyThemeMode,
  getThemePreference,
  setThemePreference,
  watchSystemThemeMode,
  type ThemePreference,
} from '../theme/applyThemeMode';

interface ThemeModeContextValue {
  preference: ThemePreference;
  setPreference: (pref: ThemePreference) => void;
}

const ThemeModeContext = createContext<ThemeModeContextValue | null>(null);

export function ThemeModeProvider({ children }: { children: ReactNode }) {
  // main.tsx already applied the preferred mode before the first render; this just mirrors the choice.
  const [preference, setPreferenceState] = useState<ThemePreference>(getThemePreference);

  useEffect(() => watchSystemThemeMode((next) => applyThemeMode(next)), []);

  function setPreference(pref: ThemePreference) {
    setThemePreference(pref);
    setPreferenceState(pref);
  }

  return <ThemeModeContext.Provider value={{ preference, setPreference }}>{children}</ThemeModeContext.Provider>;
}

export function useThemeMode(): ThemeModeContextValue {
  const ctx = useContext(ThemeModeContext);
  if (!ctx) throw new Error('useThemeMode must be used within a ThemeModeProvider');
  return ctx;
}
