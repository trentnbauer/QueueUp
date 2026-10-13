import type { DlcKind, Game, GameStatus, VoteValue } from '@queueup/shared';

/** Where a game's price comes from: a live gg.deals price, one the person typed in, or nothing yet. */
export type PriceMode = 'live' | 'manual' | 'none';

export function priceModeOf(g: Pick<Game, 'price' | 'manualPrice'>): PriceMode {
  if (g.price.amount) return 'live';
  if (g.manualPrice) return 'manual';
  return 'none';
}

/** The ★ in the meta line: IGDB's 0-100 score as 0-10 to one decimal; null when there isn't one. */
export function starScore(reviewScore: number | null): string | null {
  if (reviewScore === null || !Number.isFinite(reviewScore)) return null;
  return (reviewScore / 10).toFixed(1);
}

/** "up to 4 players" / "Single-player" / nothing when IGDB doesn't say. */
export function playersKind(g: Pick<Game, 'singlePlayerOnly' | 'maxCoopPlayers'>): { kind: 'solo' } | { kind: 'max'; max: number } | null {
  if (g.singlePlayerOnly) return { kind: 'solo' };
  if (g.maxCoopPlayers && g.maxCoopPlayers > 0) return { kind: 'max', max: g.maxCoopPlayers };
  return null;
}

/** "~8 sessions to finish (5h)": rooms with a typical session set, and a known main-story time. */
export function sessionsToFinish(timeToBeatHours: number | null, typicalSessionHours: number | null | undefined): { count: number; hours: number } | null {
  if (!timeToBeatHours || timeToBeatHours <= 0 || !typicalSessionHours || typicalSessionHours <= 0) return null;
  return { count: Math.ceil(timeToBeatHours / typicalSessionHours), hours: typicalSessionHours };
}

/** The amber warning under the stats: single-player in a room with several people, or more people than the game takes. */
export type CoopWarning = { kind: 'solo' } | { kind: 'over'; max: number; members: number };

export function coopWarning(g: Pick<Game, 'singlePlayerOnly' | 'maxCoopPlayers'>, memberCount: number, isShelf: boolean): CoopWarning | null {
  if (isShelf) return null;
  if (g.singlePlayerOnly === true && memberCount > 1) return { kind: 'solo' };
  if (g.maxCoopPlayers != null && memberCount > g.maxCoopPlayers) return { kind: 'over', max: g.maxCoopPlayers, members: memberCount };
  return null;
}

/** The summed "score" and vote count shown in the first stats cell. */
export function voteTally(g: Pick<Game, 'votes' | 'voteScore'>): { score: number | null; count: number } {
  return { score: g.votes.length ? g.voteScore : null, count: g.votes.length };
}

/** "2 must · 1 hyped": how many people voted each value, strongest first. `label` turns a value into its word. */
export function verdictParts(votes: { value: VoteValue }[]): { value: VoteValue; count: number }[] {
  const counts = new Map<VoteValue, number>();
  for (const v of votes) counts.set(v.value, (counts.get(v.value) ?? 0) + 1);
  return ([5, 4, 3, 2, 1] as VoteValue[]).filter((v) => counts.has(v)).map((v) => ({ value: v, count: counts.get(v)! }));
}

/** The numbered path a game follows. Rooms have no Wishlist (ownership is per member there); the shelf starts at it. */
export function mainPath(isShelf: boolean): GameStatus[] {
  return isShelf ? ['wishlist', 'backlog', 'play_next', 'playing', 'done'] : ['backlog', 'play_next', 'playing', 'done'];
}

/** The statuses off the path: Paused, Replay, Dropped and Won't Play, on the shelf and in rooms alike. */
export function offPath(): GameStatus[] {
  return ['paused', 'replay', 'dropped', 'wont_play'];
}

export const OFF_PATH_EMOJI: Partial<Record<GameStatus, string>> = { paused: '⏸️', replay: '🔄', dropped: '🛑', wont_play: '🚫' };

/** Which statuses end a playthrough and open the review sheet. */
export const FINISHED_STATUSES: GameStatus[] = ['done', 'dropped', 'replay'];

/** The circle on the status block: the step number on the path, the emoji off it. */
export function statusBadge(status: GameStatus, isShelf: boolean): string {
  const off = OFF_PATH_EMOJI[status];
  if (off) return off;
  const i = mainPath(isShelf).indexOf(status);
  return i >= 0 ? String(i + 1) : '•';
}

/** Which of the progress segments are filled. Off the path nothing is. */
export function progressSegments(status: GameStatus, isShelf: boolean): boolean[] {
  const path = mainPath(isShelf);
  const at = path.indexOf(status);
  return path.map((_, i) => at >= 0 && i <= at);
}

/** The lowest price on record above $0 (free giveaways don't count); null when there is none. */
export function lowestAboveZero(amounts: number[], historicalLow?: string | null): number | null {
  const real = amounts.filter((a) => a > 0);
  if (real.length) return Math.min(...real);
  const low = Number(historicalLow);
  return low > 0 ? low : null;
}

/** The three alert presets for a price: all-time low, half price, and just under the current price. Skips any that
 * wouldn't make sense (no low known, or at or above the current price). */
export function alertPresets(current: number, lowest: number | null): { key: 'low' | 'half' | 'any'; value: number }[] {
  const out: { key: 'low' | 'half' | 'any'; value: number }[] = [];
  if (lowest !== null && lowest > 0 && lowest < current) out.push({ key: 'low', value: lowest });
  const half = Math.round(current * 50) / 100;
  if (half > 0 && half < current && (lowest === null || Math.abs(half - lowest) > 0.005)) out.push({ key: 'half', value: half });
  const any = Math.round((current - 0.01) * 100) / 100;
  if (any > 0) out.push({ key: 'any', value: any });
  return out;
}

/** DLC list pill tone for a status ("Not added" is `null`): mint when finished, accent while it's wanted or in play, neutral otherwise. */
export function dlcPillTone(status: GameStatus | null): 'mint' | 'accent' | 'neutral' | 'none' {
  if (status === null) return 'none';
  if (status === 'done' || status === 'replay') return 'mint';
  if (status === 'wishlist' || status === 'play_next' || status === 'playing') return 'accent';
  return 'neutral';
}

/** The type word on a DLC: DLC, Expansion, Standalone, Pack. Anything unknown reads as DLC. */
export function dlcKindOrDefault(kind: DlcKind | undefined | null): DlcKind {
  return kind ?? 'dlc';
}

/** Per-game, per-kind "Not yet" on a nudge, kept on this device. */
const NUDGE_KEY = 'qu-nudge-dismissed';

export function nudgeDismissed(gameId: string, kind: 'beaten' | 'playing'): boolean {
  try {
    return localStorage.getItem(`${NUDGE_KEY}:${gameId}:${kind}`) === '1';
  } catch {
    return false;
  }
}

export function dismissNudge(gameId: string, kind: 'beaten' | 'playing'): void {
  try {
    localStorage.setItem(`${NUDGE_KEY}:${gameId}:${kind}`, '1');
  } catch {
    /* storage unavailable: the nudge just comes back next time */
  }
}
