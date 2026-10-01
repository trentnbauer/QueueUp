/** What the person chose: a fixed theme, or follow the OS/browser. */
export type ThemePreference = 'dark' | 'light' | 'system';
/** What's actually applied to the document. */
export type ThemeMode = 'light' | 'dark';

const STORAGE_KEY = 'sq-theme-mode';

/** Absent means "system" - the app follows the OS/browser's prefers-color-scheme live. */
export function getThemePreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === 'light' || stored === 'dark' ? stored : 'system';
  } catch {
    return 'system';
  }
}

export function getSystemThemeMode(): ThemeMode {
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

export function resolveThemeMode(pref: ThemePreference): ThemeMode {
  return pref === 'system' ? getSystemThemeMode() : pref;
}

export function getPreferredThemeMode(): ThemeMode {
  return resolveThemeMode(getThemePreference());
}

/** Applies a mode to the document without persisting it. */
export function applyThemeMode(mode: ThemeMode): void {
  document.documentElement.dataset.theme = mode;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', mode === 'light' ? '#f6f2ec' : '#1a1512');
}

/** Records the person's choice and applies it. */
export function setThemePreference(pref: ThemePreference): void {
  try {
    if (pref === 'system') localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, pref);
  } catch {
    /* storage unavailable - the choice just won't persist */
  }
  applyThemeMode(resolveThemeMode(pref));
}

/** Keeps the applied theme in sync with the OS preference while the choice is "system". */
export function watchSystemThemeMode(onChange: (mode: ThemeMode) => void): () => void {
  const query = window.matchMedia('(prefers-color-scheme: light)');
  const listener = () => {
    if (getThemePreference() !== 'system') return;
    onChange(getSystemThemeMode());
  };
  query.addEventListener('change', listener);
  return () => query.removeEventListener('change', listener);
}
