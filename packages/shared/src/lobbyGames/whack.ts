import { WHACK_HOLES, type WhackHole, type WhackSnapshot } from '../spinLobby.js';
import { RoundGame, type RoundPlayer } from './roundGame.js';

const ROUND_S = 30;
/** A moment before the first mole, so there is time to get ready. */
const FIRST_SPAWN_S = 0.8;
/** Seconds between new moles: starts slow and gets busier, down to a floor. */
const SPAWN_START_S = 0.8;
const SPAWN_GAIN_S = 0.016;
const SPAWN_MIN_S = 0.28;
/** How long a mole stays up: starts long and gets noticeably shorter, down to a floor (about 0.45s by the end of the
 * round). Nobody races for it any more, so the pressure comes from this. */
const UP_START_S = 1.8;
const UP_GAIN_S = 0.045;
const UP_MIN_S = 0.45;
/** Now and then the grid empties and nothing comes up for a beat: after this many moles (a random number between
 * the two), the next one waits for the grid to clear and then for a pause of between the two lengths. */
const PAUSE_EVERY_MIN = 4;
const PAUSE_EVERY_EXTRA = 4;
const PAUSE_MIN_S = 0.5;
const PAUSE_EXTRA_S = 0.7;
const BOMB_CHANCE = 0.18;
/** Whacking a bomb costs this many points (never below zero). */
const BOMB_COST = 2;
/** Tapping an empty hole costs this many points (never below zero), so mashing every hole does not win. */
const MISS_COST = 1;

interface Hole {
  kind: 'empty' | 'mole' | 'bomb';
  n: number;
  /** Seconds left up. */
  left: number;
  /** How long this mole stays up in all. */
  upS: number;
  /** Everyone who has tapped it while it was up (each person once; it stays up so late tappers still score). */
  by: string[];
}

interface Whacker extends RoundPlayer {
  score: number;
}

const emptyHole = (): Hole => ({ kind: 'empty', n: 0, left: 0, upS: 0, by: [] });

/** Sets a hole's fields one by one. (Not `Object.assign`: a hole is picked by an index from a tap, and copying
 * properties onto something chosen that way is what code scanning flags as prototype pollution.) */
function setHole(h: Hole, kind: Hole['kind'], n: number, left: number, upS: number): void {
  h.kind = kind;
  h.n = n;
  h.left = left;
  h.upS = upS;
  h.by = [];
}

/** Moles (and the odd bomb) pop up out of a 3 x 3 grid of holes; tap a hole while a mole is up. Everyone is
 * on the same grid and goes for the same moles, and every player who taps a mole while it is up scores for it
 * (being first does not matter). The pressure is that moles stay up for less and less time, with a beat of
 * nothing now and then. When the 30 seconds are up, most points wins. Nobody is knocked out. See RoundGame for
 * how rounds start and end. */
export class WhackGame extends RoundGame<Whacker> {
  readonly id = 'whack' as const;
  private holes: Hole[] = Array.from({ length: WHACK_HOLES }, emptyHole);
  private spawned = 0;
  private spawnIn = 0;
  private lastWasBomb = false;
  /** Moles left before the next pause. */
  private untilPause = 0;

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
    this.untilPause = PAUSE_EVERY_MIN;
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
    if (hole.kind === 'empty') {
      p.score = Math.max(0, p.score - MISS_COST);
      return;
    }
    // Everyone can have a mole, once each: a second tap on it from the same person does nothing and costs nothing.
    if (hole.by.includes(p.id)) return;
    hole.by.push(p.id);
    if (hole.kind === 'bomb') p.score = Math.max(0, p.score - BOMB_COST);
    else p.score++;
  }

  snapshot(): WhackSnapshot {
    const ids = [...this.players.keys()];
    return {
      id: 'whack',
      phase: this.phase,
      meters: this.meters,
      speed: 0,
      roundLeftMs: this.leftMs,
      timerMs: Math.max(0, Math.round(this.timerMs)),
      winnerId: this.winnerId,
      ...this.summary(),
      holes: this.holes.map((h): WhackHole => ({
        kind: h.kind,
        n: h.n,
        upMs: h.kind === 'empty' ? 0 : Math.round(h.upS * 1000),
        by: h.by.map((id) => ids.indexOf(id)).filter((i) => i >= 0),
      })),
      players: [...this.players.values()].map((p) => ({ id: p.id, alive: p.alive, wins: p.wins, meters: p.alive ? p.score : 0 })),
    };
  }

  protected override get ownLimitS(): number {
    return ROUND_S;
  }

  protected advance(dt: number): void {
    const seconds = this.roundMs / 1000;
    for (const h of this.holes) {
      if (h.kind === 'empty') continue;
      h.left -= dt;
      if (h.left <= 0) setHole(h, 'empty', 0, 0, 0);
    }

    this.spawnIn -= dt;
    while (this.spawnIn <= 0) {
      this.spawnMole(seconds);
      this.spawnIn += Math.max(SPAWN_MIN_S, SPAWN_START_S - SPAWN_GAIN_S * seconds);
      if (--this.untilPause <= 0) {
        // The grid is left to empty (the last mole's full time), then nothing comes up for a beat.
        this.untilPause = PAUSE_EVERY_MIN + Math.floor(this.rng() * (PAUSE_EVERY_EXTRA + 1));
        this.spawnIn += Math.max(UP_MIN_S, UP_START_S - UP_GAIN_S * seconds) + PAUSE_MIN_S + this.rng() * PAUSE_EXTRA_S;
      }
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
    setHole(this.holes[free[Math.floor(pick * free.length)]], bomb ? 'bomb' : 'mole', ++this.spawned, upS, upS);
  }
}
