export type ThemeMode = 'light' | 'dark';

const STORAGE_KEY = 'sq-theme-mode';

export function getStoredThemeMode(): ThemeMode | null {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === 'light' || stored === 'dark' ? stored : null;
}

export function getPreferredThemeMode(): ThemeMode {
  const stored = getStoredThemeMode();
  if (stored) return stored;
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

export function applyThemeMode(mode: ThemeMode): void {
  document.documentElement.dataset.theme = mode;
  localStorage.setItem(STORAGE_KEY, mode);
}
