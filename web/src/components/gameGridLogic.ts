import type { Game } from '@squadqueue/shared';

/** Sentinel meaning "no filter applied" for both the platform and genre pill filters. */
export const ALL_FILTER_VALUE = '__all__';

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

export function sortByScore(games: Game[]): Game[] {
  // Game.updatedAt only reflects status changes, not votes (votes have their own row/timestamp),
  // so ties break on createdAt (newest-added first) rather than a misleading "recently voted" signal.
  return [...games].sort((a, b) => {
    if (b.voteScore !== a.voteScore) return b.voteScore - a.voteScore;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}

/** Top-3 backlog games by current score. Games with no votes yet don't qualify — an unvoted game
 * badged "play next" would be misleading. */
export function playNextGames(games: Game[]): Game[] {
  return sortByScore(games.filter((g) => g.status === 'backlog' && g.voteScore > 0)).slice(0, 3);
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
 * the most recent completion has no genre data - shared by recommendedNextId (find one differing
 * pick) and the Spin the Wheel weighting (favor picks that differ). */
export function lastCompletedPrimaryGenre(games: Game[]): string | null {
  const completed = games.filter((g) => g.status === 'done');
  if (completed.length === 0) return null;

  const lastCompleted = completed.reduce((latest, g) =>
    new Date(g.updatedAt).getTime() > new Date(latest.updatedAt).getTime() ? g : latest,
  );
  return primaryGenre(lastCompleted.genre);
}

/** Among the current Play Next picks, the highest-scored one whose primary genre differs from the
 * most-recently-completed game's — e.g. last completed was a shooter, play-next top-3 are
 * shooter/shooter/puzzle, recommend the puzzle one. No recommendation if nothing's been completed
 * yet, the last completed game has no genre data, or every play-next pick shares its primary genre. */
export function recommendedNextId(games: Game[], candidates: Game[]): string | null {
  const lastPrimary = lastCompletedPrimaryGenre(games);
  if (!lastPrimary) return null;

  const differing = candidates.find((g) => {
    const primary = primaryGenre(g.genre);
    return primary !== null && primary !== lastPrimary;
  });
  return differing?.id ?? null;
}

/** Currently Playing first, then Play Next-tagged backlog, then the rest of the backlog, then
 * Completed last. */
export function statusBucket(game: Game, playNext: Set<string>): number {
  if (game.status === 'playing') return 0;
  if (game.status === 'backlog' && playNext.has(game.id)) return 1;
  if (game.status === 'backlog') return 2;
  return 3; // done
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

/** Picks one game at random from `candidates`, weighted by vote score - a game with twice the
 * score of another is twice as likely to be picked, but every candidate has a real (if small)
 * chance, so a tie-breaker doesn't feel rigged toward whatever's already winning. */
export function pickWeightedRandom(candidates: Game[], random: () => number = Math.random): Game | null {
  return weightedPick(candidates, (g) => g.voteScore, random);
}

// A Spin the Wheel candidate whose primary genre differs from the last-completed game's gets its
// vote-score weight multiplied by this - nudges the spin toward variety (the same "don't repeat
// what you just played" idea as recommendedNextId) without ever fully overriding the vote signal:
// a heavily-voted same-genre pick can still win, just less often than it otherwise would.
const GENRE_DIVERSITY_MULTIPLIER = 2;

/** A candidate's effective Spin the Wheel weight: its vote score, boosted for genre variety
 * against the last completed game. Exported mainly for testing - callers should use
 * pickSpinWinner. */
export function spinCandidateWeight(game: Game, lastPrimaryGenre: string | null): number {
  const primary = primaryGenre(game.genre);
  const differsFromLastCompleted = lastPrimaryGenre !== null && primary !== null && primary !== lastPrimaryGenre;
  return game.voteScore * (differsFromLastCompleted ? GENRE_DIVERSITY_MULTIPLIER : 1);
}

/** Spin the Wheel's actual pick: weighted like pickWeightedRandom, but with each candidate's vote
 * score boosted for differing from the genre of the game most recently marked Done - so the wheel
 * nudges toward variety instead of just repeating whatever genre you already just finished. */
export function pickSpinWinner(games: Game[], candidates: Game[], random: () => number = Math.random): Game | null {
  const lastPrimary = lastCompletedPrimaryGenre(games);
  return weightedPick(candidates, (g) => spinCandidateWeight(g, lastPrimary), random);
}
