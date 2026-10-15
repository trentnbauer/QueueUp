import { WHACK_HOLES, type WhackHole, type WhackSnapshot } from '../spinLobby.js';
import { RoundGame, type RoundPlayer } from './roundGame.js';

const ROUND_S = 30;
/** A moment before the first mole, so there is time to get ready. */
const FIRST_SPAWN_S = 0.8;
/** Seconds between new moles: starts slow and gets busier, down to a floor. */
const SPAWN_START_S = 0.8;
const SPAWN_GAIN_S = 0.016;
const SPAWN_MIN_S = 0.28;
/** How long a mole stays up: starts long and gets shorter, down to a floor. */
const UP_START_S = 1.4;
const UP_GAIN_S = 0.022;
const UP_MIN_S = 0.6;
const BOMB_CHANCE = 0.18;
/** Whacking a bomb costs this many points (never below zero). */
const BOMB_COST = 2;
/** Tapping an empty hole costs this many points (never below zero), so mashing every hole does not win. */
const MISS_COST = 1;
/** A whacked hole shows who whacked it for this long, then goes back to empty. */
const WHACKED_S = 0.35;

interface Hole {
  kind: 'empty' | 'mole' | 'bomb' | 'whacked';
  n: number;
  /** Seconds left up (mole or bomb), or left showing the whack (whacked). */
  left: number;
  /** How long this mole stays up in all. */
  upS: number;
  by: string | null;
  bomb: boolean;
}

interface Whacker extends RoundPlayer {
  score: number;
}

const emptyHole = (): Hole => ({ kind: 'empty', n: 0, left: 0, upS: 0, by: null, bomb: false });

/** Sets a hole's fields one by one. (Not `Object.assign`: a hole is picked by an index from a tap, and copying
 * properties onto something chosen that way is what code scanning flags as prototype pollution.) */
function setHole(h: Hole, kind: Hole['kind'], n: number, left: number, upS: number, by: string | null, bomb: boolean): void {
  h.kind = kind;
  h.n = n;
  h.left = left;
  h.upS = upS;
  h.by = by;
  h.bomb = bomb;
}

/** Moles (and the odd bomb) pop up out of a 3 x 3 grid of holes; tap a hole while a mole is up. Everyone is
 * on the same grid and goes for the same moles: the first tap to reach the server gets the point and the
 * mole drops. When the 30 seconds are up, most points wins. Nobody is knocked out. See RoundGame for how
 * rounds start and end. */
export class WhackGame extends RoundGame<Whacker> {
  readonly id = 'whack' as const;
  private holes: Hole[] = Array.from({ length: WHACK_HOLES }, emptyHole);
  private spawned = 0;
  private spawnIn = 0;
  private lastWasBomb = false;

  /** The score shown for the round: the most points anyone has. */
  protected get meters(): number {
    let best = 0;
    for (const p of this.players.values()) if (p.alive && p.score > best) best = p.score;
    return best;
  }

  protected createPlayer(id: string, alive: boolean): Whacker {
    return { id, score: 0, alive, wins: 0, outAtMeters: 0 };
  }

  protected resetPlayer(p: Whacker): void {
    p.score = 0;
  }

  protected resetCourse(): void {
    this.holes = Array.from({ length: WHACK_HOLES }, emptyHole);
    this.spawned = 0;
    this.lastWasBomb = false;
  }

  protected beginCourse(): void {
    this.resetCourse();
    this.spawnIn = FIRST_SPAWN_S;
  }

  input(): void {
    // The holes are the controller: there is nothing to hold.
  }

  action(): void {
    // Tapping a hole is all there is to do.
  }

  tap(userId: string, target: number): void {
    const p = this.players.get(userId);
    if (this.phase !== 'playing' || !p || !p.alive) return;
    if (!Number.isInteger(target) || target < 0 || target >= WHACK_HOLES) return;
    const hole = this.holes[target];
    // A hole that was just whacked is already taken: a late tap on it is ignored and costs nothing.
    if (hole.kind === 'whacked') return;
    if (hole.kind === 'empty') {
      p.score = Math.max(0, p.score - MISS_COST);
      return;
    }
    const bomb = hole.kind === 'bomb';
    if (bomb) p.score = Math.max(0, p.score - BOMB_COST);
    else p.score++;
    setHole(hole, 'whacked', hole.n, WHACKED_S, 0, p.id, bomb);
  }

  snapshot(): WhackSnapshot {
    const ids = [...this.players.keys()];
    return {
      id: 'whack',
      phase: this.phase,
      meters: this.meters,
      speed: 0,
      roundLeftMs: this.phase === 'playing' ? Math.max(0, Math.round(ROUND_S * 1000 - this.roundMs)) : 0,
      timerMs: Math.max(0, Math.round(this.timerMs)),
      winnerId: this.winnerId,
      ...this.summary(),
      holes: this.holes.map((h): WhackHole => ({
        kind: h.kind,
        n: h.n,
        upMs: h.kind === 'mole' || h.kind === 'bomb' ? Math.round(h.upS * 1000) : 0,
        by: h.kind === 'whacked' && h.by ? ids.indexOf(h.by) : -1,
        bomb: h.kind === 'whacked' && h.bomb,
      })),
      players: [...this.players.values()].map((p) => ({ id: p.id, alive: p.alive, wins: p.wins, meters: p.alive ? p.score : 0 })),
    };
  }

  protected advance(dt: number): void {
    const seconds = this.roundMs / 1000;
    for (const h of this.holes) {
      if (h.kind === 'empty') continue;
      h.left -= dt;
      if (h.left <= 0) setHole(h, 'empty', 0, 0, 0, null, false);
    }

    this.spawnIn -= dt;
    while (this.spawnIn <= 0) {
      this.spawnMole(seconds);
      this.spawnIn += Math.max(SPAWN_MIN_S, SPAWN_START_S - SPAWN_GAIN_S * seconds);
    }

    if (seconds >= ROUND_S) this.finishRound();
  }

  /** Time is up: most points wins. A tie for the most, or a solo round, has no winner. */
  private finishRound(): void {
    const players = [...this.players.values()].filter((p) => p.alive);
    for (const p of players) p.outAtMeters = p.score;
    const best = Math.max(0, ...players.map((p) => p.score));
    const leaders = players.filter((p) => p.score === best);
    this.endRun(this.startedWith > 1 && best > 0 && leaders.length === 1 ? leaders[0] : null);
  }

  /** Raises a mole or bomb in a random empty hole, if there is one. */
  private spawnMole(seconds: number): void {
    const free = this.holes.map((h, i) => (h.kind === 'empty' ? i : -1)).filter((i) => i >= 0);
    // Always take the random numbers, so a full grid does not change what comes next.
    const pick = this.rng();
    const bomb = !this.lastWasBomb && this.rng() < BOMB_CHANCE;
    if (free.length === 0) return;
    this.lastWasBomb = bomb;
    const upS = Math.max(UP_MIN_S, UP_START_S - UP_GAIN_S * seconds);
    setHole(this.holes[free[Math.floor(pick * free.length)]], bomb ? 'bomb' : 'mole', ++this.spawned, upS, upS, null, false);
  }
}
