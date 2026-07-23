// Matches the "Sky" preset below - a cooler, more sedate blue than the old violet default, in
// keeping with the app's "sleek midnight" dark theme rather than the original saturated-purple one.
export const DEFAULT_ACCENT = '#4a8fe8';

/** Small curated palette room masters can pick from — accent-only theming for v1. */
export const ACCENT_PRESETS = [
  { name: 'Violet', value: '#8b5cf6' },
  { name: 'Teal', value: '#2dd4bf' },
  { name: 'Coral', value: '#e8734a' },
  { name: 'Sky', value: '#4a8fe8' },
  { name: 'Lime', value: '#a3e635' },
  { name: 'Rose', value: '#e84a8f' },
] as const;

export const AVATAR_COLORS = ['#E8734A', '#4A8FE8', '#6FBF73', '#B87DE8', '#E8C34A', '#4AE8D0'] as const;
