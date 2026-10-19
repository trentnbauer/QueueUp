import { ENDLESS_LIVES, WHACK_HOLES, type WhackHole, type WhackSnapshot } from '../spinLobby.js';
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
/** Endless (no time limit): moles stay up for less and come quicker, down to floors well under a classic round's, over `ENDLESS_RAMP_S`. */
const ENDLESS_RAMP_S = 40;
const ENDLESS_UP_S: readonly [number, number] = [1.8, 0.35];
const ENDLESS_SPAWN_S: readonly [number, number] = [0.8, 0.22];

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
  /** Lives left (endless runs only): a mole that goes down untapped, a bomb whacked and an empty hole tapped each cost one. */
  lives: number;
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
 * nothing now and then. With a time limit it is a 30 second round: most points wins and nobody is knocked out. With none it is endless: three
 * lives each, lost to a mole that goes down untapped, a bomb whacked or an empty hole tapped, moles that keep getting quicker, and the last
 * one standing wins. See RoundGame for how rounds start and end. */
export class WhackGame extends RoundGame<Whacker> {
  readonly id = 'whack' as const;
  private holes: Hole[] = Array.from({ length: WHACK_HOLES }, emptyHole);
  private spawned = 0;
  private spawnIn = 0;
  private lastWasBomb = false;
  /** Moles left before the next pause. */
  private untilPause = 0;

  /** The score shown for the round: the most points anyone has, counting those who are out. */
  protected get meters(): number {
    let best = 0;
    for (const p of this.players.values()) best = Math.max(best, p.alive ? p.score : p.outAtMeters);
    return best;
  }

  /** How hard it is right now: 0 at the start of an endless run, 1 from `ENDLESS_RAMP_S` seconds in. */
  private get ramp(): number {
    return Math.min(1, this.roundMs / 1000 / ENDLESS_RAMP_S);
  }

  protected createPlayer(id: string, alive: boolean): Whacker {
    return { id, score: 0, lives: ENDLESS_LIVES, alive, wins: 0, outAtMeters: 0 };
  }

  protected resetPlayer(p: Whacker): void {
    p.score = 0;
    p.lives = ENDLESS_LIVES;
  }

  protected override knockOut(p: Whacker): void {
    super.knockOut(p);
    p.outAtMeters = p.score;
  }

  private loseLife(p: Whacker): void {
    if (--p.lives <= 0) this.knockOut(p);
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
      if (this.endless) this.loseLife(p);
      else p.score = Math.max(0, p.score - MISS_COST);
      return;
    }
    // Everyone can have a mole, once each: a second tap on it from the same person does nothing and costs nothing.
    if (hole.by.includes(p.id)) return;
    hole.by.push(p.id);
    if (hole.kind === 'bomb') {
      if (this.endless) this.loseLife(p);
      else p.score = Math.max(0, p.score - BOMB_COST);
    } else p.score++;
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
      players: [...this.players.values()].map((p) => ({ id: p.id, alive: p.alive, wins: p.wins, meters: p.alive ? p.score : p.outAtMeters, lives: this.endless ? p.lives : null })),
    };
  }

  protected override get ownLimitS(): number | null {
    return this.endless ? null : ROUND_S;
  }

  /** How long a mole stays up and how long until the next one, now. */
  private pace(seconds: number): { upS: number; gapS: number } {
    if (this.endless) {
      const along = (pair: readonly [number, number]) => pair[0] + (pair[1] - pair[0]) * this.ramp;
      return { upS: along(ENDLESS_UP_S), gapS: along(ENDLESS_SPAWN_S) };
    }
    return { upS: Math.max(UP_MIN_S, UP_START_S - UP_GAIN_S * seconds), gapS: Math.max(SPAWN_MIN_S, SPAWN_START_S - SPAWN_GAIN_S * seconds) };
  }

  protected advance(dt: number): void {
    const seconds = this.roundMs / 1000;
    for (const h of this.holes) {
      if (h.kind === 'empty') continue;
      h.left -= dt;
      if (h.left <= 0) {
        // A mole that goes down on someone who never tapped it costs them a life.
        if (this.endless && h.kind === 'mole') for (const p of this.players.values()) if (p.alive && !h.by.includes(p.id)) this.loseLife(p);
        setHole(h, 'empty', 0, 0, 0);
      }
    }

    this.spawnIn -= dt;
    while (this.spawnIn <= 0) {
      const { upS, gapS } = this.pace(seconds);
      this.spawnMole(upS);
      this.spawnIn += gapS;
      if (--this.untilPause <= 0) {
        // The grid is left to empty (the last mole's full time), then nothing comes up for a beat.
        this.untilPause = PAUSE_EVERY_MIN + Math.floor(this.rng() * (PAUSE_EVERY_EXTRA + 1));
        this.spawnIn += upS + PAUSE_MIN_S + this.rng() * PAUSE_EXTRA_S;
      }
    }

    if (!this.endless && seconds >= ROUND_S) this.finishRound();
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
  private spawnMole(upS: number): void {
    const free = this.holes.map((h, i) => (h.kind === 'empty' ? i : -1)).filter((i) => i >= 0);
    // Always take the random numbers, so a full grid does not change what comes next.
    const pick = this.rng();
    const bomb = !this.lastWasBomb && this.rng() < BOMB_CHANCE;
    if (free.length === 0) return;
    this.lastWasBomb = bomb;
    setHole(this.holes[free[Math.floor(pick * free.length)]], bomb ? 'bomb' : 'mole', ++this.spawned, upS, upS);
  }
}
