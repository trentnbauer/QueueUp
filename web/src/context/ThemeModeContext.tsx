import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import {
  applyThemeMode,
  getAccent,
  getPalette,
  setAccent as storeAccent,
  type Accent,
  setPalette as storePalette,
  type Palette,
  getThemePreference,
  setThemePreference,
  watchSystemThemeMode,
  type ThemePreference,
} from '../theme/applyThemeMode';

interface ThemeModeContextValue {
  preference: ThemePreference;
  setPreference: (pref: ThemePreference) => void;
  palette: Palette;
  accent: Accent;
  setAccent: (accent: Accent) => void;
  setPalette: (palette: Palette) => void;
}

const ThemeModeContext = createContext<ThemeModeContextValue | null>(null);

export function ThemeModeProvider({ children }: { children: ReactNode }) {
  // main.tsx already applied the preferred mode before the first render; this just mirrors the choice.
  const [preference, setPreferenceState] = useState<ThemePreference>(getThemePreference);
  const [palette, setPaletteState] = useState<Palette>(getPalette);
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

  function setPalette(next: Palette) {
    storePalette(next);
    setPaletteState(next);
  }

  return <ThemeModeContext.Provider value={{ preference, setPreference, palette, setPalette, accent, setAccent }}>{children}</ThemeModeContext.Provider>;
}

export function useThemeMode(): ThemeModeContextValue {
  const ctx = useContext(ThemeModeContext);
  if (!ctx) throw new Error('useThemeMode must be used within a ThemeModeProvider');
  return ctx;
}
