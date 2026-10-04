import type { Game, GameStatus, VoteValue } from '@queueup/shared';
import { t, type MessageKey } from '../i18n';
import { liveMap, reviewScoreLabel, statusDesc, statusLabel } from '../i18n/labels';
import { formatAmount } from '../utils/formatPrice';

// ---------------------------------------------------------------------------------------------
// Scales and labels (straight from the design handoff)
// ---------------------------------------------------------------------------------------------

const VOTE_EMOJI: Record<VoteValue, string> = { 1: '😴', 2: '🙂', 3: '😃', 4: '🤩', 5: '🔥' };
/** Each vote's emoji and (translated) word: Meh, Sure, Keen, Hyped, Must. */
export const VOTES = new Proxy({} as Record<VoteValue, { e: string; l: string }>, {
  get: (_target, key) => {
    const v = Number(key) as VoteValue;
    return VOTE_EMOJI[v] ? { e: VOTE_EMOJI[v], l: t(`labels.vote.${v}` as MessageKey) } : undefined;
  },
});
export const VOTE_VALUES: VoteValue[] = [1, 2, 3, 4, 5];

const REVIEW_FACES: Record<number, string> = { 1: '😖', 2: '😕', 3: '😐', 4: '😊', 5: '😍' };
/** Each review score's face and (translated) word: Poor, Meh, OK, Good, Great. */
export const REVIEW_EMOJI = new Proxy({} as Record<number, { e: string; l: string }>, {
  get: (_target, key) => {
    const n = Number(key);
    return REVIEW_FACES[n] ? { e: REVIEW_FACES[n], l: reviewScoreLabel(n) } : undefined;
  },
});

/** Every status, in the order the status pickers list them. */
export const STATUS_ORDER: GameStatus[] = ['wishlist', 'backlog', 'play_next', 'paused', 'playing', 'done', 'replay', 'dropped', 'wont_play'];

/** Each status's (translated) label. */
export const STATUS_LABEL: Record<GameStatus, string> = liveMap(statusLabel);

/** One line on what each status means (translated). */
export const STATUS_DESC: Record<GameStatus, string> = liveMap(statusDesc);

const NEXT_ACTION_KEYS: Record<GameStatus, [GameStatus, MessageKey][]> = {
  wishlist: [['backlog', 'home.next.moveToBacklog'], ['playing', 'home.next.startPlaying']],
  backlog: [['playing', 'home.next.startPlaying'], ['play_next', 'home.next.playNext']],
  play_next: [['playing', 'home.next.startPlaying'], ['backlog', 'home.next.backToBacklog']],
  paused: [['playing', 'home.next.resume'], ['dropped', 'home.next.dropIt']],
  playing: [['done', 'home.next.markBeaten'], ['paused', 'home.next.pauseIt'], ['dropped', 'home.next.dropIt']],
  done: [['replay', 'home.next.replayIt']],
  replay: [['done', 'home.next.beatenAgain'], ['dropped', 'home.next.dropReplay']],
  dropped: [['playing', 'home.next.pickBackUp'], ['backlog', 'home.next.backToBacklog']],
  wont_play: [['backlog', 'home.next.backToBacklog']],
};

/** What the status card offers as the next step from each status (labels translated when read). */
export const NEXT_ACTIONS = new Proxy({} as Record<GameStatus, [GameStatus, string][]>, {
  get: (_target, key) => NEXT_ACTION_KEYS[key as GameStatus]?.map(([s, k]) => [s, t(k)] as [GameStatus, string]),
});

export interface TabDef {
  id: string;
  label: string;
  statuses: GameStatus[];
}

/** A tab whose label is looked up (in the current language) each time it's read. */
const tabDef = (id: string, key: MessageKey, statuses: GameStatus[]): TabDef => ({
  id,
  get label() {
    return t(key);
  },
  statuses,
});

export const ROOM_TABS: TabDef[] = [
  tabDef('queue', 'home.tab.queue', ['backlog']),
  tabDef('playing', 'home.tab.playing', ['playing', 'play_next', 'paused']),
  tabDef('beaten', 'home.tab.beaten', ['done', 'replay']),
  tabDef('dropped', 'home.tab.dropped', ['dropped', 'wont_play']),
];

export const SHELF_TABS: TabDef[] = [
  tabDef('wishlist', 'home.tab.wishlist', ['wishlist']),
  tabDef('queue', 'home.tab.backlog', ['backlog']),
  tabDef('playing', 'home.tab.playing', ['playing', 'play_next', 'paused']),
  tabDef('replay', 'home.tab.replay', ['replay']),
];

/** Shelf filters tucked behind the "+" button: game lists by status, plus two lists of synced titles
 * that never became games (they have no status, see HomeView's PendingImportsList). */
export const SHELF_MORE_TABS: TabDef[] = [
  tabDef('beaten', 'home.tab.beaten', ['done']),
  tabDef('paused', 'home.tab.paused', ['paused']),
  tabDef('dropped', 'home.tab.dropped', ['dropped']),
  tabDef('wont_play', 'home.tab.wontPlay', ['wont_play']),
];
export const SHELF_IMPORT_TABS = [
  {
    id: 'matching',
    get label() {
      return t('home.tab.matching');
    },
  },
  {
    id: 'dismissed',
    get label() {
      return t('home.tab.dismissed');
    },
  },
] as const;

// ---------------------------------------------------------------------------------------------
// Derived per-game values
// ---------------------------------------------------------------------------------------------

/** Score = sum of (vote - 2): a "Sure" is neutral, "Meh" counts against, the rest count for. */
export function gameScore(g: Game): number {
  return g.votes.reduce((sum, v) => sum + (v.value - 2), 0);
}

export function voteCount(g: Game): number {
  return g.votes.length;
}

export const byScore = (a: Game, b: Game) => gameScore(b) - gameScore(a) || a.title.localeCompare(b.title);

const DAY = 864e5;
const NEW_WINDOW_DAYS = 60;

/** Released within the last 60 days. */
export function isNewRelease(g: Game, now: number = Date.now()): boolean {
  if (!g.releaseDate) return false;
  const t = new Date(g.releaseDate).getTime();
  return t <= now && (now - t) / DAY <= NEW_WINDOW_DAYS;
}

export function isUpcoming(g: Game, now: number = Date.now()): boolean {
  return !!g.releaseDate && new Date(g.releaseDate).getTime() > now;
}

const COMING_SOON_DAYS = 30;

/** Releasing within the next 30 days (the "Coming soon" strip's window). */
export function isComingSoon(g: Game, now: number = Date.now()): boolean {
  if (!g.releaseDate) return false;
  const t = new Date(g.releaseDate).getTime();
  return t > now && (t - now) / DAY <= COMING_SOON_DAYS;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function shortDate(d: string | Date): string {
  const x = typeof d === 'string' ? new Date(d) : d;
  return `${MONTHS[x.getMonth()]} ${x.getDate()}`;
}

/** shortDate for a release date: read in UTC, as stored (see releaseLabel). */
export function releaseShortDate(d: string): string {
  const x = new Date(d);
  return `${MONTHS[x.getUTCMonth()]} ${x.getUTCDate()}`;
}

export function monthYear(d: string | Date): string {
  const x = typeof d === 'string' ? new Date(d) : d;
  return `${MONTHS[x.getMonth()]} ${x.getFullYear()}`;
}

/** "Mar 2027" style label for an upcoming game's release. */
export function releaseLabel(g: Game): string {
  if (g.releaseDate) {
    // Read in UTC, as stored - same reason as releaseDateLabel below: local time slips a midnight-UTC
    // release to the previous day (and a 1 January release to the previous year) west of UTC.
    const d = new Date(g.releaseDate);
    return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
  }
  return g.releaseYear ? String(g.releaseYear) : t('home.release.tba');
}

export function fmtMoney(amount: string | number | null | undefined, currency: string | null | undefined): string {
  if (amount === null || amount === undefined || amount === '') return '';
  const n = Number(amount);
  if (n === 0) return t('home.price.free');
  return formatAmount(String(amount), currency ?? 'USD');
}

export function priceOf(g: Game): string {
  return g.price.amount ? fmtMoney(g.price.amount, g.price.currency) : '';
}

/** What the price column shows: "Owned" in mint, else the live price, else the manual fallback. */
export function priceLabel(g: Game): { label: string; owned: boolean } {
  if (g.youOwn) return { label: t('home.price.owned'), owned: true };
  if (g.price.amount) return { label: fmtMoney(g.price.amount, g.price.currency), owned: false };
  if (g.manualPrice) return { label: fmtMoney(g.manualPrice, g.price.currency), owned: false };
  return { label: t('home.price.none'), owned: false };
}

/** How far (whole %) the current price sits above the all-time low (issue #797), 0 at the low.
 * Null when either is missing or free - "100% above Free" says nothing useful. */
export function pctAboveLow(amount: string | null, low: string | null): number | null {
  const now = Number(amount);
  const min = Number(low);
  if (!amount || !low || !(now > 0) || !(min > 0)) return null;
  return Math.max(0, Math.round(((now - min) / min) * 100));
}

export function hasLivePrice(g: Game): boolean {
  return !!g.price.amount;
}

export function ttbLabel(g: Game): string {
  return g.timeToBeatHours ? t('home.ttb', { hours: g.timeToBeatHours }) : '';
}

/** "Genre · ~12h" meta line, skipping whichever half is missing. */
export function metaLine(g: Game): string {
  return [g.genre?.split(',')[0]?.trim() || '', g.releaseYear ? String(g.releaseYear) : '', ttbLabel(g)].filter(Boolean).join(' · ');
}

/** "Released 12 Mar 2020" / "Releases 3 Nov 2026" for the game card; just the year when only that is
 * known, and '' when there's nothing. Dates are shown as stored (UTC) so a midnight release doesn't
 * slip to the previous day in timezones behind UTC. */
export function releaseDateLabel(g: Pick<Game, 'releaseDate' | 'releaseYear'>, now: number = Date.now()): string {
  if (g.releaseDate) {
    const d = new Date(g.releaseDate);
    if (!Number.isNaN(d.getTime())) {
      const text = d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
      return t(d.getTime() > now ? 'home.release.releases' : 'home.release.released', { date: text });
    }
  }
  return g.releaseYear ? t('home.release.released', { date: g.releaseYear }) : '';
}

export function ownLabel(g: Game, isShelf: boolean): string {
  if (isShelf || !g.ownership) return '';
  return t('home.ownCount', { owned: g.ownership.owned, total: g.ownership.total });
}

/** The chip shown beside a row's title (New / Replay since / After / Target...). */
export function rowChip(
  g: Game,
  ctx: { tab: string; searching: boolean; prereqTitle: string | null; now?: number },
): string {
  const now = ctx.now ?? Date.now();
  if (ctx.prereqTitle) return t('home.chip.after', { title: ctx.prereqTitle });
  if (g.targetPrice && g.status === 'wishlist') {
    const atTarget = g.price.amount && Number(g.price.amount) <= Number(g.targetPrice);
    return t(atTarget ? 'home.chip.atTarget' : 'home.chip.target', { price: fmtMoney(g.targetPrice, g.price.currency) });
  }
  if (!ctx.searching && (ctx.tab === 'queue' || ctx.tab === 'playing') && isNewRelease(g, now) && g.releaseDate) {
    return t('home.chip.new', { date: releaseShortDate(g.releaseDate) });
  }
  if (!ctx.searching && (ctx.tab === 'replay' || ctx.tab === 'beaten') && g.status === 'replay' && g.replayedAt) {
    return t('home.chip.replaySince', { date: shortDate(g.replayedAt) });
  }
  // Search results span every status, so say which one each game is in.
  if (ctx.searching) return STATUS_LABEL[g.status];
  if (['wishlist', 'play_next', 'paused', 'replay', 'wont_play'].includes(g.status)) return STATUS_LABEL[g.status];
  return '';
}

/** Whether a game's "Play after" prerequisite is still waiting to be beaten. */
export function prereqGame(g: Game, all: Game[]): Game | null {
  if (!g.prerequisiteGameId) return null;
  const p = all.find((x) => x.id === g.prerequisiteGameId);
  if (!p) return null;
  return p.status === 'done' || p.status === 'replay' ? null : p;
}

export function coverUrlOf(g: Game): string | null {
  return g.coverImageUrl;
}

/** Average of the scored review categories, or null when there are none. */
export function reviewAverage(r: { art: number | null; gameplay: number | null; story: number | null; sound: number | null }): number | null {
  const vals = [r.art, r.gameplay, r.story, r.sound].filter((v): v is number => v !== null);
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
}
