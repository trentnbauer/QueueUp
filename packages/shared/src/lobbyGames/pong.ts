import { PONG_BALL_R, PONG_PADDLE_LENGTH, PONG_PADDLE_THICKNESS, PONG_SEATS, clampDirection, type PongSnapshot } from '../spinLobby.js';
import { RoundGame, type RoundPlayer } from './roundGame.js';
import type { BotBrain } from './types.js';

const PADDLE_SPEED = 0.75;
const BALL_START = 0.5;
const BALL_GAIN = 0.035; // per return
const BALL_MAX = 1.3;
/** How much of a hit's speed goes sideways when it lands at the very end of a paddle (0 is straight back). */
const ENGLISH = 0.7;
/** The ball waits at the middle this long before each serve. */
const SERVE_S = 1.1;
/** At most this many players play at once, one on each side of the court. */
const MAX_SEATS = PONG_SEATS;

interface Paddler extends RoundPlayer {
  /** Which side: 0 bottom, 1 top, 2 left, 3 right; -1 while they sit this run out. */
  seat: number;
  /** Where the middle of their paddle is along their side (0..1). */
  pos: number;
  /** -1, 0 or 1: the direction they are holding (for the side paddles, -1 is up). */
  dir: number;
  /** Returns this run. */
  hits: number;
}

/** A ball bounces round one shared court. Each player has a paddle along their own side; miss the ball and you are out, and your
 * side becomes a wall. The ball speeds up with every return. Last player in wins. Needs 2 players, so on your own a bot plays
 * you; with more than 4, the first four (in turn) play and the rest watch. See RoundGame for how runs start and end. */
export class PongGame extends RoundGame<Paddler> {
  readonly id = 'pong' as const;
  readonly minPlayers = 2;
  private bx = 0.5;
  private by = 0.5;
  private vx = 0;
  private vy = 0;
  private speed = BALL_START;
  private serveIn = 0;
  private returns = 0;

  /** The score shown for the run: the returns so far. */
  protected get meters(): number {
    return this.returns;
  }

  protected createPlayer(id: string, alive: boolean): Paddler {
    return { id, seat: -1, pos: 0.5, dir: 0, hits: 0, alive, wins: 0, outAtMeters: 0 };
  }

  protected resetPlayer(p: Paddler): void {
    p.pos = 0.5;
    p.dir = 0;
    p.hits = 0;
  }

  protected resetCourse(): void {
    this.bx = 0.5;
    this.by = 0.5;
    this.vx = 0;
    this.vy = 0;
    this.speed = BALL_START;
    this.serveIn = 0;
    this.returns = 0;
    for (const p of this.players.values()) p.seat = -1;
  }

  protected beginCourse(): void {
    this.resetCourse();
    // The first four take a side each, starting from a different player every run; the rest watch this one.
    const ring = [...this.players.values()].filter((p) => p.alive);
    const start = ring.length > 0 ? (Math.max(0, this.record.run - 1)) % ring.length : 0;
    const order = [...ring.slice(start), ...ring.slice(0, start)];
    order.forEach((p, i) => {
      if (i < MAX_SEATS) p.seat = i;
      else p.alive = false;
    });
    this.serve();
  }

  input(userId: string, dx: number, _dy?: number): void {
    const p = this.players.get(userId);
    if (p) p.dir = clampDirection(dx);
  }

  action(): void {
    // Sliding the paddle is all there is to do.
  }

  snapshot(): PongSnapshot {
    const r3 = (n: number) => Math.round(n * 1000) / 1000;
    return {
      id: 'pong',
      phase: this.phase,
      meters: this.meters,
      speed: 0,
      timerMs: Math.max(0, Math.round(this.timerMs)),
      winnerId: this.winnerId,
      ...this.summary(),
      ball: { x: r3(this.bx), y: r3(this.by) },
      serving: this.serveIn > 0,
      players: [...this.players.values()].map((p) => ({ id: p.id, alive: p.alive, wins: p.wins, meters: p.alive ? p.hits : p.outAtMeters, seat: p.seat, pos: r3(p.pos), dir: p.dir })),
    };
  }

  /** Puts the ball in the middle and sends it off at a slant, at the starting speed. */
  private serve(): void {
    this.bx = 0.5;
    this.by = 0.5;
    this.speed = Math.min(BALL_MAX, BALL_START + BALL_GAIN * Math.floor(this.returns / 2));
    const angle = ((Math.floor(this.rng() * 4) + 0.5) * Math.PI) / 2 + (this.rng() - 0.5) * 0.6;
    this.vx = Math.cos(angle) * this.speed;
    this.vy = Math.sin(angle) * this.speed;
    this.serveIn = SERVE_S;
  }

  protected advance(dt: number): void {
    const half = PONG_PADDLE_LENGTH / 2;
    for (const p of this.players.values()) {
      if (!p.alive || p.seat < 0) continue;
      p.pos = Math.min(1 - half, Math.max(half, p.pos + p.dir * PADDLE_SPEED * dt));
    }
    if (this.serveIn > 0) {
      this.serveIn -= dt;
      return;
    }
    this.bx += this.vx * dt;
    this.by += this.vy * dt;
    for (let seat = 0; seat < MAX_SEATS; seat++) this.edge(seat);
  }

  /** The ball against one side: a paddle sends it back, no paddle (or an empty or knocked-out seat) is a wall, and a missed
   * paddle costs its owner the run. */
  private edge(seat: number): void {
    const horizontal = seat < 2; // bottom and top sides run along x
    const at = seat === 0 || seat === 3 ? 1 : 0; // the side's coordinate on the axis the ball crosses
    const d = at === 1 ? 1 : -1;
    const face = at - d * PONG_PADDLE_THICKNESS;
    const across = horizontal ? this.by : this.bx;
    const along = horizontal ? this.bx : this.by;
    const vAcross = horizontal ? this.vy : this.vx;
    if (vAcross * d <= 0) return;
    const owner = [...this.players.values()].find((p) => p.alive && p.seat === seat);
    if (owner) {
      if ((across - face) * d + PONG_BALL_R < 0) return;
      if (Math.abs(along - owner.pos) <= PONG_PADDLE_LENGTH / 2 + PONG_BALL_R) {
        this.bounce(horizontal, d, face, (along - owner.pos) / (PONG_PADDLE_LENGTH / 2));
        owner.hits++;
        this.returns++;
      } else if ((across - at) * d > PONG_BALL_R) {
        // Past the side with no paddle there: they are out.
        this.knockOut(owner);
        owner.outAtMeters = owner.hits;
        if (this.phase === 'playing') this.serve();
      }
      return;
    }
    if ((across - at) * d + PONG_BALL_R >= 0) {
      if (horizontal) {
        this.by = at - d * PONG_BALL_R;
        this.vy = -this.vy;
      } else {
        this.bx = at - d * PONG_BALL_R;
        this.vx = -this.vx;
      }
    }
  }

  /** Sends the ball back off a paddle, faster, slanted by where on the paddle it landed (-1 to 1 from the middle). */
  private bounce(horizontal: boolean, d: number, face: number, offset: number): void {
    this.speed = Math.min(BALL_MAX, this.speed + BALL_GAIN);
    const side = Math.max(-1, Math.min(1, offset)) * ENGLISH;
    const forward = Math.sqrt(1 - side * side);
    if (horizontal) {
      this.by = face - d * PONG_BALL_R;
      this.vy = -d * forward * this.speed;
      this.vx = side * this.speed;
    } else {
      this.bx = face - d * PONG_BALL_R;
      this.vx = -d * forward * this.speed;
      this.vy = side * this.speed;
    }
  }

  protected override runScore(p: Paddler): number {
    return p.alive ? p.hits : p.outAtMeters;
  }
}

/** A bot that follows the ball along its own side with a lag and an error, so it can be beaten. */
export function pongBrain(id: string, rng: () => number): BotBrain {
  let error = (rng() - 0.5) * 0.08;
  let lastHits = -1;
  return (snap) => {
    if (snap.id !== 'pong' || snap.phase !== 'playing') return { dx: 0 };
    const me = snap.players.find((p) => p.id === id);
    if (!me?.alive || me.seat < 0) return { dx: 0 };
    if (snap.meters !== lastHits) {
      lastHits = snap.meters;
      error = (rng() - 0.5) * 0.09;
    }
    const along = me.seat < 2 ? snap.ball.x : snap.ball.y;
    const want = along + error;
    if (Math.abs(want - me.pos) < 0.025) return { dx: 0 };
    return { dx: want > me.pos ? 1 : -1 };
  };
}
