import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import {
  applyThemeMode,
  getAccent,
  setAccent as storeAccent,
  type Accent,
  getThemePreference,
  setThemePreference,
  watchSystemThemeMode,
  type ThemePreference,
} from '../theme/applyThemeMode';

interface ThemeModeContextValue {
  preference: ThemePreference;
  setPreference: (pref: ThemePreference) => void;
  accent: Accent;
  setAccent: (accent: Accent) => void;
}

const ThemeModeContext = createContext<ThemeModeContextValue | null>(null);

export function ThemeModeProvider({ children }: { children: ReactNode }) {
  // main.tsx already applied the preferred mode before the first render; this just mirrors the choice.
  const [preference, setPreferenceState] = useState<ThemePreference>(getThemePreference);
  const [accent, setAccentState] = useState<Accent>(getAccent);

  useEffect(() => watchSystemThemeMode((next) => applyThemeMode(next)), []);

  function setPreference(pref: ThemePreference) {
    setThemePreference(pref);
    setPreferenceState(pref);
  }

  function setAccent(next: Accent) {
    storeAccent(next);
    setAccentState(next);
  }

  return <ThemeModeContext.Provider value={{ preference, setPreference, accent, setAccent }}>{children}</ThemeModeContext.Provider>;
}

export function useThemeMode(): ThemeModeContextValue {
  const ctx = useContext(ThemeModeContext);
  if (!ctx) throw new Error('useThemeMode must be used within a ThemeModeProvider');
  return ctx;
}
