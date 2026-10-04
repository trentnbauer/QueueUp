import type { Game } from '@queueup/shared';

/** Optional narrowing the Spin dialog offers on top of the room's own pool rules. */
export interface SpinFilters {
  /** Only games the caller owns or that cost at most this much. */
  maxPrice?: number;
  /** Only games with a known time to beat of at most this many hours. */
  maxTtb?: number;
  /** Only games every current member owns. */
  everyoneOwns?: boolean;
  /** Only games IGDB scores at least this high (0-100). Games with no IGDB score are left out. */
  minScore?: number;
  /** Only games whose install size is known and at most this many MB (#800). */
  maxSizeMb?: number;
}

/** Reads the filters out of a start/restart request body, ignoring anything that isn't a positive number. */
export function parseSpinFilters(body: unknown): SpinFilters {
  const b = (body ?? {}) as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : undefined);
  const minScore = num(b.minScore);
  return { maxPrice: num(b.maxPrice), maxTtb: num(b.maxTtb), everyoneOwns: b.everyoneOwns === true, minScore: minScore && minScore <= 100 ? minScore : undefined, maxSizeMb: num(b.maxSizeMb) };
}

export function applySpinFilters(candidates: Game[], f: SpinFilters): Game[] {
  return candidates.filter((g) => {
    if (f.maxPrice && !(g.youOwn || (g.price.amount !== null && Number(g.price.amount) <= f.maxPrice))) return false;
    if (f.maxTtb && !(g.timeToBeatHours !== null && g.timeToBeatHours <= f.maxTtb)) return false;
    if (f.everyoneOwns && !(g.ownership && g.ownership.owned === g.ownership.total && g.ownership.total > 0)) return false;
    if (f.minScore && !(g.reviewScore !== null && g.reviewScore >= f.minScore)) return false;
    if (f.maxSizeMb && !(g.downloadSizeMb !== null && g.downloadSizeMb <= f.maxSizeMb)) return false;
    return true;
  });
}
