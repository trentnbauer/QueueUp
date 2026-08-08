import type { Game, GameStatus } from '@queueup/shared';
import { isFullyOwned, isNeglectedBacklogGame, platformBrand } from '@queueup/shared';

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
  NEGLECTED_BACKLOG_MONTHS,
  isNeglectedBacklogGame,
  collectionProgress,
  platformBrand,
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
  wont_play: "Won't Play",
};

export const GAME_STATUS_LIST: GameStatus[] = [
  'wishlist',
  'backlog',
  'play_next',
  'playing',
  'done',
  'replay',
  'dropped',
  'wont_play',
];

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
      (filter.platformFilter === ALL_FILTER_VALUE ||
        splitLabel(g.platform).some((p) => platformBrand(p) === filter.platformFilter)) &&
      (filter.genreFilter === ALL_FILTER_VALUE || splitLabel(g.genre).includes(filter.genreFilter)) &&
      (filter.statusFilter === ALL_FILTER_VALUE || g.status === filter.statusFilter) &&
      (tagFilter === ALL_FILTER_VALUE || g.tags.some((t) => t.name === tagFilter)) &&
      (!filter.neglectedFilter || isNeglectedBacklogGame(g, now)) &&
      (normalizedQuery === '' || g.title.toLowerCase().includes(normalizedQuery)),
  );
}

// NEGLECTED_BACKLOG_MONTHS / isNeglectedBacklogGame live in packages/shared/src/backlogHeuristics.ts
// now (re-exported above) - the server's /api/me/next-pick route needs the exact same threshold
// math against a lean Prisma `select`, not the full Game type, so it moved alongside
// collectionProgress rather than staying client-only.

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

// collectionProgress also lives in packages/shared/src/backlogHeuristics.ts now (re-exported
// above) - see the comment above isNeglectedBacklogGame's old spot for why.

/** Currently Playing (Playing and Play Next together - see PlayingStrip) first, then the rest of
 * the backlog (replay-queued games interleaved with it), then Wishlist, then Completed, then
 * Dropped/Won't Play last (same tier - see DroppedStrip, which shows both together). */
export function statusBucket(game: Game): number {
  if (game.status === 'playing' || game.status === 'play_next') return 0;
  if (game.status === 'backlog' || game.status === 'replay') return 1;
  if (game.status === 'wishlist') return 2;
  if (game.status === 'done') return 3;
  return 4; // dropped, wont_play
}

