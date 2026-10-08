import { fitsInstallSize } from './installSize';
import { platformFamilyOf, withBackwardsCompatible, type Game, type RoomPlatform } from '@queueup/shared';
import { backlogComparator, type BacklogSortKey } from './backlogSort';
import {
  byScore,
  inTab,
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
import { t } from '../i18n';

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
    countLabel: n ? t(n === 1 ? 'home.votes.one' : 'home.votes.other', { n }) : t('home.votes.none'),
    myVote: g.myVote ?? 0,
  };
}

/** Issue #799's platform filter: can this game be played on `platform`? True when its platform label
 * names that system or one it plays through backwards compatibility (PS5 also shows PS4 games), or
 * the viewer marked it owned on that system. */
export function playsOn(g: Game, platform: RoomPlatform, includeOlder = true): boolean {
  const playable = includeOlder ? withBackwardsCompatible([platform]) : [platform];
  if (g.ownedPlatforms.some((p) => playable.includes(p))) return true;
  return g.platform.split(',').some((name) => {
    const family = platformFamilyOf(name.trim());
    return family !== null && playable.includes(family);
  });
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
export function buildHomeLists(
  allGames: Game[],
  opts: { isShelf: boolean; tabs: TabDef[]; tab: string; query: string; platform?: RoomPlatform | null; includeOlder?: boolean; backlogSort?: BacklogSortKey[]; maxInstallGb?: number; playNextIn?: 'playing' | 'backlog' },
): HomeLists {
  const { isShelf, tabs, tab, platform } = opts;
  const onPlatform = platform ? allGames.filter((g) => playsOn(g, platform, opts.includeOlder ?? true)) : allGames;
  // "Fits on my disk" (#1046): games with no known size stay.
  const games = opts.maxInstallGb ? onPlatform.filter((g) => fitsInstallSize(g, opts.maxInstallGb ?? 0)) : onPlatform;
  const q = opts.query.trim().toLowerCase();
  const comingTab = isShelf ? 'wishlist' : 'queue';
  const cur = tabs.find((t) => t.id === tab) ?? tabs[1] ?? tabs[0];
  const now = Date.now();

  const counts: Record<string, number> = {};
  for (const t of tabs) counts[t.id] = games.filter((g) => inTab(t, g)).length;

  const inCurrentTab = (g: Game) => (tab === 'playing' ? g.status === 'playing' : inTab(cur, g));
  const comingStatus = isShelf ? 'wishlist' : 'backlog';
  const isComing = (g: Game) => g.status === comingStatus && isComingSoon(g, now);

  let list = (q
    ? games.filter((g) => g.title.toLowerCase().includes(q))
    : games.filter((g) => inCurrentTab(g) && !(tab === comingTab && isComing(g)))
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

  // With Play next set to show in the Backlog / Queue (Shelf or Room settings), those games are pinned to its top.
  const pin = (g: Game) => (tab === 'queue' && opts.playNextIn === 'backlog' && g.status === 'play_next' ? 0 : 1);
  const newFirst = (a: Game, b: Game) => {
    const na = isNewRelease(a, now);
    const nb = isNewRelease(b, now);
    if (na !== nb) return na ? -1 : 1;
    if (na && nb) return (b.releaseDate ?? '').localeCompare(a.releaseDate ?? '');
    return byScore(a, b);
  };
  if (!q && isShelf && tab === 'queue') {
    // The shelf's Backlog follows the sort picked in Shelf settings (issue #798; default "Want to play").
    const bySort = backlogComparator(opts.backlogSort ?? [], now);
    list = [...list].sort((a, b) => pin(a) - pin(b) || bySort(a, b));
  } else if (!q && (tab === 'queue' || tab === 'playing')) {
    list = [...list].sort((a, b) => {
      if (pin(a) !== pin(b)) return pin(a) - pin(b);
      const na = isNewRelease(a, now);
      const nb = isNewRelease(b, now);
      if (na !== nb) return na ? -1 : 1;
      if (na && nb) return (b.releaseDate ?? '').localeCompare(a.releaseDate ?? '');
      return 0;
    });
  }

  const coming = q || tab !== comingTab ? [] : games.filter(isComing).sort((a, b) => (a.releaseDate ?? '').localeCompare(b.releaseDate ?? ''));
  const playNext = tab === 'playing' && !q ? games.filter((g) => (g.status === 'play_next' && opts.playNextIn !== 'backlog') || g.status === 'paused').sort(newFirst) : [];

  return { list, coming, playNext, counts, comingTab };
}
