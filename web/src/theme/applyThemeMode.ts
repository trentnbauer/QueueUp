import { t } from '../i18n';

/** What the person chose: a fixed theme, or follow the OS/browser. */
export type ThemePreference = 'dark' | 'light' | 'system';
/** What's actually applied to the document. */
export type ThemeMode = 'light' | 'dark';

const STORAGE_KEY = 'sq-theme-mode';
// Browser chrome colour per mode (matches --bg closely enough).
const THEME_COLORS = { dark: '#1a1512', light: '#f6f2ec' };

function syncThemeColor(): void {
  const mode = document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLORS[mode]);
}

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
  syncThemeColor();
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

const ACCENT_KEY = 'sq-accent';

/** Where the accent colour comes from: the current room's colour, or neutral (monochrome). */
export type Accent = 'room' | 'mono';
// Getters, so each read follows the current language (and Object.keys still lists both).
export const ACCENT_LABELS: Record<Accent, string> = {
  get room() {
    return t('shell.accent.room');
  },
  get mono() {
    return t('shell.accent.mono');
  },
};

export function getAccent(): Accent {
  try {
    return localStorage.getItem(ACCENT_KEY) === 'mono' ? 'mono' : 'room';
  } catch {
    return 'room';
  }
}

export function applyAccent(accent: Accent): void {
  if (accent === 'mono') document.documentElement.dataset.accent = 'mono';
  else delete document.documentElement.dataset.accent;
}

export function setAccent(accent: Accent): void {
  try {
    if (accent === 'room') localStorage.removeItem(ACCENT_KEY);
    else localStorage.setItem(ACCENT_KEY, accent);
  } catch {
    /* storage unavailable - the choice just won't persist */
  }
  applyAccent(accent);
}
