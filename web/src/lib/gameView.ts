import type { Game, GameStatus, VoteValue } from '@queueup/shared';
import { formatAmount } from '../utils/formatPrice';

// ---------------------------------------------------------------------------------------------
// Scales and labels (straight from the design handoff)
// ---------------------------------------------------------------------------------------------

export const VOTES: Record<VoteValue, { e: string; l: string }> = {
  1: { e: '😴', l: 'Meh' },
  2: { e: '🙂', l: 'Sure' },
  3: { e: '😃', l: 'Keen' },
  4: { e: '🤩', l: 'Hyped' },
  5: { e: '🔥', l: 'Must' },
};
export const VOTE_VALUES: VoteValue[] = [1, 2, 3, 4, 5];

export const REVIEW_EMOJI: Record<number, { e: string; l: string }> = {
  1: { e: '😖', l: 'Poor' },
  2: { e: '😕', l: 'Meh' },
  3: { e: '😐', l: 'OK' },
  4: { e: '😊', l: 'Good' },
  5: { e: '😍', l: 'Great' },
};

export const STATUS_OPTIONS: [GameStatus, string][] = [
  ['wishlist', 'Wishlist'],
  ['backlog', 'Backlog'],
  ['play_next', 'Play Next'],
  ['paused', '⏸️ Paused'],
  ['playing', 'Playing'],
  ['done', 'Beaten'],
  ['replay', '🔄 Replay'],
  ['dropped', 'Dropped'],
  ['wont_play', "Won't Play"],
];

export const STATUS_LABEL: Record<GameStatus, string> = Object.fromEntries(STATUS_OPTIONS) as Record<GameStatus, string>;

export const STATUS_DESC: Record<GameStatus, string> = {
  wishlist: "Want it, don't own it yet",
  backlog: "Own it, haven't started",
  play_next: "Up after what you're playing",
  paused: 'On hold, coming back to it',
  playing: 'In progress now',
  done: 'Finished it',
  replay: 'Going back for another run',
  dropped: 'Stopped, not coming back',
  wont_play: 'Never going to play it',
};

/** What the status card offers as the next step from each status. */
export const NEXT_ACTIONS: Record<GameStatus, [GameStatus, string][]> = {
  wishlist: [['backlog', 'Move to Backlog'], ['playing', 'Start playing']],
  backlog: [['playing', 'Start playing'], ['play_next', 'Play next']],
  play_next: [['playing', 'Start playing'], ['backlog', 'Back to Backlog']],
  paused: [['playing', 'Resume'], ['dropped', 'Drop it']],
  playing: [['done', 'Mark Beaten'], ['paused', 'Pause it'], ['dropped', 'Drop it']],
  done: [['replay', 'Replay it']],
  replay: [['done', 'Beaten again'], ['dropped', 'Drop replay']],
  dropped: [['playing', 'Pick back up'], ['backlog', 'Back to Backlog']],
  wont_play: [['backlog', 'Back to Backlog']],
};

export interface TabDef {
  id: string;
  label: string;
  statuses: GameStatus[];
}

export const ROOM_TABS: TabDef[] = [
  { id: 'queue', label: 'Queue', statuses: ['backlog'] },
  { id: 'playing', label: 'Playing', statuses: ['playing', 'play_next', 'paused'] },
  { id: 'beaten', label: 'Beaten', statuses: ['done', 'replay'] },
  { id: 'dropped', label: 'Dropped', statuses: ['dropped', 'wont_play'] },
];

export const SHELF_TABS: TabDef[] = [
  { id: 'wishlist', label: 'Wishlist', statuses: ['wishlist'] },
  { id: 'queue', label: 'Backlog', statuses: ['backlog'] },
  { id: 'playing', label: 'Playing', statuses: ['playing', 'play_next', 'paused'] },
  { id: 'beaten', label: 'Beaten', statuses: ['done'] },
  { id: 'replay', label: 'Replay', statuses: ['replay'] },
];

/** Shelf filters tucked behind the "+" button: game lists by status, plus two lists of synced titles
 * that never became games (they have no status, see HomeView's PendingImportsList). */
export const SHELF_MORE_TABS: TabDef[] = [
  { id: 'dropped', label: 'Dropped', statuses: ['dropped'] },
  { id: 'wont_play', label: "Won't play", statuses: ['wont_play'] },
];
export const SHELF_IMPORT_TABS = [
  { id: 'matching', label: 'Needs matching' },
  { id: 'dismissed', label: 'Dismissed' },
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

export function monthYear(d: string | Date): string {
  const x = typeof d === 'string' ? new Date(d) : d;
  return `${MONTHS[x.getMonth()]} ${x.getFullYear()}`;
}

/** "Mar 2027" style label for an upcoming game's release. */
export function releaseLabel(g: Game): string {
  if (g.releaseDate) return shortDate(g.releaseDate) + ', ' + new Date(g.releaseDate).getFullYear();
  return g.releaseYear ? String(g.releaseYear) : 'TBA';
}

export function fmtMoney(amount: string | number | null | undefined, currency: string | null | undefined): string {
  if (amount === null || amount === undefined || amount === '') return '';
  const n = Number(amount);
  if (n === 0) return 'Free';
  return formatAmount(String(amount), currency ?? 'USD');
}

export function priceOf(g: Game): string {
  return g.price.amount ? fmtMoney(g.price.amount, g.price.currency) : '';
}

/** What the price column shows: "Owned" in mint, else the live price, else the manual fallback. */
export function priceLabel(g: Game): { label: string; owned: boolean } {
  if (g.youOwn) return { label: 'Owned', owned: true };
  if (g.price.amount) return { label: fmtMoney(g.price.amount, g.price.currency), owned: false };
  if (g.manualPrice) return { label: fmtMoney(g.manualPrice, g.price.currency), owned: false };
  return { label: 'No price yet', owned: false };
}

export function hasLivePrice(g: Game): boolean {
  return !!g.price.amount;
}

export function ttbLabel(g: Game): string {
  return g.timeToBeatHours ? `~${g.timeToBeatHours}h` : '';
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
      return `${d.getTime() > now ? 'Releases' : 'Released'} ${text}`;
    }
  }
  return g.releaseYear ? `Released ${g.releaseYear}` : '';
}

export function ownLabel(g: Game, isShelf: boolean): string {
  if (isShelf || !g.ownership) return '';
  return `${g.ownership.owned}/${g.ownership.total} own it`;
}

/** The chip shown beside a row's title (New / Replay since / After / Target...). */
export function rowChip(
  g: Game,
  ctx: { tab: string; searching: boolean; prereqTitle: string | null; now?: number },
): string {
  const now = ctx.now ?? Date.now();
  if (ctx.prereqTitle) return `After ${ctx.prereqTitle}`;
  if (g.targetPrice && g.status === 'wishlist') {
    const atTarget = g.price.amount && Number(g.price.amount) <= Number(g.targetPrice);
    return `${atTarget ? 'At target' : 'Target'} ${fmtMoney(g.targetPrice, g.price.currency)}`;
  }
  if (!ctx.searching && (ctx.tab === 'queue' || ctx.tab === 'playing') && isNewRelease(g, now) && g.releaseDate) {
    return `New · out ${shortDate(g.releaseDate)}`;
  }
  if (!ctx.searching && (ctx.tab === 'replay' || ctx.tab === 'beaten') && g.status === 'replay' && g.replayedAt) {
    return `Replay since ${shortDate(g.replayedAt)}`;
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
