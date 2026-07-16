/** WCAG relative luminance of a #rrggbb color, used to decide whether light or dark text reads
 * clearly on top of it - a fixed white (or fixed theme) text color looks fine on darker presets
 * like Violet or Sky, but is close to unreadable on brighter ones like Lime. */
function relativeLuminance(hex: string): number {
  const normalized = hex.replace('#', '');
  const r = parseInt(normalized.substring(0, 2), 16) / 255;
  const g = parseInt(normalized.substring(2, 4), 16) / 255;
  const b = parseInt(normalized.substring(4, 6), 16) / 255;

  const linear = (channel: number) => (channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

/** Picks near-black or near-white text for readable contrast against an arbitrary background
 * color (room accent colors, user avatar colors) - falls back to white for anything unparseable. */
export function contrastTextColor(backgroundHex: string): string {
  if (!/^#[0-9a-fA-F]{6}$/.test(backgroundHex)) return '#fff';
  // 0.5 rather than the "official" WCAG threshold (~0.18 for AA on white text) is a deliberately
  // stricter cutoff for this app's small, bold initials rendered directly on flat color swatches.
  return relativeLuminance(backgroundHex) > 0.5 ? '#1a1926' : '#fff';
}
