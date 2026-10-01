import type { Game } from '@queueup/shared';
import {
  byScore,
  gameScore,
  isNewRelease,
  isComingSoon,
  metaLine,
  ownLabel,
  prereqGame,
  priceLabel,
  rowChip,
  voteCount,
  type TabDef,
} from '../lib/gameView';

/** A game shaped for a list row / cover card. */
export interface RowItem {
  game: Game;
  rank: number;
  chip: string;
  meta: string;
  priceLabel: string;
  priceOwned: boolean;
  ownSub: string;
  score: number;
  votes: number;
  scoreLabel: string;
  scoreHot: boolean;
  countLabel: string;
  myVote: number;
}

export function toRowItem(g: Game, rank: number, ctx: { isShelf: boolean; tab: string; searching: boolean; all: Game[] }): RowItem {
  const pl = priceLabel(g);
  const score = gameScore(g);
  const n = voteCount(g);
  const pq = prereqGame(g, ctx.all);
  return {
    game: g,
    rank,
    chip: rowChip(g, { tab: ctx.tab, searching: ctx.searching, prereqTitle: pq ? pq.title : null }),
    meta: metaLine(g),
    priceLabel: pl.label,
    priceOwned: pl.owned,
    ownSub: ownLabel(g, ctx.isShelf),
    score,
    votes: n,
    scoreLabel: n ? `${score >= 0 ? '+' : ''}${score}` : '—',
    scoreHot: n > 0 && score > 0,
    countLabel: n ? `${n} ${n === 1 ? 'vote' : 'votes'}` : 'no votes',
    myVote: g.myVote ?? 0,
  };
}

export interface HomeLists {
  list: Game[];
  coming: Game[];
  playNext: Game[];
  counts: Record<string, number>;
  comingTab: string;
}

/** Everything the home screen lists, straight from the design's rules:
 * - Queue/Playing (and Play Next): games released in the last 60 days go first, newest first.
 * - Replay (and replays inside a room's Beaten tab) sort oldest replay first, dateless last.
 * - Games releasing within the next 30 days sit in a "Coming soon" strip on the Wishlist (shelf) / Queue (room) tab
 *   instead of the main list. */
export function buildHomeLists(games: Game[], opts: { isShelf: boolean; tabs: TabDef[]; tab: string; query: string }): HomeLists {
  const { isShelf, tabs, tab } = opts;
  const q = opts.query.trim().toLowerCase();
  const comingTab = isShelf ? 'wishlist' : 'queue';
  const cur = tabs.find((t) => t.id === tab) ?? tabs[1] ?? tabs[0];
  const now = Date.now();

  const counts: Record<string, number> = {};
  for (const t of tabs) counts[t.id] = games.filter((g) => t.statuses.includes(g.status)).length;

  const tabStatuses = tab === 'playing' ? ['playing'] : cur.statuses;
  const comingStatus = isShelf ? 'wishlist' : 'backlog';
  const isComing = (g: Game) => g.status === comingStatus && isComingSoon(g, now);

  let list = (q
    ? games.filter((g) => g.title.toLowerCase().includes(q))
    : games.filter((g) => tabStatuses.includes(g.status) && !(tab === comingTab && isComing(g)))
  ).sort(byScore);

  if ((tab === 'replay' || tab === 'beaten') && !q) {
    const ra = (g: Game) => g.replayedAt ?? '9999';
    list = [...list].sort((a, b) => {
      const ar = a.status === 'replay';
      const br = b.status === 'replay';
      if (ar !== br) return ar ? 1 : -1;
      return ar ? ra(a).localeCompare(ra(b)) : 0;
    });
  }

  const newFirst = (a: Game, b: Game) => {
    const na = isNewRelease(a, now);
    const nb = isNewRelease(b, now);
    if (na !== nb) return na ? -1 : 1;
    if (na && nb) return (b.releaseDate ?? '').localeCompare(a.releaseDate ?? '');
    return byScore(a, b);
  };
  if (!q && (tab === 'queue' || tab === 'playing')) {
    list = [...list].sort((a, b) => {
      const na = isNewRelease(a, now);
      const nb = isNewRelease(b, now);
      if (na !== nb) return na ? -1 : 1;
      if (na && nb) return (b.releaseDate ?? '').localeCompare(a.releaseDate ?? '');
      return 0;
    });
  }

  const coming = q || tab !== comingTab ? [] : games.filter(isComing).sort((a, b) => (a.releaseDate ?? '').localeCompare(b.releaseDate ?? ''));
  const playNext = tab === 'playing' && !q ? games.filter((g) => g.status === 'play_next').sort(newFirst) : [];

  return { list, coming, playNext, counts, comingTab };
}
