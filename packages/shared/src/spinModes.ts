/** Spin modes other than the reel (see SpinWheelTheme): a three-card vote, hold-and-respin slots, a
 * knockout, plinko, a ban draft, a prize wheel, a claw machine and match three.
 *
 * Each mode is a small state machine, kept as JSON on the room's RoomSpin row (`modeState`). The
 * server is the only thing that ever draws a random number: it deals, rolls and breaks ties here,
 * and every member's client just renders the state it polls. Everything is timestamped (epoch ms,
 * server clock) so every viewer animates the same thing at the same moment.
 *
 * Lifecycle:
 * - `start`: pendingPlay() stores the weighted pool. Nothing is dealt yet, because turn-based modes
 *   need to know who's playing, and that's only settled once the waiting room closes.
 * - `advancePlay()` (called on every poll and action): once the waiting room has closed it deals
 *   (beginPlay) with the members who were ready, then runs any timers that have run out - closing
 *   a vote, auto-acting for someone who let their turn time out, the next knockout round - so a
 *   round never stalls on someone who wandered off.
 * - `applyPlayAction()`: a member's vote / stake / ban / shield / claw drop / tile flip.
 * - `winnerId` + `revealAt` once decided; the result shows from `revealAt` (after the animation). */

import type { ConcreteSpinWheelTheme } from './types.js';

/** A game in a mode's pool and its Spin the Wheel weight (spinCandidateWeight). */
export interface ModeCandidate {
  gameId: string;
  weight: number;
}

type Rng = () => number;

/** The tuning the design hands off as defaults. */
export const SPIN_MODE_SETTINGS = {
  /** Three-card vote and chip-stake plinko: seconds to vote / stake. */
  voteSeconds: 10,
  /** Chip-stake plinko: how much one chip adds to a bin's weight. */
  chipWeight: 1.5,
  /** Hold & respin slots: respins before the best line wins. */
  respinLimit: 5,
  /** Knockout: each member gets one shield. */
  shields: true,
} as const;

// ---- Timings (ms). The screens use the same numbers to animate. ----
export const ROULETTE_SPIN_MS = 5200;
export const PLINKO_ROWS = 7;
export const PLINKO_SEGMENT_MS = 170;
/** Lead-in before a plinko chip starts falling, and how long the fall takes in total. */
export const PLINKO_DROP_DELAY_MS = 500;
export const PLINKO_FALL_MS = (PLINKO_ROWS + 1) * PLINKO_SEGMENT_MS;
export const PLINKO_STAKE_GRACE_MS = 1200;
export const CARD_DEAL_MS = 1300;
export const CARD_VOTE_GRACE_MS = 600;
export const SLOT_FIRST_STOP_MS = 1200;
export const SLOT_STOP_GAP_MS = 450;
export const SLOT_RESPIN_PAUSE_MS = 1100;
export const KNOCKOUT_FIRST_ROUND_DELAY_MS = 2500;
export const KNOCKOUT_PAUSE_MS = 1000;
export const BAN_TURN_MS = 15_000;
export const CLAW_TURN_MS = 12_000;
export const CLAW_TRIES = 3;
export const MATCH_TURN_MS = 10_000;
export const MATCH_TILES = 12;
/** Pause between the last move and the result appearing, so the final animation can finish. */
const REVEAL_PAD_MS = 700;

// ---- Claw machine geometry (the 644x372 board in the design). ----
export const CLAW_BOARD = { width: 644, height: 372 };
export const CLAW_RAIL_MIN = 140;
export const CLAW_RAIL_MAX = 612;
export const CLAW_SPEED = 230; // px/s
export const CLAW_ITEM_COUNT = 6;
export const CLAW_ITEM_WIDTH = 76;
/** Left edge of claw item `i`. */
export const clawItemLeft = (i: number) => 128 + i * 84;
export const clawItemCenter = (i: number) => clawItemLeft(i) + CLAW_ITEM_WIDTH / 2;
export const CLAW_REACH = 32;
/** Drop (0.9s) + close (0.25s), then carry to the chute and fall, or lift and slip. */
export const CLAW_DOWN_MS = 900;
export const CLAW_CLOSE_MS = 250;
export const CLAW_CARRY_MS = 1100;
export const CLAW_FALL_MS = 450;
export const CLAW_SLIP_MS = 800;
export const CLAW_TURN_GAP_MS = 500;
export const clawAnimMs = (success: boolean) => CLAW_DOWN_MS + CLAW_CLOSE_MS + (success ? CLAW_CARRY_MS + CLAW_FALL_MS : CLAW_SLIP_MS);
/** How far back a claw drop may be matched to where the player saw the claw (their round trip). */
export const CLAW_DROP_SLACK_MS = 800;
/** Before the claw starts sweeping on a new turn. */
export const CLAW_LEAD_MS = 400;

/** Where the claw is along the rail `t` ms into a turn: back and forth at CLAW_SPEED. */
export function clawXAt(turnStartedAt: number, t: number): number {
  const elapsed = Math.max(0, t - turnStartedAt - CLAW_LEAD_MS) / 1000;
  const span = CLAW_RAIL_MAX - CLAW_RAIL_MIN;
  const d = (elapsed * CLAW_SPEED) % (2 * span);
  return CLAW_RAIL_MIN + (d <= span ? d : 2 * span - d);
}

/** The item index under the claw at `x`, or null. */
export function clawItemUnder(x: number, count: number): number | null {
  for (let i = 0; i < count; i++) if (Math.abs(clawItemCenter(i) - x) <= CLAW_REACH) return i;
  return null;
}

// ---- State ----

interface PlayBase {
  /** When the round began (the waiting room closed). */
  startAt: number;
  /** Members playing, in turn order: whoever was ready when the waiting room closed. */
  participants: string[];
  winnerId: string | null;
  /** When the result should show (after the final animation). Null until decided. */
  revealAt: number | null;
  /** Mode-specific result line, e.g. "TIED · WEIGHTED DRAW BROKE IT". Null for the default. */
  kicker: string | null;
}

export interface CardVotePlay extends PlayBase {
  mode: 'card_vote';
  cards: ModeCandidate[];
  /** userId -> card index. */
  votes: Record<string, number>;
  closesAt: number;
  closed: boolean;
}

export interface SlotSpin {
  /** Game id on each of the three reels once it stops. */
  reels: [string, string, string];
  /** Reels held from the previous spin (they don't move). */
  held: [boolean, boolean, boolean];
  at: number;
}
export interface SlotPlay extends PlayBase {
  mode: 'slot';
  symbols: ModeCandidate[];
  spins: SlotSpin[];
  respinLimit: number;
}

export interface KnockoutRound {
  at: number;
  /** Cards the highlight skips across, ending on `hit`. */
  hops: string[];
  hit: string;
  /** True when a shield saved `hit`: nothing goes out this round. */
  blocked: boolean;
  /** Member whose shield blocked it. */
  blockedBy: string | null;
}
export interface KnockoutPlay extends PlayBase {
  mode: 'knockout';
  cards: ModeCandidate[];
  rounds: KnockoutRound[];
  /** userId -> game it's shielding (unused shields only). */
  shields: Record<string, string>;
  /** Members whose shield has been used up. */
  usedShields: string[];
  shieldsOn: boolean;
  nextRoundAt: number | null;
}

export interface PlinkoPlay extends PlayBase {
  mode: 'plinko';
  bins: ModeCandidate[];
  /** Fractions (0..1) across the board: drop point, one per peg row, then the bin's centre. */
  path: number[];
  dropAt: number;
}

export interface PlinkoStakePlay extends PlayBase {
  mode: 'plinko_stake';
  bins: ModeCandidate[];
  /** userId -> bin index. */
  stakes: Record<string, number>;
  chipWeight: number;
  closesAt: number;
  closed: boolean;
  path: number[] | null;
  dropAt: number | null;
}

export interface BanDraftPlay extends PlayBase {
  mode: 'ban_draft';
  cards: ModeCandidate[];
  bans: { userId: string; gameId: string; at: number; auto: boolean }[];
  /** How many bans the draft runs to (one fewer than the cards). */
  banCount: number;
  turnEndsAt: number | null;
}

export interface RoulettePlay extends PlayBase {
  mode: 'roulette';
  wedges: ModeCandidate[];
  /** Where the pointer ends up, as a fraction (0..1) of the way round the wheel from wedge 0's
   * leading edge. Always inside the winner's wedge. */
  landing: number;
}

export interface ClawTry {
  userId: string;
  x: number;
  item: number | null;
  success: boolean;
  at: number;
  auto: boolean;
}
export interface ClawPlay extends PlayBase {
  mode: 'claw';
  items: ModeCandidate[];
  /** Chance (0..1) each item holds when grabbed. */
  grips: number[];
  tries: ClawTry[];
  turnStartedAt: number | null;
  turnEndsAt: number | null;
  /** True when every try missed and the machine made a weighted pick. */
  pity: boolean;
}

export interface MatchFlip {
  tile: number;
  userId: string;
  at: number;
  auto: boolean;
}
export interface MatchThreePlay extends PlayBase {
  mode: 'match_three';
  /** Game id under each tile. Server only: publicPlay() hides the ones still face down. */
  layout: string[];
  /** Face-up game id per tile, null while face down. What clients get. */
  tiles: (string | null)[];
  flips: MatchFlip[];
  turnEndsAt: number | null;
}

export type SpinPlay =
  | CardVotePlay
  | SlotPlay
  | KnockoutPlay
  | PlinkoPlay
  | PlinkoStakePlay
  | BanDraftPlay
  | RoulettePlay
  | ClawPlay
  | MatchThreePlay;

export type SpinPlayMode = SpinPlay['mode'];

/** Stored between `start` and the waiting room closing: the pool, nothing dealt yet. */
export interface PendingPlay {
  mode: SpinPlayMode;
  pending: true;
  pool: ModeCandidate[];
}

export type StoredPlay = SpinPlay | PendingPlay;

/** A member's move, sent to POST /api/rooms/:roomId/spin/action. */
export type SpinPlayAction =
  | { type: 'vote'; card: number }
  | { type: 'stake'; bin: number }
  | { type: 'ban'; gameId: string }
  | { type: 'shield'; gameId: string }
  | { type: 'drop'; x: number }
  | { type: 'flip'; tile: number };

/** A move that isn't allowed right now (not your turn, already decided, ...). */
export class PlayActionError extends Error {}

export function isPlayMode(mode: ConcreteSpinWheelTheme): mode is SpinPlayMode {
  return mode !== 'reel';
}

export function isPending(play: StoredPlay): play is PendingPlay {
  return 'pending' in play && play.pending;
}

// ---- Weighted draws ----

function pickIndex(weights: number[], rng: Rng): number {
  const total = weights.reduce((s, w) => s + Math.max(0, w), 0);
  if (total <= 0) return Math.floor(rng() * weights.length);
  let roll = rng() * total;
  for (let i = 0; i < weights.length; i++) {
    roll -= Math.max(0, weights[i]);
    if (roll <= 0) return i;
  }
  return weights.length - 1;
}

function pick<T>(items: T[], weight: (item: T) => number, rng: Rng): T {
  return items[pickIndex(items.map(weight), rng)];
}

/** Up to `n` distinct candidates, each drawn by weight from those not yet drawn. */
export function weightedSample(pool: ModeCandidate[], n: number, rng: Rng): ModeCandidate[] {
  const left = [...pool];
  const out: ModeCandidate[] = [];
  while (out.length < n && left.length) out.push(left.splice(pickIndex(left.map((c) => c.weight), rng), 1)[0]);
  return out;
}

function shuffle<T>(items: T[], rng: Rng): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---- Plinko path ----

/** A chip's route from `dropX` into bin `target` of `bins` (all fractions across the board): one
 * x per peg row, each a half-peg step left or right, steered so it ends in the target bin. */
export function plinkoPath(bins: ModeCandidate[], target: number, dropX: number, rng: Rng): number[] {
  const total = bins.reduce((s, b) => s + b.weight, 0) || 1;
  let left = 0;
  for (let i = 0; i < target; i++) left += bins[i].weight / total;
  const width = bins[target].weight / total;
  const end = left + width * (0.3 + rng() * 0.4);
  const path = [dropX];
  let x = dropX;
  const step = 0.06;
  for (let row = 1; row <= PLINKO_ROWS; row++) {
    const rowsLeft = PLINKO_ROWS + 1 - row;
    // Bounce randomly, but always lean toward the target enough to still get there.
    const need = (end - x) / rowsLeft;
    const dir = Math.abs(need) > step * 0.8 ? Math.sign(need) : rng() < 0.5 ? -1 : 1;
    x = Math.min(0.98, Math.max(0.02, x + dir * step + need * 0.5));
    path.push(x);
  }
  path.push(end);
  return path;
}

// ---- Setup ----

/** What `start` stores for a mode: the weighted pool. Dealing waits for beginPlay. */
export function pendingPlay(mode: SpinPlayMode, pool: ModeCandidate[], rng: Rng, cap = 40): PendingPlay {
  return { mode, pending: true, pool: weightedSample(pool, cap, rng) };
}

function base(startAt: number, participants: string[]): PlayBase {
  return { startAt, participants, winnerId: null, revealAt: null, kicker: null };
}

/** Deals the round once the waiting room has closed. `participants` must be non-empty. */
export function beginPlay(pending: PendingPlay, participants: string[], startAt: number, rng: Rng): SpinPlay {
  const pool = pending.pool;
  const b = base(startAt, participants);
  switch (pending.mode) {
    case 'roulette': {
      const wedges = weightedSample(pool, 8, rng);
      const total = wedges.reduce((s, w) => s + w.weight, 0);
      const win = pickIndex(wedges.map((w) => w.weight), rng);
      let edge = 0;
      for (let i = 0; i < win; i++) edge += wedges[i].weight / total;
      const width = wedges[win].weight / total;
      const landing = edge + width * (0.5 + (rng() - 0.5) * 0.7);
      return { ...b, mode: 'roulette', wedges, landing, winnerId: wedges[win].gameId, revealAt: startAt + ROULETTE_SPIN_MS + 300 };
    }
    case 'plinko': {
      const bins = shuffle(weightedSample(pool, 5, rng), rng);
      const win = pickIndex(bins.map((x) => x.weight), rng);
      const dropAt = startAt + PLINKO_DROP_DELAY_MS;
      return {
        ...b,
        mode: 'plinko',
        bins,
        path: plinkoPath(bins, win, 0.15 + rng() * 0.7, rng),
        dropAt,
        winnerId: bins[win].gameId,
        revealAt: dropAt + PLINKO_FALL_MS + REVEAL_PAD_MS,
      };
    }
    case 'plinko_stake': {
      const bins = shuffle(weightedSample(pool, 5, rng), rng);
      return {
        ...b,
        mode: 'plinko_stake',
        bins,
        stakes: {},
        chipWeight: SPIN_MODE_SETTINGS.chipWeight,
        closesAt: startAt + SPIN_MODE_SETTINGS.voteSeconds * 1000,
        closed: false,
        path: null,
        dropAt: null,
      };
    }
    case 'card_vote': {
      const cards = weightedSample(pool, 3, rng);
      return { ...b, mode: 'card_vote', cards, votes: {}, closesAt: startAt + CARD_DEAL_MS + SPIN_MODE_SETTINGS.voteSeconds * 1000, closed: false };
    }
    case 'slot':
      return dealSlots(b, weightedSample(pool, 6, rng), SPIN_MODE_SETTINGS.respinLimit, rng);
    case 'knockout': {
      const cards = weightedSample(pool, 8, rng);
      const play: KnockoutPlay = {
        ...b,
        mode: 'knockout',
        cards,
        rounds: [],
        shields: {},
        usedShields: [],
        shieldsOn: SPIN_MODE_SETTINGS.shields,
        nextRoundAt: startAt + KNOCKOUT_FIRST_ROUND_DELAY_MS,
      };
      if (cards.length <= 1) return { ...play, winnerId: cards[0]?.gameId ?? null, revealAt: startAt + REVEAL_PAD_MS, nextRoundAt: null };
      return play;
    }
    case 'ban_draft': {
      const cards = weightedSample(pool, participants.length + 1, rng);
      const play: BanDraftPlay = { ...b, mode: 'ban_draft', cards, bans: [], banCount: cards.length - 1, turnEndsAt: startAt + BAN_TURN_MS };
      return finishBanDraft(play, startAt);
    }
    case 'claw': {
      const items = weightedSample(pool, CLAW_ITEM_COUNT, rng);
      const ws = items.map((i) => i.weight);
      const lo = Math.min(...ws);
      const hi = Math.max(...ws);
      const grips = ws.map((w) => 0.28 + 0.52 * (hi > lo ? (w - lo) / (hi - lo) : 0.5));
      return { ...b, mode: 'claw', items, grips, tries: [], turnStartedAt: startAt, turnEndsAt: startAt + CLAW_TURN_MS, pity: false };
    }
    case 'match_three': {
      const layout = dealTiles(pool, rng);
      return { ...b, mode: 'match_three', layout, tiles: layout.map(() => null), flips: [], turnEndsAt: startAt + MATCH_TURN_MS };
    }
  }
}

/** Runs the whole slot sequence up front: the server decides every reel, the client replays it. */
function dealSlots(b: PlayBase, symbols: ModeCandidate[], respinLimit: number, rng: Rng): SlotPlay {
  const draw = () => pick(symbols, (s) => s.weight, rng).gameId;
  const weightOf = (id: string) => symbols.find((s) => s.gameId === id)?.weight ?? 0;
  const spins: SlotSpin[] = [];
  let reels: [string, string, string] = [draw(), draw(), draw()];
  let held: [boolean, boolean, boolean] = [false, false, false];
  let at = b.startAt;
  let winnerId: string | null = null;
  let kicker: string | null = null;
  for (let n = 0; ; n++) {
    spins.push({ reels, held, at });
    const end = slotSpinEnd({ reels, held, at });
    const [a, c, d] = reels;
    if (a === c && c === d) {
      winnerId = a;
      kicker = n === 0 ? 'THREE OF A KIND, FIRST PULL' : 'THREE OF A KIND';
      break;
    }
    const pairId = a === c || a === d ? a : c === d ? c : null;
    if (n >= respinLimit) {
      if (pairId) {
        winnerId = pairId;
        kicker = 'OUT OF RESPINS · THE PAIR WINS';
      } else {
        winnerId = [...reels].sort((x, y) => weightOf(y) - weightOf(x))[0];
        kicker = 'OUT OF RESPINS · BEST ON THE LINE';
      }
      break;
    }
    at = end + SLOT_RESPIN_PAUSE_MS;
    if (pairId) {
      held = reels.map((r) => r === pairId) as [boolean, boolean, boolean];
      reels = reels.map((r, i) => (held[i] ? r : draw())) as [string, string, string];
    } else {
      held = [false, false, false];
      reels = [draw(), draw(), draw()];
    }
  }
  const last = spins[spins.length - 1];
  return { ...b, mode: 'slot', symbols, spins, respinLimit, winnerId, kicker, revealAt: slotSpinEnd(last) + REVEAL_PAD_MS };
}

/** When each reel of `spin` stops (held reels: when the spin starts). */
export function slotStopTimes(spin: SlotSpin): [number, number, number] {
  let k = 0;
  return spin.held.map((h) => (h ? spin.at : spin.at + SLOT_FIRST_STOP_MS + SLOT_STOP_GAP_MS * k++)) as [number, number, number];
}

export function slotSpinEnd(spin: SlotSpin): number {
  return Math.max(...slotStopTimes(spin));
}

/** 12 tiles drawn with chance ∝ weight^1.6, at most 4 per game, redrawn until some game has 3+. */
function dealTiles(pool: ModeCandidate[], rng: Rng): string[] {
  const games = pool.slice(0, 12);
  // A pool too small to fill 12 tiles at 4 each still needs a full board.
  const maxEach = Math.max(4, Math.ceil(MATCH_TILES / Math.max(1, games.length)));
  for (let attempt = 0; attempt < 50; attempt++) {
    const counts = new Map<string, number>();
    const tiles: string[] = [];
    while (tiles.length < MATCH_TILES) {
      const open = games.filter((g) => (counts.get(g.gameId) ?? 0) < maxEach);
      const g = pick(open, (x) => Math.pow(x.weight, 1.6), rng);
      counts.set(g.gameId, (counts.get(g.gameId) ?? 0) + 1);
      tiles.push(g.gameId);
    }
    if ([...counts.values()].some((c) => c >= 3)) return shuffle(tiles, rng);
  }
  // Practically unreachable; force a triple of the heaviest game.
  const top = [...games].sort((a, b) => b.weight - a.weight)[0].gameId;
  return shuffle([top, top, top, ...Array.from({ length: MATCH_TILES - 3 }, () => pick(games, (x) => x.weight, rng).gameId)], rng);
}

// ---- Turns ----

/** Whose turn it is in a turn-based mode, or null when it's over. */
export function currentTurn(play: SpinPlay): string | null {
  if (play.winnerId || play.participants.length === 0) return null;
  const n = play.participants.length;
  if (play.mode === 'ban_draft') return play.bans.length < play.banCount ? play.participants[play.bans.length % n] : null;
  if (play.mode === 'claw') return play.tries.length < CLAW_TRIES ? play.participants[play.tries.length % n] : null;
  if (play.mode === 'match_three') return play.participants[play.flips.length % n];
  return null;
}

function finishBanDraft(play: BanDraftPlay, at: number): BanDraftPlay {
  if (play.bans.length < play.banCount) return play;
  const banned = new Set(play.bans.map((x) => x.gameId));
  const survivor = play.cards.find((c) => !banned.has(c.gameId));
  return { ...play, winnerId: survivor?.gameId ?? null, revealAt: at + 900, turnEndsAt: null };
}

function ban(play: BanDraftPlay, userId: string, gameId: string, at: number, auto: boolean): BanDraftPlay {
  const next = { ...play, bans: [...play.bans, { userId, gameId, at, auto }], turnEndsAt: at + BAN_TURN_MS };
  return finishBanDraft(next, at);
}

function claw(play: ClawPlay, userId: string, x: number, at: number, auto: boolean, rng: Rng): ClawPlay {
  const item = clawItemUnder(x, play.items.length);
  const success = item !== null && rng() < play.grips[item];
  const tries = [...play.tries, { userId, x, item, success, at, auto }];
  const animEnd = at + clawAnimMs(success);
  if (success) return { ...play, tries, winnerId: play.items[item].gameId, revealAt: animEnd + 300, turnStartedAt: null, turnEndsAt: null };
  if (tries.length >= CLAW_TRIES) {
    const pityPick = pick(play.items, (i) => i.weight, rng);
    return {
      ...play,
      tries,
      pity: true,
      winnerId: pityPick.gameId,
      kicker: 'THREE MISSES · THE MACHINE TOOK PITY',
      revealAt: animEnd + 600,
      turnStartedAt: null,
      turnEndsAt: null,
    };
  }
  const nextStart = animEnd + CLAW_TURN_GAP_MS;
  return { ...play, tries, turnStartedAt: nextStart, turnEndsAt: nextStart + CLAW_TURN_MS };
}

function flip(play: MatchThreePlay, userId: string, tile: number, at: number, auto: boolean): MatchThreePlay {
  const flips = [...play.flips, { tile, userId, at, auto }];
  const tiles = [...play.tiles];
  tiles[tile] = play.layout[tile];
  const gameId = play.layout[tile];
  const count = flips.filter((f) => play.layout[f.tile] === gameId).length;
  if (count >= 3) return { ...play, flips, tiles, winnerId: gameId, revealAt: at + 900, turnEndsAt: null };
  return { ...play, flips, tiles, turnEndsAt: at + MATCH_TURN_MS };
}

function closeCardVote(play: CardVotePlay, at: number, rng: Rng): CardVotePlay {
  const counts = play.cards.map((_, i) => Object.values(play.votes).filter((v) => v === i).length);
  const top = Math.max(...counts);
  const tied = play.cards.map((c, i) => ({ c, i })).filter(({ i }) => counts[i] === top);
  const win = tied.length === 1 ? tied[0] : pick(tied, ({ c }) => c.weight, rng);
  const kicker = top === 0 ? 'NO VOTES · WEIGHTED DRAW PICKED IT' : tied.length > 1 ? 'TIED · WEIGHTED DRAW BROKE IT' : null;
  return { ...play, closed: true, closesAt: at, winnerId: win.c.gameId, revealAt: at + REVEAL_PAD_MS, kicker };
}

function closeStakes(play: PlinkoStakePlay, at: number, rng: Rng): PlinkoStakePlay {
  const chips = play.bins.map((_, i) => Object.values(play.stakes).filter((s) => s === i).length);
  const boosted = play.bins.map((bin, i) => ({ ...bin, weight: bin.weight + play.chipWeight * chips[i] }));
  const win = pickIndex(boosted.map((x) => x.weight), rng);
  const dropAt = at + PLINKO_DROP_DELAY_MS;
  const n = chips[win];
  return {
    ...play,
    closed: true,
    closesAt: at,
    dropAt,
    path: plinkoPath(boosted, win, 0.15 + rng() * 0.7, rng),
    winnerId: play.bins[win].gameId,
    revealAt: dropAt + PLINKO_FALL_MS + REVEAL_PAD_MS,
    kicker: n === 0 ? 'AN UPSET, NO CHIPS' : `TONIGHT'S PICK · ${n} CHIP${n === 1 ? '' : 'S'} ON IT`,
  };
}

/** Plinko-stake bin weights with the chips counted in. */
export function stakedWeights(play: PlinkoStakePlay): number[] {
  return play.bins.map((bin, i) => bin.weight + play.chipWeight * Object.values(play.stakes).filter((s) => s === i).length);
}

/** Cards still in a knockout. */
export function knockoutAlive(play: KnockoutPlay): string[] {
  const out = new Set(play.rounds.filter((r) => !r.blocked).map((r) => r.hit));
  return play.cards.map((c) => c.gameId).filter((id) => !out.has(id));
}

/** How long a knockout round's highlight runs, by how many cards are left. */
export function knockoutHopMs(alive: number): number {
  return alive > 3 ? 80 : 150;
}

function knockoutRound(play: KnockoutPlay, at: number, rng: Rng): KnockoutPlay {
  const alive = knockoutAlive(play);
  const weightOf = (id: string) => play.cards.find((c) => c.gameId === id)?.weight ?? 1;
  const hit = pick(alive, (id) => 1 / Math.pow(weightOf(id), 2), rng);
  const hopCount = alive.length > 3 ? 4 + Math.floor(rng() * 3) : 9 + Math.floor(rng() * 4);
  const hops: string[] = [];
  let prev = '';
  for (let i = 0; i < hopCount - 1; i++) {
    const options = alive.filter((id) => id !== prev);
    prev = options[Math.floor(rng() * options.length)] ?? alive[0];
    hops.push(prev);
  }
  hops.push(hit);
  const shielder = play.shieldsOn ? Object.keys(play.shields).find((u) => play.shields[u] === hit) : undefined;
  const shields = { ...play.shields };
  const usedShields = [...play.usedShields];
  if (shielder) {
    delete shields[shielder];
    usedShields.push(shielder);
  }
  const round: KnockoutRound = { at, hops, hit, blocked: !!shielder, blockedBy: shielder ?? null };
  const rounds = [...play.rounds, round];
  const animMs = hops.length * knockoutHopMs(alive.length);
  const left = alive.length - (shielder ? 0 : 1);
  if (left <= 1) {
    const next = { ...play, rounds, shields, usedShields };
    const winner = knockoutAlive(next)[0] ?? null;
    return { ...next, nextRoundAt: null, winnerId: winner, revealAt: at + animMs + REVEAL_PAD_MS };
  }
  return { ...play, rounds, shields, usedShields, nextRoundAt: at + animMs + KNOCKOUT_PAUSE_MS };
}

// ---- Advance & act ----

/** Brings `stored` up to `now`: deals once the waiting room (ending at `startAt`) has closed, then
 * runs every timer that has run out, in order, at the moment it ran out. Returns the same object
 * when nothing changed. */
export function advancePlay(stored: StoredPlay, now: number, startAt: number, participants: string[], rng: Rng): StoredPlay {
  if (isPending(stored)) {
    if (now < startAt) return stored;
    stored = beginPlay(stored, participants.length ? participants : [], startAt, rng);
  }
  let play = stored as SpinPlay;
  // Bounded: every pass either decides the round or moves a deadline forward.
  for (let guard = 0; guard < 100 && !play.winnerId; guard++) {
    const next = step(play, now, rng);
    if (next === play) break;
    play = next;
  }
  return play;
}

function step(play: SpinPlay, now: number, rng: Rng): SpinPlay {
  switch (play.mode) {
    case 'card_vote':
      return now >= play.closesAt ? closeCardVote(play, play.closesAt, rng) : play;
    case 'plinko_stake':
      return now >= play.closesAt ? closeStakes(play, play.closesAt, rng) : play;
    case 'knockout':
      return play.nextRoundAt !== null && now >= play.nextRoundAt ? knockoutRound(play, play.nextRoundAt, rng) : play;
    case 'ban_draft': {
      if (play.turnEndsAt === null || now < play.turnEndsAt) return play;
      const who = currentTurn(play);
      if (!who) return play;
      // Timed out: the game with the lowest weight is the likeliest to go.
      const banned = new Set(play.bans.map((x) => x.gameId));
      const left = play.cards.filter((c) => !banned.has(c.gameId));
      return ban(play, who, pick(left, (c) => 1 / c.weight, rng).gameId, play.turnEndsAt, true);
    }
    case 'claw': {
      if (play.turnEndsAt === null || play.turnStartedAt === null || now < play.turnEndsAt) return play;
      const who = currentTurn(play);
      if (!who) return play;
      return claw(play, who, clawXAt(play.turnStartedAt, play.turnEndsAt), play.turnEndsAt, true, rng);
    }
    case 'match_three': {
      if (play.turnEndsAt === null || now < play.turnEndsAt) return play;
      const who = currentTurn(play);
      if (!who) return play;
      const down = play.tiles.map((t, i) => (t === null ? i : -1)).filter((i) => i >= 0);
      return flip(play, who, down[Math.floor(rng() * down.length)], play.turnEndsAt, true);
    }
    default:
      return play;
  }
}

/** Applies a member's move at `now` (after advancePlay). Throws PlayActionError when it isn't allowed. */
export function applyPlayAction(play: SpinPlay, userId: string, action: SpinPlayAction, now: number, rng: Rng): SpinPlay {
  if (play.winnerId) throw new PlayActionError('This round is already decided');
  if (!play.participants.includes(userId)) throw new PlayActionError("You joined after this round started. You can watch this one.");
  const turn = currentTurn(play);
  const myTurn = () => {
    if (turn !== userId) throw new PlayActionError("It isn't your turn");
  };
  switch (play.mode) {
    case 'card_vote': {
      if (action.type !== 'vote') break;
      if (now < play.startAt + CARD_DEAL_MS - 200) throw new PlayActionError('The cards are still being dealt');
      if (!Number.isInteger(action.card) || action.card < 0 || action.card >= play.cards.length) throw new PlayActionError('No such card');
      const votes = { ...play.votes, [userId]: action.card };
      const all = play.participants.every((p) => p in votes);
      return { ...play, votes, closesAt: all ? Math.min(play.closesAt, now + CARD_VOTE_GRACE_MS) : play.closesAt };
    }
    case 'plinko_stake': {
      if (action.type !== 'stake') break;
      if (!Number.isInteger(action.bin) || action.bin < 0 || action.bin >= play.bins.length) throw new PlayActionError('No such bin');
      const stakes = { ...play.stakes, [userId]: action.bin };
      const all = play.participants.every((p) => p in stakes);
      return { ...play, stakes, closesAt: all ? Math.min(play.closesAt, now + PLINKO_STAKE_GRACE_MS) : play.closesAt };
    }
    case 'knockout': {
      if (action.type !== 'shield') break;
      if (!play.shieldsOn) throw new PlayActionError('Shields are off');
      if (play.usedShields.includes(userId)) throw new PlayActionError('Your shield is used up');
      if (!knockoutAlive(play).includes(action.gameId)) throw new PlayActionError('That game is already out');
      return { ...play, shields: { ...play.shields, [userId]: action.gameId } };
    }
    case 'ban_draft': {
      if (action.type !== 'ban') break;
      myTurn();
      const banned = new Set(play.bans.map((x) => x.gameId));
      if (!play.cards.some((c) => c.gameId === action.gameId) || banned.has(action.gameId)) throw new PlayActionError("That game can't be banned");
      return ban(play, userId, action.gameId, now, false);
    }
    case 'claw': {
      if (action.type !== 'drop') break;
      myTurn();
      if (play.turnStartedAt === null || now < play.turnStartedAt) throw new PlayActionError('The claw is still moving');
      // The claw's position is the server's to know: trust the x the player saw only if the claw
      // really was there within the last CLAW_DROP_SLACK_MS (their click's round trip); otherwise
      // it drops wherever the claw is now.
      const sent = Number.isFinite(action.x) ? action.x : NaN;
      let x = clawXAt(play.turnStartedAt, now);
      for (let back = 0; back <= CLAW_DROP_SLACK_MS; back += 20) {
        if (Math.abs(clawXAt(play.turnStartedAt, now - back) - sent) <= 12) {
          x = sent;
          break;
        }
      }
      return claw(play, userId, x, now, false, rng);
    }
    case 'match_three': {
      if (action.type !== 'flip') break;
      myTurn();
      if (!Number.isInteger(action.tile) || action.tile < 0 || action.tile >= play.tiles.length || play.tiles[action.tile] !== null) {
        throw new PlayActionError("That tile can't be flipped");
      }
      return flip(play, userId, action.tile, now, false);
    }
    default:
      break;
  }
  throw new PlayActionError("That move doesn't fit this spin");
}

/** The games a dealt round can show or pick - what the session needs details for once the pool
 * has been dealt from. */
export function playGameIds(play: SpinPlay): string[] {
  switch (play.mode) {
    case 'card_vote':
    case 'knockout':
    case 'ban_draft':
      return play.cards.map((c) => c.gameId);
    case 'slot':
      return play.symbols.map((c) => c.gameId);
    case 'plinko':
    case 'plinko_stake':
      return play.bins.map((c) => c.gameId);
    case 'roulette':
      return play.wedges.map((c) => c.gameId);
    case 'claw':
      return play.items.map((c) => c.gameId);
    case 'match_three':
      // Sorted, not in layout order - first-appearance order would tell members which game is
      // under the face-down tiles.
      return [...new Set(play.layout)].sort();
  }
}

/** What members get: everything except match three's face-down tiles. */
export function publicPlay(play: SpinPlay): SpinPlay {
  if (play.mode !== 'match_three') return play;
  return { ...play, layout: [] };
}

/** When the round should be treated as settled for polling and the respin vote: the reveal time,
 * or far off while undecided. */
export function playSettlesAt(play: StoredPlay, startAt: number): number {
  if (isPending(play) || play.revealAt === null) return startAt + 60 * 60 * 1000;
  return play.revealAt;
}
