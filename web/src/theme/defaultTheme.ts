import { t } from '../i18n';

// Matches the "Rust" preset below - the industrial/minimal redesign's default accent, a muted
// rust-orange in keeping with its desaturated palette rather than the old vivid sky blue.
export const DEFAULT_ACCENT = '#c2683a';

/** Small curated palette room masters can pick from — accent-only theming for v1. */
export const ACCENT_PRESETS = [
  { get name() { return t('shell.accentPreset.rust'); }, value: '#c2683a' },
  { get name() { return t('shell.accentPreset.forest'); }, value: '#3f7d5c' },
  { get name() { return t('shell.accentPreset.slate'); }, value: '#4a6da8' },
  { get name() { return t('shell.accentPreset.olive'); }, value: '#8a8f7a' },
] as const;

export const AVATAR_COLORS = ['#E8734A', '#4A8FE8', '#6FBF73', '#B87DE8', '#E8C34A', '#4AE8D0'] as const;
