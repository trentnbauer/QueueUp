import { CONVEYOR_CRATE_H, CONVEYOR_CRATE_W, CONVEYOR_JUMP_H, CONVEYOR_JUMP_S, CONVEYOR_PIT_W, CONVEYOR_PLAYER_W, CONVEYOR_PLAYER_X, CONVEYOR_STACK_H, type ConveyorObstacle, type ConveyorSnapshot } from '../spinLobby.js';
import { RoundGame, type RoundPlayer } from './roundGame.js';

// x runs 0..1 across; the belt carries everything from the left toward the player, who stands at CONVEYOR_PLAYER_X. Heights are in screens above the belt.
/** How fast the belt runs: from this, and quicker by this every second of the run (no top speed, so it always ends). */
const SPEED_START = 0.5;
const SPEED_GAIN = 0.008;
/** The time between one obstacle reaching you and the next: this long at first, shorter by this every second, never less than a jump takes plus this (so there is always time to land and go again, until you cannot press that fast). */
const SPACING_START = 1.5;
const SPACING_SHRINK = 0.012;
const LANDING_SLACK = 0.07;
/** A beat of extra waiting, added at random (none, one or two of them), so the rhythm is not a metronome. */
const BEAT = 0.15;
/** A tap just before landing is kept and starts the next jump the moment you land. */
const BUFFER_S = 0.1;
/** From this long in, some obstacles are tall stacks (the jump has to be at its highest to clear one), more and more of them. */
const STACKS_FROM_S = 15;
const STACK_SHARE_MAX = 0.4;
/** Pits show up from the start in about one obstacle in three, and the later they come the longer they are (so in the end one is longer than a jump can clear). */
const PIT_SHARE = 0.33;
const PIT_GROWTH = 0.006;
const FIRST_AT_S = 2.5;
/** An obstacle is made once it is this far (screens) before the left edge of the screen. */
const AHEAD = 0.15;

interface Runner extends RoundPlayer {
  /** Seconds since the jump began, or -1 on the belt. */
  jump: number;
  /** A tap in the last moments of a jump, waiting to start the next one. */
  queued: number;
}

interface Obstacle {
  n: number;
  kind: ConveyorObstacle['kind'];
  /** When (seconds into the run) it reaches the player. */
  at: number;
}

const r3 = (n: number) => Math.round(n * 1000) / 1000;

/** How long a pit is that reaches the player `at` seconds into the run. */
export function pitWidth(at: number): number {
  return CONVEYOR_PIT_W + PIT_GROWTH * Math.max(0, at);
}

/** How high a jump is `jump` seconds after it began: an arc up and back down over CONVEYOR_JUMP_S. */
export function jumpHeight(jump: number): number {
  if (jump < 0 || jump >= CONVEYOR_JUMP_S) return 0;
  const u = jump / CONVEYOR_JUMP_S;
  return 4 * CONVEYOR_JUMP_H * u * (1 - u);
}

/** Things ride a conveyor belt toward you: crates, tall stacks and pits. Tap to jump over each as it reaches you. They come in a rhythm that gets tighter and quicker until
 * you cannot press fast enough. Everyone is on the same belt, and never touches (see RoundGame.clientSim). See RoundGame for how runs start and end. */
export class ConveyorGame extends RoundGame<Runner> {
  readonly id = 'conveyor' as const;
  private obstacles: Obstacle[] = [];
  private made = 0;
  /** When the next obstacle to be made reaches the player. */
  private nextAt = FIRST_AT_S;

  get clientSim(): boolean {
    return true;
  }

  protected readReport(p: Runner, f: Record<string, number>): void {
    const j = RoundGame.num(f.j, p.jump);
    p.jump = j < 0 ? -1 : Math.min(CONVEYOR_JUMP_S, j);
  }

  protected writeReport(p: Runner): Record<string, number> {
    return { j: r3(p.jump) };
  }

  protected createPlayer(id: string, alive: boolean): Runner {
    return { id, jump: -1, queued: 0, alive, wins: 0, outAtMeters: 0 };
  }

  protected resetPlayer(p: Runner): void {
    p.jump = -1;
    p.queued = 0;
  }

  protected resetCourse(): void {
    this.obstacles = [];
    this.made = 0;
    this.nextAt = FIRST_AT_S;
  }

  protected beginCourse(): void {
    this.resetCourse();
    this.lay();
  }

  input(): void {
    // Tapping to jump is all there is to do.
  }

  action(userId: string, name: string): void {
    if (name !== 'jump') return;
    const p = this.players.get(userId);
    if (!p || !p.alive || this.phase !== 'playing') return;
    if (p.jump < 0) p.jump = 0;
    else p.queued = BUFFER_S;
  }

  /** How fast the belt runs `seconds` into the run, and how far everything on it has come by then (the area under that, a screen at a time). */
  private speedAt(seconds: number): number {
    return SPEED_START + SPEED_GAIN * seconds;
  }

  private travelled(seconds: number): number {
    return SPEED_START * seconds + (SPEED_GAIN * seconds * seconds) / 2;
  }

  /** Where an obstacle is across the screen `seconds` into the run: it reaches the player at its own time. */
  private xOf(o: Obstacle, seconds: number): number {
    return CONVEYOR_PLAYER_X - (this.travelled(o.at) - this.travelled(seconds));
  }

  /** Makes the obstacles that are about to come into view, in a rhythm. Always takes the same three random numbers for each, so one does not change the ones after it. */
  private lay(): void {
    const seconds = this.roundMs / 1000;
    while (this.xOf({ n: 0, kind: 'crate', at: this.nextAt }, seconds) > -AHEAD) {
      const [kindAt, stackAt, beats] = [this.rng(), this.rng(), this.rng()];
      const share = this.nextAt < STACKS_FROM_S ? 0 : Math.min(STACK_SHARE_MAX, ((this.nextAt - STACKS_FROM_S) / 60) * STACK_SHARE_MAX);
      const kind: ConveyorObstacle['kind'] = kindAt < PIT_SHARE ? 'pit' : stackAt < share ? 'stack' : 'crate';
      this.obstacles.push({ n: ++this.made, kind, at: this.nextAt });
      const spacing = Math.max(CONVEYOR_JUMP_S + LANDING_SLACK, SPACING_START - SPACING_SHRINK * this.nextAt);
      this.nextAt += spacing + BEAT * Math.floor(beats * 3);
    }
  }

  snapshot(): ConveyorSnapshot {
    const seconds = this.roundMs / 1000;
    return {
      id: 'conveyor',
      phase: this.phase,
      meters: this.meters,
      speed: this.phase === 'playing' ? r3(this.speedAt(seconds)) : 0,
      timerMs: Math.max(0, Math.round(this.timerMs)),
      winnerId: this.winnerId,
      ...this.summary(),
      obstacles: this.obstacles.map((o): ConveyorObstacle => ({ n: o.n, kind: o.kind, x: r3(this.xOf(o, seconds)), w: o.kind === 'pit' ? r3(pitWidth(o.at)) : CONVEYOR_CRATE_W })),
      players: [...this.players.values()].map((p) => ({
        id: p.id,
        h: r3(jumpHeight(p.jump)),
        jumping: p.jump >= 0,
        alive: p.alive,
        wins: p.wins,
        meters: p.alive && this.phase === 'playing' ? this.meters : p.outAtMeters,
      })),
    };
  }

  protected advance(dt: number): void {
    const seconds = this.roundMs / 1000;
    this.distance += this.speedAt(seconds) * dt;
    this.lay();
    this.obstacles = this.obstacles.filter((o) => this.xOf(o, seconds) < 1.1);
    for (const p of this.players.values()) {
      if (!p.alive || !this.simulated(p)) continue;
      if (p.jump >= 0) {
        p.jump += dt;
        if (p.jump >= CONVEYOR_JUMP_S) {
          // Landed: a tap kept from just before starts the next jump at once.
          p.jump = p.queued > 0 ? 0 : -1;
          p.queued = 0;
        }
      }
      if (p.queued > 0) p.queued = Math.max(0, p.queued - dt);
      if (this.hit(p, seconds)) this.knockOut(p);
    }
  }

  /** Touching something: on the belt over a pit, or lower than a crate or stack that is where you are. */
  private hit(p: Runner, seconds: number): boolean {
    const h = jumpHeight(p.jump);
    for (const o of this.obstacles) {
      const dx = Math.abs(this.xOf(o, seconds) - CONVEYOR_PLAYER_X);
      if (o.kind === 'pit') {
        // Falls when the middle of the player is over the pit and they are on the belt.
        if (dx < pitWidth(o.at) / 2 && h < 0.01) return true;
      } else if (dx < (CONVEYOR_CRATE_W + CONVEYOR_PLAYER_W) / 2 && h < (o.kind === 'stack' ? CONVEYOR_STACK_H : CONVEYOR_CRATE_H)) return true;
    }
    return false;
  }
}
