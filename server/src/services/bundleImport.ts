import { HttpError } from '../util/httpError.js';

/** Most games one bundle can be split into. Far above any real bundle, it only bounds a bad request. */
export const MAX_BUNDLE_GAMES = 50;

/** Validates the igdbIds of a bundle split (issue #857): whole positive numbers, repeats dropped (the
 * order of first appearance is kept), at least one and at most MAX_BUNDLE_GAMES. */
export function parseBundleIgdbIds(value: unknown): number[] {
  if (!Array.isArray(value)) throw new HttpError(400, 'igdbIds must be a list of game ids');
  const ids: number[] = [];
  for (const v of value) {
    if (typeof v !== 'number' || !Number.isInteger(v) || v <= 0) throw new HttpError(400, 'Every igdbId must be a whole number');
    if (!ids.includes(v)) ids.push(v);
  }
  if (ids.length === 0) throw new HttpError(400, 'Pick at least one game from the bundle');
  if (ids.length > MAX_BUNDLE_GAMES) throw new HttpError(400, `A bundle can hold at most ${MAX_BUNDLE_GAMES} games`);
  return ids;
}
