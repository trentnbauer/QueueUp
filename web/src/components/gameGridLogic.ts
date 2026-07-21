import type { Game, GameStatus } from '@queueup/shared';

/** Sentinel meaning "no filter applied" for both the platform and genre pill filters. */
export const ALL_FILTER_VALUE = '__all__';

export const GAME_STATUS_LABEL: Record<GameStatus, string> = {
  backlog: 'Backlog',
  playing: 'Playing',
  done: 'Done',
  dropped: 'Dropped',
  wishlist: 'Wishlist',
};

export const GAME_STATUS_LIST: GameStatus[] = ['wishlist', 'backlog', 'playing', 'done', 'dropped'];

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

export interface GameFilterState {
  platformFilter: string;
  genreFilter: string;
  statusFilter: string;
  searchQuery: string;
  /** True to show only "collecting dust" games (see isNeglectedBacklogGame) - false/undefined
   * applies no filtering on this axis, same convention as the other pill filters using
   * ALL_FILTER_VALUE, just boolean instead of multi-option since there's nothing to pick between. */
  neglectedFilter?: boolean;
}

/** The platform/genre/status/neglected/search predicate GameGrid renders by - pulled out so any
 * other place that needs to know "what's actually visible" (e.g. the Personal Shelf's bulk-select
 * "Select all", which must not silently include games hidden by the active filter) applies the
 * exact same rule instead of a second, driftable copy of it. */
export function filterGames(games: Game[], filter: GameFilterState, now: number = Date.now()): Game[] {
  const normalizedQuery = filter.searchQuery.trim().toLowerCase();
  return games.filter(
    (g) =>
      (filter.platformFilter === ALL_FILTER_VALUE || splitLabel(g.platform).includes(filter.platformFilter)) &&
      (filter.genreFilter === ALL_FILTER_VALUE || splitLabel(g.genre).includes(filter.genreFilter)) &&
      (filter.statusFilter === ALL_FILTER_VALUE || g.status === filter.statusFilter) &&
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

  const threshold = new Date(now);
  threshold.setMonth(threshold.getMonth() - NEGLECTED_BACKLOG_MONTHS);
  const thresholdMs = threshold.getTime();

  if (new Date(game.createdAt).getTime() > thresholdMs) return false;
  if (new Date(game.updatedAt).getTime() > thresholdMs) return false;
  if (game.votes.some((v) => new Date(v.createdAt).getTime() > thresholdMs)) return false;

  return true;
}

/** A room game every *current* member owns is the easiest "let's just play this" pick - nothing
 * to buy first - so it outranks vote score entirely (issue #173). Always false for a Personal
 * Shelf game (ownership is null there - no group to own it "fully"). */
function isFullyOwned(game: Game): boolean {
  return game.ownership !== null && game.ownership.total > 0 && game.ownership.owned === game.ownership.total;
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

/** Every backlog game, regardless of vote count - the full pool Spin the Wheel draws from. */
export function backlogGames(games: Game[]): Game[] {
  return games.filter((g) => g.status === 'backlog');
}

// IGDB genre strings are comma-joined and often carry several tags (e.g. "Shooter, Adventure");
// comparing the full tag set for zero overlap is too strict in practice — broad secondary tags
// like "Adventure" or "Indie" show up on all sorts of otherwise-unrelated games and would mask an
// otherwise clearly different pick. The first-listed tag is IGDB's primary genre for the game, so
// that's what "different genre" compares.
export function primaryGenre(genre: string | null): string | null {
  const first = (genre ?? '').split(',')[0]?.trim().toLowerCase();
  return first || null;
}

/** Primary genre of the most recently completed game, or null if nothing's been completed yet or
 * the most recent completion has no genre data. */
export function lastCompletedPrimaryGenre(games: Game[]): string | null {
  const completed = games.filter((g) => g.status === 'done');
  if (completed.length === 0) return null;

  const lastCompleted = completed.reduce((latest, g) =>
    new Date(g.updatedAt).getTime() > new Date(latest.updatedAt).getTime() ? g : latest,
  );
  return primaryGenre(lastCompleted.genre);
}

/** The set of primary genres Spin the Wheel treats as "already covered" - the most recently
 * completed game's, plus every currently-Playing game's (a room can have more than one game
 * marked Playing at once). Used to nudge the spin toward variety rather than another round of
 * whatever's already in progress or just finished. */
export function avoidedGenres(games: Game[]): Set<string> {
  const genres = new Set<string>();

  const lastCompleted = lastCompletedPrimaryGenre(games);
  if (lastCompleted) genres.add(lastCompleted);

  for (const game of games) {
    if (game.status !== 'playing') continue;
    const primary = primaryGenre(game.genre);
    if (primary) genres.add(primary);
  }

  return genres;
}

/** Currently Playing first, then the rest of the backlog, then Completed last. The Spin the Wheel
 * tile is inserted between the Playing and backlog groups by the caller, not accounted for here. */
export function statusBucket(game: Game): number {
  if (game.status === 'playing') return 0;
  if (game.status === 'backlog') return 1;
  if (game.status === 'wishlist') return 2;
  if (game.status === 'done') return 3;
  return 4; // dropped
}

/** Picks one item at random from `items`, weighted by `weight(item)` - an item with twice the
 * weight of another is twice as likely to be picked, but every item has a real (if small) chance
 * as long as its weight is positive. Falls back to a uniform pick when every weight is zero (or
 * the list is empty, when it returns null instead). `random` defaults to Math.random but is
 * injectable for deterministic tests. */
function weightedPick<T>(items: T[], weight: (item: T) => number, random: () => number): T | null {
  if (items.length === 0) return null;
  const totalWeight = items.reduce((sum, item) => sum + weight(item), 0);
  if (totalWeight <= 0) return items[Math.floor(random() * items.length)];

  let roll = random() * totalWeight;
  for (const item of items) {
    roll -= weight(item);
    if (roll <= 0) return item;
  }
  return items[items.length - 1];
}

// A Spin the Wheel candidate whose primary genre isn't already "covered" (see avoidedGenres) gets
// its vote-score weight multiplied by this - nudges the spin toward variety without ever fully
// overriding the vote signal: a heavily-voted same-genre pick can still win, just less often than
// it otherwise would.
const GENRE_DIVERSITY_MULTIPLIER = 2;

// A candidate with zero votes still gets this much weight, so an unvoted backlog game always has
// *some* chance of winning instead of a hard-locked 0% - without it, as soon as any one candidate
// has a vote, every still-unvoted candidate becomes mathematically unpickable (weight 0 always
// loses to weight >0), which made the wheel feel rigged toward whichever game happened to get
// voted on first.
const UNVOTED_BASELINE_WEIGHT = 1;

/** A candidate's effective Spin the Wheel weight: its vote score (diminishing-returns scaled, plus
 * a small baseline so an unvoted game isn't a guaranteed loser), boosted for genre variety against
 * `avoided` (see avoidedGenres). The sqrt scale keeps "more votes = more likely" without letting
 * one heavily-voted game statistically crush every other candidate - a 16-vote game is only 4x as
 * likely as a 1-vote game, not 16x, so the wheel still has real suspense instead of a predictable
 * outcome. Exported mainly for testing - callers should use pickSpinWinner. */
export function spinCandidateWeight(game: Game, avoided: Set<string>): number {
  const primary = primaryGenre(game.genre);
  const differs = avoided.size > 0 && primary !== null && !avoided.has(primary);
  return (Math.sqrt(game.voteScore) + UNVOTED_BASELINE_WEIGHT) * (differs ? GENRE_DIVERSITY_MULTIPLIER : 1);
}

/** Spin the Wheel's actual pick: weighted by vote score, boosted for differing from the genre of
 * the game most recently marked Done and every currently-Playing game's genre - so the wheel
 * nudges toward variety instead of just repeating whatever's in progress or just finished. */
export function pickSpinWinner(games: Game[], candidates: Game[], random: () => number = Math.random): Game | null {
  const avoided = avoidedGenres(games);
  return weightedPick(candidates, (g) => spinCandidateWeight(g, avoided), random);
}
