export type ThemeMode = 'light' | 'dark';

const STORAGE_KEY = 'sq-theme-mode';

/** Only set once the user explicitly toggles (see ThemeModeContext.toggle) - absent means "follow
 * the OS/browser's prefers-color-scheme," which stays live (see watchSystemThemeMode) rather than
 * being snapshotted once at first load and locked in as if it were an explicit choice (issue #210). */
export function getStoredThemeMode(): ThemeMode | null {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === 'light' || stored === 'dark' ? stored : null;
}

export function getSystemThemeMode(): ThemeMode {
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

export function getPreferredThemeMode(): ThemeMode {
  return getStoredThemeMode() ?? getSystemThemeMode();
}

/** Applies a mode to the document without persisting it - used for both an explicit user choice
 * (see setExplicitThemeMode) and for following a live system-preference change. */
export function applyThemeMode(mode: ThemeMode): void {
  document.documentElement.dataset.theme = mode;
}

/** Records an explicit user choice (the toggle button) - from this point on the app stops
 * following the OS preference for this browser, same as any other explicit user setting. */
export function setExplicitThemeMode(mode: ThemeMode): void {
  localStorage.setItem(STORAGE_KEY, mode);
  applyThemeMode(mode);
}

/** Keeps the applied theme in sync with the OS/browser's prefers-color-scheme for as long as the
 * user hasn't made an explicit choice - calls `onChange` with the new mode whenever the system
 * preference flips. Returns an unsubscribe function. */
export function watchSystemThemeMode(onChange: (mode: ThemeMode) => void): () => void {
  const query = window.matchMedia('(prefers-color-scheme: light)');
  const listener = () => {
    if (getStoredThemeMode()) return; // an explicit choice already overrides system changes
    onChange(getSystemThemeMode());
  };
  query.addEventListener('change', listener);
  return () => query.removeEventListener('change', listener);
}
