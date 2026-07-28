import type { Game, GameStatus } from '@queueup/shared';
import { isFullyOwned } from '@queueup/shared';

// Spin the Wheel's candidate-selection and winner-picking logic lives in packages/shared (moved
// there alongside the shared room spin session) so the server can compute the exact same pool and
// winner a client would - re-exported here so every existing import from './gameGridLogic' keeps
// working unchanged.
export {
  isUnreleased,
  hasUnmetPrerequisite,
  backlogGames,
  isFullyOwned,
  hasSteamMatch,
  underPriceCap,
  spinCandidates,
  primaryGenre,
  lastCompletedPrimaryGenre,
  avoidedGenres,
  reviewScoreMultiplier,
  spinCandidateWeight,
  pickSpinWinner,
} from '@queueup/shared';

/** Sentinel meaning "no filter applied" for both the platform and genre pill filters. */
export const ALL_FILTER_VALUE = '__all__';

export const GAME_STATUS_LABEL: Record<GameStatus, string> = {
  backlog: 'Backlog',
  play_next: 'Play Next',
  playing: 'Playing',
  done: 'Beaten',
  dropped: 'Dropped',
  wishlist: 'Wishlist',
  replay: 'Replay',
};

export const GAME_STATUS_LIST: GameStatus[] = ['wishlist', 'backlog', 'play_next', 'playing', 'done', 'replay', 'dropped'];

/** Genre/platform are stored as comma-joined labels (e.g. "PC, Xbox"), so filter options and
 * matching both split on ", " rather than treating the whole string as one value. */
export function splitLabel(value: string | null): string[] {
  return value ? value.split(',').map((v) => v.trim()).filter(Boolean) : [];
}

export function distinctValues(games: Game[], pick: (g: Game) => string | null): string[] {
  const values = new Set<string>();
  for (const game of games) {
    for (const v of splitLabel(pick(game))) values.add(v);
  }
  return Array.from(values).sort((a, b) => a.localeCompare(b));
}

/** Every distinct tag name across `games` (issue #247) - unlike platform/genre, a game's tags are
 * already a discrete array (see Game.tags), not a comma-joined string, so this doesn't need
 * splitLabel. Filtering by name (not id) matches the plain-string convention PillFilter already
 * uses for platform/genre/status, and is safe to do since a user can't have two tags with the same
 * name (Tag's @@unique([userId, name])) - so within one viewer's own games, a tag name is already
 * a unique key. */
export function distinctTagNames(games: Game[]): string[] {
  const values = new Set<string>();
  for (const game of games) {
    for (const tag of game.tags) values.add(tag.name);
  }
  return Array.from(values).sort((a, b) => a.localeCompare(b));
}

export interface GameFilterState {
  platformFilter: string;
  genreFilter: string;
  statusFilter: string;
  /** Tag name to filter to, or ALL_FILTER_VALUE for no filtering (issue #247) - see
   * distinctTagNames for why a name (not a tag id) is the right key here. */
  tagFilter?: string;
  searchQuery: string;
  /** True to show only "collecting dust" games (see isNeglectedBacklogGame) - false/undefined
   * applies no filtering on this axis, same convention as the other pill filters using
   * ALL_FILTER_VALUE, just boolean instead of multi-option since there's nothing to pick between. */
  neglectedFilter?: boolean;
}

/** The platform/genre/status/tag/neglected/search predicate GameGrid renders by - pulled out so any
 * other place that needs to know "what's actually visible" (e.g. the Personal Shelf's bulk-select
 * "Select all", which must not silently include games hidden by the active filter) applies the
 * exact same rule instead of a second, driftable copy of it. */
export function filterGames(games: Game[], filter: GameFilterState, now: number = Date.now()): Game[] {
  const normalizedQuery = filter.searchQuery.trim().toLowerCase();
  const tagFilter = filter.tagFilter ?? ALL_FILTER_VALUE;
  return games.filter(
    (g) =>
      (filter.platformFilter === ALL_FILTER_VALUE || splitLabel(g.platform).includes(filter.platformFilter)) &&
      (filter.genreFilter === ALL_FILTER_VALUE || splitLabel(g.genre).includes(filter.genreFilter)) &&
      (filter.statusFilter === ALL_FILTER_VALUE || g.status === filter.statusFilter) &&
      (tagFilter === ALL_FILTER_VALUE || g.tags.some((t) => t.name === tagFilter)) &&
      (!filter.neglectedFilter || isNeglectedBacklogGame(g, now)) &&
      (normalizedQuery === '' || g.title.toLowerCase().includes(normalizedQuery)),
  );
}

// Ongoing "you've had this a while and haven't touched it" nudge (issue #249) - Year in Review
// (see the /api/me/year-in-review route) already says this, but only as a once-a-year, on-demand
// snapshot over a fixed trailing-12-month window. This is meant to be a year-round ambient signal
// instead, so it needs a much shorter window - 3 months is long enough that a game isn't flagged
// the week after it's added, but short enough to actually nudge toward clearing the backlog rather
// than only ever looking back once a year. Named/exported so the threshold has exactly one place to
// tune instead of a magic number buried in the predicate below.
export const NEGLECTED_BACKLOG_MONTHS = 3;

/** A backlog game added NEGLECTED_BACKLOG_MONTHS+ ago with no recent activity. "No recent
 * activity" mirrors how the rest of the codebase already treats these two signals (see the
 * year-in-review route): Game.updatedAt as a proxy for the last status change - any edit bumps it,
 * so a completely untouched game will have updatedAt === createdAt, but this can also miss genuine
 * neglect if some unrelated edit (e.g. a target price) bumped it - and votes checked separately via
 * their own per-vote createdAt, since casting a vote does not touch Game.updatedAt at all. */
export function isNeglectedBacklogGame(game: Game, now: number = Date.now()): boolean {
  if (game.status !== 'backlog') return false;

  // Plain `setMonth(getMonth() - N)` overflows into the following month whenever the current
  // day-of-month doesn't exist N months earlier (e.g. May 31 minus 3 months rolls past a
  // 28-day February into March 3, not Feb 28) - shifting the day to the 1st first avoids the
  // month-length mismatch, then the original day is restored, clamped to the target month's
  // actual last day so it can't overflow into the month after that instead.
  const threshold = new Date(now);
  const originalDay = threshold.getDate();
  threshold.setDate(1);
  threshold.setMonth(threshold.getMonth() - NEGLECTED_BACKLOG_MONTHS);
  const lastDayOfTargetMonth = new Date(threshold.getFullYear(), threshold.getMonth() + 1, 0).getDate();
  threshold.setDate(Math.min(originalDay, lastDayOfTargetMonth));
  const thresholdMs = threshold.getTime();

  if (new Date(game.createdAt).getTime() > thresholdMs) return false;
  if (new Date(game.updatedAt).getTime() > thresholdMs) return false;
  if (game.votes.some((v) => new Date(v.createdAt).getTime() > thresholdMs)) return false;

  return true;
}

export function sortByScore(games: Game[]): Game[] {
  // Game.updatedAt only reflects status changes, not votes (votes have their own row/timestamp),
  // so ties break on createdAt (newest-added first) rather than a misleading "recently voted" signal.
  return [...games].sort((a, b) => {
    const ownedDiff = Number(isFullyOwned(b)) - Number(isFullyOwned(a));
    if (ownedDiff !== 0) return ownedDiff;
    if (b.voteScore !== a.voteScore) return b.voteScore - a.voteScore;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}

/** Reorders `games` so each DLC entry (see Game.baseGameId) sits directly after its base game,
 * instead of wherever it happened to land in score/status order (issue #338's "place DLC in the
 * list view after the main game"). Deliberately overrides whatever ordering ran before it - a
 * grouped-by-relationship read takes priority over a pure score/status read, the same way the
 * issue itself asks for an explicit exception to normal ordering.
 *
 * A DLC whose base game isn't present in this exact array (filtered out by a status/search filter,
 * or just not in this list at all) falls back to its own normal position rather than vanishing -
 * there's nothing to group it after. Self-referencing baseGameId (shouldn't happen - see the
 * schema comment) is guarded against the same way, rather than silently dropping the game. */
export function groupDlcAfterBaseGame(games: Game[]): Game[] {
  const idsInList = new Set(games.map((g) => g.id));
  const isChild = (g: Game) => g.baseGameId != null && g.baseGameId !== g.id && idsInList.has(g.baseGameId);

  const childrenByBase = new Map<string, Game[]>();
  for (const g of games) {
    if (isChild(g)) {
      const list = childrenByBase.get(g.baseGameId!) ?? [];
      list.push(g);
      childrenByBase.set(g.baseGameId!, list);
    }
  }

  // Recursive rather than one level deep - a DLC's base game can itself be another DLC (a
  // 2+-level chain), and a non-recursive placement only ever re-attaches a root's *direct*
  // children, silently dropping anything nested deeper than one level. `visited` guards against
  // a cycle in bad data (nothing in the schema prevents baseGameId from forming a loop) turning
  // this into unbounded recursion.
  const result: Game[] = [];
  const visited = new Set<string>();
  const appendWithChildren = (g: Game) => {
    if (visited.has(g.id)) return;
    visited.add(g.id);
    result.push(g);
    for (const child of childrenByBase.get(g.id) ?? []) {
      appendWithChildren(child);
    }
  };
  for (const g of games) {
    if (isChild(g)) continue; // placed alongside its base game below instead
    appendWithChildren(g);
  }
  return result;
}

/** Wishlist/backlog games with a known, still-upcoming release date (issue #367), soonest first -
 * the pool a coming-soon countdown strip surfaces. Requires the exact `releaseDate`, unlike
 * isUnreleased's releaseYear fallback - a countdown needs a real day to count down to, and
 * releaseYear alone can't tell "next week" from "in 11 months" within the same year. */
export function upcomingReleases(games: Game[], now: number = Date.now()): Game[] {
  return games
    .filter((g) => (g.status === 'wishlist' || g.status === 'backlog') && g.releaseDate !== null && new Date(g.releaseDate).getTime() > now)
    .sort((a, b) => new Date(a.releaseDate as string).getTime() - new Date(b.releaseDate as string).getTime());
}

/** A game's best-known release timestamp for ordering purposes - releaseDate when set, else Jan 1
 * of releaseYear as a coarse fallback (matches isUnreleased's same releaseDate-preferred,
 * releaseYear-fallback precedence), else null (unknown - excluded from "what releases before this"
 * comparisons rather than guessed at). */
function releaseTimestamp(game: Game): number | null {
  if (game.releaseDate !== null) return new Date(game.releaseDate).getTime();
  if (game.releaseYear !== null) return new Date(game.releaseYear, 0, 1).getTime();
  return null;
}

/** The "play after" dropdown's default suggestion for a game that belongs to an IGDB collection -
 * the closest-released earlier entry from the same collection that's already in this room, so
 * picking up a sequel naturally suggests its immediate predecessor rather than an arbitrary earlier
 * game in the series. Null when the game isn't in a collection, has no release data to compare
 * against, or no earlier same-collection game is in the room yet. Purely a display-time suggestion
 * - nothing persists this until the user actually confirms a choice (or a different one). */
export function defaultPrerequisite(game: Game, roomGames: Game[]): Game | null {
  if (game.igdbCollectionId === null) return null;
  const thisRelease = releaseTimestamp(game);
  if (thisRelease === null) return null;

  const earlierInCollection = roomGames.filter((g) => {
    if (g.id === game.id || g.igdbCollectionId !== game.igdbCollectionId) return false;
    const t = releaseTimestamp(g);
    return t !== null && t < thisRelease;
  });
  if (earlierInCollection.length === 0) return null;

  return earlierInCollection.reduce((closest, g) => (releaseTimestamp(g)! > releaseTimestamp(closest)! ? g : closest));
}

/** How many of a franchise's entries already added to this room/shelf are Beaten, out of how many
 * are added (issue #366) - built on the IGDB collection id already stored per game
 * (igdbCollectionId), same field defaultPrerequisite above uses. This is progress through what's
 * already been added, not the whole franchise - there's no "how many games are in this series
 * total" data on file, only what's actually here. Null when the game isn't in a collection, or
 * it's the only entry from that collection added so far (nothing to show progress against). */
export function collectionProgress(game: Game, games: Game[]): { beaten: number; total: number } | null {
  if (game.igdbCollectionId === null) return null;
  const sameCollection = games.filter((g) => g.igdbCollectionId === game.igdbCollectionId);
  if (sameCollection.length < 2) return null;
  return { beaten: sameCollection.filter((g) => g.status === 'done').length, total: sameCollection.length };
}

/** Currently Playing (Playing and Play Next together - see PlayingStrip) first, then the rest of
 * the backlog (replay-queued games interleaved with it), then Wishlist, then Completed, then
 * Dropped last. */
export function statusBucket(game: Game): number {
  if (game.status === 'playing' || game.status === 'play_next') return 0;
  if (game.status === 'backlog' || game.status === 'replay') return 1;
  if (game.status === 'wishlist') return 2;
  if (game.status === 'done') return 3;
  return 4; // dropped
}

