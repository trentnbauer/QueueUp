/** A rectangle on the arena, as fractions of its width and height (0..1). */
export interface TapRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The tap targets a game puts on the arena, for games where the play space is the controller (no buttons
 * underneath). Either a grid that fills the whole arena (`cols` by `rows`, numbered left to right, top to
 * bottom), or a list of rectangles (numbered in order; the first one a tap lands in wins, so put the one on
 * top first). `keys` is the keyboard key for each target, by number: the desktop way to tap. */
export type TapTargets = ({ cols: number; rows: number } | { rects: TapRect[] }) & { keys?: string[] };

/** How many targets there are. */
export function tapTargetCount(taps: TapTargets): number {
  return 'rects' in taps ? taps.rects.length : taps.cols * taps.rows;
}

/** Where target `index` is, as fractions of the arena; null if there is no such target. */
export function tapRect(taps: TapTargets, index: number): TapRect | null {
  if (!Number.isInteger(index) || index < 0 || index >= tapTargetCount(taps)) return null;
  if ('rects' in taps) return taps.rects[index];
  return { x: (index % taps.cols) / taps.cols, y: Math.floor(index / taps.cols) / taps.rows, w: 1 / taps.cols, h: 1 / taps.rows };
}

/** Which target a tap at (`fx`, `fy`) landed on, as fractions of the arena, or null for none. */
export function tapTargetAt(taps: TapTargets, fx: number, fy: number): number | null {
  if (!(fx >= 0 && fx <= 1 && fy >= 0 && fy <= 1)) return null;
  if ('rects' in taps) {
    const i = taps.rects.findIndex((r) => fx >= r.x && fx <= r.x + r.w && fy >= r.y && fy <= r.y + r.h);
    return i < 0 ? null : i;
  }
  const col = Math.min(taps.cols - 1, Math.floor(fx * taps.cols));
  const row = Math.min(taps.rows - 1, Math.floor(fy * taps.rows));
  return row * taps.cols + col;
}

/** Which target a keyboard key taps, or null. Keys are matched as the game lists them (lower case). */
export function tapTargetForKey(taps: TapTargets, key: string): number | null {
  const i = taps.keys?.indexOf(key) ?? -1;
  return i >= 0 && i < tapTargetCount(taps) ? i : null;
}
