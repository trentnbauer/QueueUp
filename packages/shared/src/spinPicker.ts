import type { Game } from './types.js';
import { CONCRETE_SPIN_WHEEL_THEMES, type ConcreteSpinWheelTheme, type SpinWheelTheme } from './types.js';

/** Resolves "random" to one of the concrete themes - `random` isn't itself renderable, see
 * ConcreteSpinWheelTheme. Shared between the client (the Personal Shelf's own local spin, which
 * has no room/server session to resolve it for) and the server (a room's shared spin session -
 * see RoomSpin) so "Random" resolves the same way in both places rather than two independent,
 * driftable copies of the same four-item pick. */
export function resolveConcreteTheme(theme: SpinWheelTheme, random: () => number = Math.random): ConcreteSpinWheelTheme {
  if (theme !== 'random') return theme;
  return CONCRETE_SPIN_WHEEL_THEMES[Math.floor(random() * CONCRETE_SPIN_WHEEL_THEMES.length)];
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
 * sequel before its predecessor is done. Play Next is deliberately not included here (same as
 * Playing/Done/Dropped) - once something's queued up next, the wheel shouldn't be able to bump it
 * for something else. */
export function backlogGames(games: Game[], now: number = Date.now()): Game[] {
  return games.filter(
    (g) => (g.status === 'backlog' || g.status === 'replay') && !isUnreleased(g, now) && !hasUnmetPrerequisite(g, games),
  );
}

/** A room game every *current* member owns is the easiest "let's just play this" pick - nothing
 * to buy first - so it outranks vote score entirely (issue #173). Always false for a Personal
 * Shelf game (ownership is null there - no group to own it "fully"). */
export function isFullyOwned(game: Game): boolean {
  return game.ownership !== null && game.ownership.total > 0 && game.ownership.owned === game.ownership.total;
}

/** True once a game has a live-priced store match (a Steam appid or a resolved gg.deals URL) -
 * the two ways underPriceCap below has anything to compare `spinOwnershipMaxPrice` against. */
export function hasSteamMatch(game: Game): boolean {
  return game.price.source === 'live' || game.ggDealsUrl !== null;
}

/** undefined maxPrice means no threshold is set at all (Personal Shelf) - never satisfied by price. */
export function underPriceCap(game: Game, maxPrice: number | undefined): boolean {
  if (maxPrice === undefined) return false;
  return game.price.source === 'live' && game.price.amount !== null && Number(game.price.amount) <= maxPrice;
}

/** Spin the Wheel's candidate pool (issue #339): the full backlog, narrowed - when a room has set
 * an ownership price threshold - to games every current member owns, or ones priced at or under
 * that threshold. Shared between the client (to decide whether the picker is locked, and to render
 * a matching Roulette slice layout) and the server (to pick a winner everyone agrees on) so the two
 * can never compute a different pool from the same room state. */
export function spinCandidates(games: Game[], spinOwnershipMaxPrice: number | undefined): Game[] {
  const backlog = backlogGames(games);
  if (spinOwnershipMaxPrice === undefined) return backlog;
  return backlog.filter((g) => isFullyOwned(g) || underPriceCap(g, spinOwnershipMaxPrice));
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

/** Picks one item at random from `items`, weighted by `weight(item)` - an item with twice the
 * weight of another is twice as likely to be picked, but every item has a real (if small) chance
 * as long as its weight is positive. Falls back to a uniform pick when every weight is zero (or
 * the list is empty, when it returns null instead). `random` defaults to Math.random but is
 * injectable for deterministic tests. */
export function weightedPick<T>(items: T[], weight: (item: T) => number, random: () => number): T | null {
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

// Long enough that even a heavily-nudged spin (see spinPhysics.ts's SPIN_MAX_VELOCITY) has real
// candidates left to travel through rather than looping back over the same handful almost
// immediately, short enough that a single-candidate room doesn't need an absurdly long array of
// copies of itself.
const SPIN_STRIP_LENGTH = 32;

/** Builds the circular, weighted "strip" of candidates a spin's physics (see spinPhysics.ts)
 * travels along - each of the `length` slots is an independent weighted draw (same odds as the
 * old single-shot pickSpinWinner: vote score, genre-diversity boost, review score - see
 * spinCandidateWeight), so a higher-weighted candidate simply occupies more of the strip and is
 * proportionally more likely to be wherever the spin happens to come to rest, rather than being
 * picked directly. Built once per spin (start, or "Spin again") and stored as-is (see
 * RoomSpin.stripGameIds) - every nudge afterward moves *along* this same strip, it doesn't rebuild
 * it. Falls back to a single-candidate strip (repeating the only option `length` times) rather
 * than an empty strip when there's nothing to choose between. */
export function buildSpinStrip(games: Game[], candidates: Game[], random: () => number = Math.random, length: number = SPIN_STRIP_LENGTH): Game[] {
  if (candidates.length === 0) return [];
  const avoided = avoidedGenres(games);
  const strip: Game[] = [];
  for (let i = 0; i < length; i++) {
    // weightedPick only returns null for an empty list, already excluded above.
    strip.push(weightedPick(candidates, (g) => spinCandidateWeight(g, avoided), random)!);
  }
  return strip;
}
