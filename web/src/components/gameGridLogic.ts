import type { Game } from '@squadqueue/shared';

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

/** Among the current Play Next picks, the highest-scored one whose primary genre differs from the
 * most-recently-completed game's — e.g. last completed was a shooter, play-next top-3 are
 * shooter/shooter/puzzle, recommend the puzzle one. No recommendation if nothing's been completed
 * yet, the last completed game has no genre data, or every play-next pick shares its primary genre. */
export function recommendedNextId(games: Game[], candidates: Game[]): string | null {
  const completed = games.filter((g) => g.status === 'done');
  if (completed.length === 0) return null;

  const lastCompleted = completed.reduce((latest, g) =>
    new Date(g.updatedAt).getTime() > new Date(latest.updatedAt).getTime() ? g : latest,
  );
  const lastPrimary = primaryGenre(lastCompleted.genre);
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
