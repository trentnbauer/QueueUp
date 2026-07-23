import type { Game, GameStatus } from '@queueup/shared';

/** Sentinel meaning "no filter applied" for both the platform and genre pill filters. */
export const ALL_FILTER_VALUE = '__all__';

export const GAME_STATUS_LABEL: Record<GameStatus, string> = {
  backlog: 'Backlog',
  playing: 'Playing',
  done: 'Beaten',
  dropped: 'Dropped',
  wishlist: 'Wishlist',
  replay: 'Replay',
};

export const GAME_STATUS_LIST: GameStatus[] = ['wishlist', 'backlog', 'playing', 'done', 'replay', 'dropped'];

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

/** Prefers the exact `releaseDate` (issue #284) when it's set - a game added before that field
 * existed only has `releaseYear`, so this falls back to "release year is strictly later than the
 * current year," which can't catch a game releasing later this same year. Both `null` (unknown/not
 * fetched) are treated as released rather than excluded, since that's far more often an older or
 * obscure title IGDB didn't have release data for than an unannounced one. */
export function isUnreleased(game: Game, now: number = Date.now()): boolean {
  if (game.releaseDate !== null) return new Date(game.releaseDate).getTime() > now;
  return game.releaseYear !== null && game.releaseYear > new Date(now).getFullYear();
}

/** True when `game` has a "play after" prerequisite (see Game.prerequisiteGameId) set, and that
 * prerequisite isn't marked Done yet - e.g. Borderlands 2 pointed at a not-yet-beaten Borderlands
 * 1. A missing/removed prerequisite (no longer in `games`) doesn't block - there's nothing left to
 * wait on. */
export function hasUnmetPrerequisite(game: Game, games: Game[]): boolean {
  if (!game.prerequisiteGameId) return false;
  const prerequisite = games.find((g) => g.id === game.prerequisiteGameId);
  if (!prerequisite) return false;
  return prerequisite.status !== 'done';
}

/** Every backlog (or queued-for-replay) game, regardless of vote count - the full pool Spin the
 * Wheel draws from. Replay is included alongside backlog - that's the whole point of the status,
 * a beaten game queued to play again should be pickable same as one never played at all. Excludes
 * games that haven't released yet (see isUnreleased) - nobody can actually play them yet, so the
 * wheel shouldn't be able to land on one even though it's sitting in the backlog - and games with
 * an unmet "play after" prerequisite (see hasUnmetPrerequisite), so the wheel can't jump ahead to a
 * sequel before its predecessor is done. */
export function backlogGames(games: Game[], now: number = Date.now()): Game[] {
  return games.filter(
    (g) => (g.status === 'backlog' || g.status === 'replay') && !isUnreleased(g, now) && !hasUnmetPrerequisite(g, games),
  );
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

/** Currently Playing first, then the rest of the backlog (replay-queued games interleaved with
 * it), then Wishlist, then Completed, then Dropped last. The Spin the Wheel tile is inserted
 * between the Playing and backlog groups by the caller, not accounted for here. */
export function statusBucket(game: Game): number {
  if (game.status === 'playing') return 0;
  if (game.status === 'backlog' || game.status === 'replay') return 1;
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

// Review-score multiplier range (issue #311) - deliberately mild compared to the vote/genre
// factors above (a 2x swing at most, vs. votes' unbounded-but-slow sqrt growth and genre's flat
// 2x), since this is a nudge toward quality, not a replacement for the room's own votes. Linear
// from REVIEW_SCORE_MIN_MULTIPLIER at reviewScore 0 to REVIEW_SCORE_MAX_MULTIPLIER at 100.
const REVIEW_SCORE_MIN_MULTIPLIER = 0.75;
const REVIEW_SCORE_MAX_MULTIPLIER = 1.5;

/** Maps a 0-100 IGDB review score to a weight multiplier - null (no review data at all, either
 * because IGDB has none or the game was added before this was captured) is neutral (1x, same as
 * doing nothing), not a penalty - "no data" and "confirmed mediocre" aren't the same thing. */
export function reviewScoreMultiplier(reviewScore: number | null): number {
  if (reviewScore === null) return 1;
  const t = Math.max(0, Math.min(100, reviewScore)) / 100;
  return REVIEW_SCORE_MIN_MULTIPLIER + t * (REVIEW_SCORE_MAX_MULTIPLIER - REVIEW_SCORE_MIN_MULTIPLIER);
}

/** A candidate's effective Spin the Wheel weight: its vote score (diminishing-returns scaled, plus
 * a small baseline so an unvoted game isn't a guaranteed loser), boosted for genre variety against
 * `avoided` (see avoidedGenres), and nudged by its IGDB review score (see reviewScoreMultiplier).
 * The sqrt scale keeps "more votes = more likely" without letting one heavily-voted game
 * statistically crush every other candidate - a 16-vote game is only 4x as likely as a 1-vote
 * game, not 16x, so the wheel still has real suspense instead of a predictable outcome. Exported
 * mainly for testing - callers should use pickSpinWinner. */
export function spinCandidateWeight(game: Game, avoided: Set<string>): number {
  const primary = primaryGenre(game.genre);
  const differs = avoided.size > 0 && primary !== null && !avoided.has(primary);
  return (
    (Math.sqrt(game.voteScore) + UNVOTED_BASELINE_WEIGHT) *
    (differs ? GENRE_DIVERSITY_MULTIPLIER : 1) *
    reviewScoreMultiplier(game.reviewScore)
  );
}

/** Spin the Wheel's actual pick: weighted by vote score, boosted for differing from the genre of
 * the game most recently marked Done and every currently-Playing game's genre - so the wheel
 * nudges toward variety instead of just repeating whatever's in progress or just finished. */
export function pickSpinWinner(games: Game[], candidates: Game[], random: () => number = Math.random): Game | null {
  const avoided = avoidedGenres(games);
  return weightedPick(candidates, (g) => spinCandidateWeight(g, avoided), random);
}
