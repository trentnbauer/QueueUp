import type { RedLightSnapshot, RedLightState } from '../spinLobby.js';
import { RoundGame, type RoundPlayer } from './roundGame.js';
import type { BotBrain } from './types.js';

/** How fast a runner moves while holding the button, in track lengths per second (about 10s to cross). */
const RUN_SPEED = 0.1;
/** The green light lasts this long (plus up to GREEN_EXTRA_S more), then flashes for WARN_S, then goes red. */
const GREEN_MIN_S = 1.4;
const GREEN_EXTRA_S = 2.4;
const WARN_S = 0.6;
const RED_MIN_S = 1.2;
const RED_EXTRA_S = 1.2;
/** After the light goes red, moving is allowed for this long, so a slow connection is not punished. */
const GRACE_S = 0.25;
/** Quick first green, so the run starts right away. */
const FIRST_GREEN_S = 2;
/** A run that nobody finishes ends here: the one furthest along wins (a tie is a draw). */
const TIME_LIMIT_S = 45;
const METERS_PER_SCREEN = 20;

interface Runner extends RoundPlayer {
  x: number;
  /** Holding the run button. */
  running: boolean;
}

/** Hold to run while the light is green; let go the moment it turns red or you are out. First across the
 * line wins. See RoundGame for how runs start and end. */
export class RedLightGame extends RoundGame<Runner> {
  readonly id = 'redlight' as const;
  /** A race needs someone to race. */
  readonly minPlayers = 2;
  private light: RedLightState = 'green';
  private lightLeft = FIRST_GREEN_S;
  /** Seconds since the light went red. */
  private redFor = 0;

  protected createPlayer(id: string, alive: boolean): Runner {
    return { id, x: 0, running: false, alive, wins: 0, outAtMeters: 0 };
  }

  protected resetPlayer(p: Runner): void {
    p.x = 0;
    p.running = false;
  }

  protected resetCourse(): void {
    this.light = 'green';
    this.lightLeft = FIRST_GREEN_S;
    this.redFor = 0;
  }

  protected beginCourse(): void {
    this.resetCourse();
  }

  /** Metres the leader has run. */
  protected get meters(): number {
    return Math.floor(this.leaderX() * METERS_PER_SCREEN);
  }

  input(userId: string, dx: number, _dy?: number): void {
    const p = this.players.get(userId);
    if (p) p.running = dx > 0;
  }

  action(): void {
    // Holding the run button is all there is to do.
  }

  snapshot(): RedLightSnapshot {
    const r3 = (n: number) => Math.round(n * 1000) / 1000;
    return {
      id: 'redlight',
      phase: this.phase,
      meters: this.meters,
      speed: 0,
      light: this.light,
      timerMs: Math.max(0, Math.round(this.timerMs)),
      winnerId: this.winnerId,
      ...this.summary(),
      players: [...this.players.values()].map((p) => ({
        id: p.id,
        x: r3(p.x),
        running: p.running && p.alive,
        alive: p.alive,
        wins: p.wins,
        meters: p.alive && this.phase === 'playing' ? Math.floor(p.x * METERS_PER_SCREEN) : p.outAtMeters,
      })),
    };
  }

  protected advance(dt: number): void {
    this.stepLight(dt);
    const caughtMoving = this.light === 'red' && this.redFor > GRACE_S;

    for (const p of this.players.values()) {
      if (!p.alive || !p.running) continue;
      if (caughtMoving) {
        this.out(p);
        continue;
      }
      p.x = Math.min(1, p.x + RUN_SPEED * dt);
    }

    const alive = [...this.players.values()].filter((p) => p.alive);
    const finisher = alive.find((p) => p.x >= 1);
    if (finisher) {
      this.finish(alive, finisher);
    } else if (this.roundMs / 1000 >= TIME_LIMIT_S) {
      const best = Math.max(...alive.map((p) => p.x));
      const leaders = alive.filter((p) => p.x === best);
      // A tie for the lead is a draw: everyone is out.
      this.finish(alive, leaders.length === 1 ? leaders[0] : null);
    }
  }

  /** Ends the run: everyone but `winner` is out. A lone runner who finishes ends their own run with no winner. */
  private finish(alive: Runner[], winner: Runner | null): void {
    const alone = alive.length === 1;
    for (const p of alive) {
      if (p === winner && !alone) continue;
      this.out(p);
    }
  }

  /** Knocks someone out, recording how far they themselves got (not how far the leader is). */
  private out(p: Runner): void {
    this.knockOut(p);
    p.outAtMeters = Math.floor(p.x * METERS_PER_SCREEN);
  }

  private stepLight(dt: number): void {
    if (this.light === 'red') this.redFor += dt;
    this.lightLeft -= dt;
    if (this.lightLeft > 0) return;
    if (this.light === 'green') {
      this.light = 'warn';
      this.lightLeft += WARN_S;
    } else if (this.light === 'warn') {
      this.light = 'red';
      this.redFor = 0;
      this.lightLeft += RED_MIN_S + this.rng() * RED_EXTRA_S;
    } else {
      this.light = 'green';
      this.lightLeft += GREEN_MIN_S + this.rng() * GREEN_EXTRA_S;
    }
  }

  private leaderX(): number {
    let best = 0;
    for (const p of this.players.values()) if (p.x > best) best = p.x;
    return best;
  }
}

/** How a bot plays: starts a moment after the light turns green, now and then stops for a breather, and
 * usually stops when the light flashes. Sometimes it stops late (just inside the grace time), and once in
 * a while it gets it wrong and runs through the red, so it can be caught. */
export function redLightBrain(id: string, rng: () => number): BotBrain {
  let seen: RedLightState = 'green';
  let mode: 'run' | 'stop' | 'late' | 'oops' = 'run';
  let startIn = 0.2 + rng() * 0.3;
  let pause = 0;
  let lateLeft = 0;
  return (snap, dtMs) => {
    if (snap.id !== 'redlight' || snap.phase !== 'playing') return { dx: 0 };
    if (!snap.players.find((p) => p.id === id)?.alive) return { dx: 0 };
    const dt = dtMs / 1000;
    if (snap.light !== seen) {
      seen = snap.light;
      if (seen === 'green') {
        startIn = 0.1 + rng() * 0.3;
        mode = 'run';
      } else if (seen === 'warn') {
        const roll = rng();
        mode = roll < 0.75 ? 'stop' : roll < 0.94 ? 'late' : 'oops';
      } else {
        lateLeft = 0.1;
      }
    }
    if (startIn > 0) {
      startIn -= dt;
      return { dx: 0 };
    }
    if (seen === 'warn') return { dx: mode === 'stop' ? 0 : 1 };
    if (seen === 'red') {
      if (mode === 'oops') return { dx: 1 };
      lateLeft -= dt;
      return { dx: mode === 'late' && lateLeft > 0 ? 1 : 0 };
    }
    if (pause > 0) pause -= dt;
    else if (rng() < dt * 0.15) pause = 0.4 + rng() * 0.8;
    return { dx: pause > 0 ? 0 : 1 };
  };
}
