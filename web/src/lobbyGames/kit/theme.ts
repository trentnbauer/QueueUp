/** The look of every lobby game's arena. The arena is a fixed dark "stage" (so a game reads the same in
 * any theme), warm like the rest of QueueUp, and takes its accent, status and text colours from the
 * app's CSS variables so a room's tint and the Monochrome theme still apply. */

export const STAGE = {
  skyTop: 'oklch(0.24 0.04 45)',
  skyMid: 'oklch(0.175 0.014 55)',
  skyBottom: 'oklch(0.14 0.008 55)',
  ground: 'oklch(0.12 0.006 55)',
  groundLine: 'oklch(1 0 0 / 0.14)',
  groundTick: 'oklch(1 0 0 / 0.08)',
  dot: 'oklch(1 0 0 / 0.06)',
  /** Fill and outline of the little pills of the heads-up display. */
  hudFill: 'oklch(0.12 0.006 55 / 0.6)',
  hudStroke: 'oklch(1 0 0 / 0.1)',
  /** A thin light outline around anything drawn on the stage. */
  edge: 'oklch(1 0 0 / 0.14)',
  /** The dark ink for text outlines. */
  ink: 'oklch(0.14 0.008 55)',
} as const;

/** Fonts as the app loads them (web/index.html). Canvas text needs the real family names, not the CSS
 * variables. */
export const FONT = {
  display: "'Bricolage Grotesque', sans-serif",
  ui: "Geist, system-ui, sans-serif",
  mono: "'Geist Mono', ui-monospace, monospace",
} as const;

/** The app colours a game's art uses, read from the CSS variables once per frame. */
export interface StageTheme {
  acc: string;
  /** The accent at about 80% opacity, for a glow. */
  accGlow: string;
  accText: string;
  /** Dark text to put on the accent. */
  ink: string;
  star: string;
  danger: string;
  mint: string;
  text: string;
  surf: string;
  line: string;
}

export function stageTheme(color: (name: string, fallback: string) => string): StageTheme {
  return {
    acc: color('--acc', 'oklch(0.74 0.15 45)'),
    accGlow: color('--accA80', 'oklch(0.74 0.15 45 / 0.8)'),
    accText: color('--accText', 'oklch(0.82 0.11 50)'),
    ink: color('--ink', 'oklch(0.2 0.03 45)'),
    star: color('--star', 'oklch(0.83 0.15 85)'),
    danger: color('--danger', 'oklch(0.76 0.14 25)'),
    mint: color('--mint', 'oklch(0.82 0.12 160)'),
    text: color('--text', 'oklch(0.95 0.006 70)'),
    surf: color('--surf', 'oklch(0.21 0.009 55)'),
    line: color('--line', 'oklch(1 0 0 / 0.14)'),
  };
}
