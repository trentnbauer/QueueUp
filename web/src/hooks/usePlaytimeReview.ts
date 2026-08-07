import { useMemo, useState } from 'react';
import type { Game } from '@queueup/shared';
import { computePlaytimeReviewCandidates } from '@queueup/shared';

const SEEN_KEY = 'playtimeReviewSeenMinutes';

type SeenMinutes = Record<string, number>;

function loadSeen(): SeenMinutes | null {
  const raw = localStorage.getItem(SEEN_KEY);
  if (raw === null) return null;
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function saveSeen(seen: SeenMinutes) {
  localStorage.setItem(SEEN_KEY, JSON.stringify(seen));
}

/** Batch "review your played games" prompt (issue #548), mirroring useChangelog's seen-set-in-
 * localStorage pattern but with different first-visit semantics: a true first sync (no seen-map
 * yet at all) surfaces every currently-tracked game rather than baselining silently, since unlike
 * a changelog there's no backlog of project history to spare a new user from - the moment
 * QueueUp knows anything about someone's played games, that's itself worth showing them. Every
 * later mount only surfaces a game whose total playtime rose since it was last shown (see
 * computePlaytimeReviewCandidates). `games` should be the caller's Personal Shelf list -
 * currentPlaytimeMinutes is null for anything else (see its doc comment on Game). */
export function usePlaytimeReview(games: Game[]) {
  // Read once per mount as the initial value, then kept in state (not re-read from localStorage
  // on every render) - markReviewed below updates this in memory at the same time it persists, so
  // `entries` immediately reflects a dismissal (shrinking to exclude what was just shown) instead
  // of staying stale and reopening the dialog on the very next render.
  const [seen, setSeen] = useState(loadSeen);

  const entries = useMemo(() => {
    const candidates = computePlaytimeReviewCandidates(games, seen);
    const byId = new Map(games.map((g) => [g.id, g]));
    return candidates
      .map((c) => ({ game: byId.get(c.gameId), currentMinutes: c.currentMinutes }))
      .filter((e): e is { game: Game; currentMinutes: number } => e.game !== undefined);
  }, [games, seen]);

  function markReviewed() {
    const next: SeenMinutes = { ...(seen ?? {}) };
    for (const entry of entries) {
      next[entry.game.id] = entry.currentMinutes;
    }
    saveSeen(next);
    setSeen(next);
  }

  return { entries, markReviewed };
}
