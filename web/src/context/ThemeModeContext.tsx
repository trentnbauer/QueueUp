import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import {
  applyThemeMode,
  setExplicitThemeMode,
  getPreferredThemeMode,
  watchSystemThemeMode,
  type ThemeMode,
} from '../theme/applyThemeMode';

interface ThemeModeContextValue {
  mode: ThemeMode;
  toggle: () => void;
}

const ThemeModeContext = createContext<ThemeModeContextValue | null>(null);

export function ThemeModeProvider({ children }: { children: ReactNode }) {
  // main.tsx already applied the preferred mode to the document before the first render -
  // read it back here so this state starts in sync rather than reapplying a fresh guess.
  const [mode, setMode] = useState<ThemeMode>(() => (document.documentElement.dataset.theme as ThemeMode) || getPreferredThemeMode());

  // Follows the OS/browser theme live (issue #210) for as long as the user hasn't explicitly
  // toggled - a no-op once they have, since watchSystemThemeMode's listener checks that itself.
  useEffect(
    () =>
      watchSystemThemeMode((next) => {
        applyThemeMode(next);
        setMode(next);
      }),
    [],
  );

  function toggle() {
    const next: ThemeMode = mode === 'dark' ? 'light' : 'dark';
    setExplicitThemeMode(next);
    setMode(next);
  }

  return <ThemeModeContext.Provider value={{ mode, toggle }}>{children}</ThemeModeContext.Provider>;
}

export function useThemeMode(): ThemeModeContextValue {
  const ctx = useContext(ThemeModeContext);
  if (!ctx) throw new Error('useThemeMode must be used within a ThemeModeProvider');
  return ctx;
}
