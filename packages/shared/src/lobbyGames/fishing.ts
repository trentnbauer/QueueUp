import { FISHING_TIERS, clampDirection, type FishingFish, type FishingMode, type FishingSnapshot } from '../spinLobby.js';
import { RoundGame, mulberry32, type RoundPlayer } from './roundGame.js';

// The pond fills the arena, 0 to 1 across and down (y grows downward). The anglers stand along the bottom and cast up the pond.
const ROD_Y = 0.9;
const WATER_TOP = 0.07;
/** How far up the pond a cast can reach, from the rod: a weak one and a full-power one. */
const CAST_MIN = 0.1;
const CAST_MAX = 0.74;
/** Holding to cast, the power runs 0 to 1 and back in this long each way. */
const CHARGE_S = 1.1;
/** The lure flies out at this speed and is wound back in at the other (arenas a second). */
const CAST_SPEED = 1.7;
const WIND_SPEED = 0.4;
/** How close a fish's middle must come to the lure's to take it, on top of the fish's own size. */
const LURE_R = 0.03;
/** Nothing hooked for this long and the line goes slack, which costs a line. */
const DRY_LIMIT_S = 25;
const LIVES = 3;
/** The health bar: this much to start, drained every second (more as the run goes on, so a run always ends) and refilled by each fish landed by
 * its points times HP_PER_POINT. Out at 0. The score is the most it has ever been. */
const HP_START = 10;
const HP_DRAIN = 0.5;
const HP_DRAIN_GAIN = 0.03;
const HP_PER_POINT = 5;
const FISH_Y_MAX = 0.8;
const INITIAL_FISH = 9;
/** Everything gets harder over this long, then stays as hard. */
const RAMP_S = 60;

// The reeling bar, 0 at the top to 1 at the bottom. Holding pulls the green zone up and letting go lets it sink; keep the fish in it.
const REEL_ACCEL = 2.4;
const SINK_ACCEL = 1.6;
const MAX_SPEED = 1.4;
const BOUNCE = 0.25;
const ZONE_MIN = 0.04;
const ZONE_MAX = 0.96;
const MARK_MIN = 0.08;
const MARK_MAX = 0.92;
const CATCH_DRAIN = 0.15;
const HEALTH_MEND = 0.2;

/** Each kind of fish (see FISHING_TIERS for its size and points): how often it turns up, the band of the pond it swims in, how fast it
 * swims, and how hard it fights: the green zone's half height, how fast the fish darts about the bar and how far, how long it rests, how fast the
 * catch fills in the green, and how fast the line wears outside it. Bigger fish are worth more, swim further up the pond and fight harder. */
const KINDS = [
  { weight: 50, y: [0.5, 0.74], speed: 0.15, zone: 0.28, dart: 0.22, jump: 0.2, rest: 1.6, gain: 0.8, wear: 0.12 },
  { weight: 28, y: [0.36, 0.66], speed: 0.12, zone: 0.25, dart: 0.3, jump: 0.25, rest: 1.4, gain: 0.6, wear: 0.16 },
  { weight: 16, y: [0.22, 0.52], speed: 0.1, zone: 0.22, dart: 0.38, jump: 0.35, rest: 1.1, gain: 0.45, wear: 0.2 },
  { weight: 6, y: [0.12, 0.36], speed: 0.08, zone: 0.19, dart: 0.45, jump: 0.45, rest: 0.9, gain: 0.35, wear: 0.25 },
] as const;

const lerp = (a: number, b: number, d: number) => a + (b - a) * d;
const r3 = (n: number) => Math.round(n * 1000) / 1000;

/** A fish's whole swim is a function of the run's time, so every device and the server have it in the same place. */
interface Fish {
  n: number;
  tier: number;
  /** When it appeared (seconds into the run), where, and which way it swims. */
  at: number;
  x0: number;
  dir: 1 | -1;
  speed: number;
  base: number;
  a1: number;
  f1: number;
  p1: number;
  a2: number;
  f2: number;
  p2: number;
  /** Seeds how it fights once hooked. */
  seed: number;
}

function fishAt(f: Fish, t: number): { x: number; y: number } {
  const age = t - f.at;
  const y = f.base + f.a1 * Math.sin(f.f1 * age + f.p1) + f.a2 * Math.sin(f.f2 * age + f.p2);
  return { x: f.x0 + f.dir * f.speed * age, y: Math.min(FISH_Y_MAX, Math.max(WATER_TOP + FISHING_TIERS[f.tier].r, y)) };
}

type Mode = FishingMode | 'casting';

interface Angler extends RoundPlayer {
  /** Where along the bottom they fish: set when the run begins, or by `seat` on a device that plays only this one. */
  x: number;
  mode: Mode;
  holding: boolean;
  /** A press or a release since the last step (so a quick tap is not lost between steps). */
  pressed: boolean;
  released: boolean;
  ly: number;
  castTo: number;
  power: number;
  powerDir: 1 | -1;
  /** The fish on the line (its number and kind), or -1. */
  hooked: number;
  tier: number;
  /** The fish this angler has already had a go at: they cannot take it again. */
  taken: Set<number>;
  fight: () => number;
  zone: number;
  zoneV: number;
  mark: number;
  markTo: number;
  rest: number;
  health: number;
  catch: number;
  hp: number;
  /** The most health they have had this run (their score). */
  peak: number;
  lives: number;
  /** Seconds since a fish was hooked (or the run began). */
  dry: number;
}

/** Cast a lure up the pond and a fish takes it: hold to cast (the longer you hold, the further it goes, up to full power) and let go,
 * then hold to wind the lure in, so you set it where the fish swim past. A fish that touches the lure is hooked, and then you hold to
 * reel it in: keep the fish inside the green zone, which you raise by holding and let sink by letting go. Fill the catch and you land it;
 * wear the line out and it snaps. Fish are worth more the bigger they are, and fight harder: landing one refills the health bar that drains
 * all the time, and a score is the most health it has had. Three lines (a snap, or a long wait for a
 * bite, costs one); last one fishing wins. Players never touch each other, so each device works out its own angler against the same
 * fish (see RoundGame.clientSim). See RoundGame for how runs start and end. */
export class FishingGame extends RoundGame<Angler> {
  readonly id = 'fishing' as const;
  private fish: Fish[] = [];
  private fishCount = 0;
  private nextSpawn = 0;
  /** Scales how fast the health bar drains (1 in play): a test about lines, not health, sets it to 0. */
  hpDrainScale = 1;
  /** What the run reports as its score, set when it ends (the winner's own peak health rather than the best of anyone). */
  private finalScore: number | null = null;

  /** The score shown for the run: the highest peak health anyone has. */
  protected get meters(): number {
    if (this.finalScore !== null) return this.finalScore;
    let best = 0;
    for (const p of this.players.values()) best = Math.max(best, Math.floor(p.peak));
    return best;
  }

  get clientSim(): boolean {
    return true;
  }

  private static readonly MODE_CODES: Mode[] = ['idle', 'charging', 'out', 'fight'];

  protected readReport(p: Angler, f: Record<string, number>): void {
    const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
    const mode = FishingGame.MODE_CODES[Math.floor(RoundGame.num(f.md, 0))] ?? 'idle';
    p.mode = mode;
    p.ly = clamp(RoundGame.num(f.ly, p.ly), ROD_Y - CAST_MAX, ROD_Y);
    p.power = clamp(RoundGame.num(f.pw, p.power), 0, 1);
    p.zone = clamp(RoundGame.num(f.z, p.zone), ZONE_MIN, ZONE_MAX);
    p.zoneV = clamp(RoundGame.num(f.zv, p.zoneV), -MAX_SPEED, MAX_SPEED);
    p.mark = clamp(RoundGame.num(f.mk, p.mark), MARK_MIN, MARK_MAX);
    p.health = clamp(RoundGame.num(f.h, p.health), 0, 1);
    p.catch = clamp(RoundGame.num(f.c, p.catch), 0, 1);
    p.tier = mode === 'fight' ? Math.min(FISHING_TIERS.length - 1, Math.max(0, Math.floor(RoundGame.num(f.tr, 0)))) : -1;
    // No more than the biggest fish's worth of health more than before at a time: a device cannot land a pile of fish in one report.
    const biggest = FISHING_TIERS[FISHING_TIERS.length - 1].points * HP_PER_POINT;
    p.hp = clamp(RoundGame.num(f.hp, p.hp), 0, p.hp + biggest);
    p.peak = Math.max(p.peak, p.hp);
    // Never more lines than before.
    p.lives = Math.min(p.lives, Math.max(0, Math.floor(RoundGame.num(f.lv, p.lives))));
    p.dry = clamp(RoundGame.num(f.dr, p.dry), 0, DRY_LIMIT_S);
  }

  protected writeReport(p: Angler): Record<string, number> {
    const mode = p.mode === 'casting' ? 'out' : p.mode;
    return {
      md: FishingGame.MODE_CODES.indexOf(mode),
      ly: r3(p.ly),
      pw: r3(p.power),
      z: r3(p.zone),
      zv: r3(p.zoneV),
      mk: r3(p.mark),
      h: r3(p.health),
      c: r3(p.catch),
      tr: Math.max(0, p.tier),
      hp: r3(p.hp),
      lv: p.lives,
      dr: r3(p.dry),
    };
  }

  protected createPlayer(id: string, alive: boolean): Angler {
    const p = { id, alive, wins: 0, outAtMeters: 0, x: 0.5, taken: new Set<number>(), fight: mulberry32(0) } as Angler;
    this.resetPlayer(p);
    return p;
  }

  protected resetPlayer(p: Angler): void {
    p.mode = 'idle';
    p.holding = false;
    p.pressed = false;
    p.released = false;
    p.ly = ROD_Y;
    p.castTo = ROD_Y;
    p.power = 0;
    p.powerDir = 1;
    p.hooked = -1;
    p.tier = -1;
    p.taken.clear();
    p.zone = 0.5;
    p.zoneV = 0;
    p.mark = 0.5;
    p.markTo = 0.5;
    p.rest = 0;
    p.health = 1;
    p.catch = 0;
    p.hp = HP_START;
    p.peak = HP_START;
    p.lives = LIVES;
    p.dry = 0;
  }

  protected resetCourse(): void {
    this.fish = [];
    this.fishCount = 0;
    this.nextSpawn = 0;
    this.finalScore = null;
  }

  protected beginCourse(): void {
    this.resetCourse();
    // Seat everyone along the bottom, evenly: from here a place is theirs for the run.
    const all = [...this.players.values()];
    all.forEach((p, i) => (p.x = this.laneOf(i, all.length)));
    for (let i = 0; i < INITIAL_FISH; i++) this.spawn(0, true);
    this.nextSpawn = this.gap(0);
  }

  private laneOf(index: number, count: number): number {
    return r3(((index + 0.5) / Math.max(1, count)) * 0.84 + 0.08);
  }

  /** On a device that plays only this one angler: stand where the server put them. */
  seat(userId: string, x: number): void {
    const p = this.players.get(userId);
    if (p && Number.isFinite(x)) p.x = Math.min(0.95, Math.max(0.05, x));
  }

  input(userId: string, _dx: number, dy: number): void {
    const p = this.players.get(userId);
    if (!p) return;
    const holding = clampDirection(dy) === -1;
    if (holding && !p.holding) p.pressed = true;
    if (!holding && p.holding) p.released = true;
    p.holding = holding;
  }

  action(): void {
    // Holding the button is all there is to do.
  }

  protected override knockOut(p: Angler): void {
    super.knockOut(p);
    p.outAtMeters = Math.floor(p.peak);
  }

  /** At the time cap whoever is still fishing keeps the peak health they have had, and nobody wins. */
  protected override limitReached(): void {
    for (const p of this.players.values()) if (p.alive) p.outAtMeters = Math.floor(p.peak);
    this.endRun(null);
  }

  protected override endRun(winner: Angler | null): void {
    if (winner) this.finalScore = Math.floor(winner.peak);
    super.endRun(winner);
  }

  /** 0 at the start of the run, 1 once the pond has got as busy as it gets. */
  private diffAt(t: number): number {
    return Math.min(1, Math.max(0, t / RAMP_S));
  }

  /** How hard the fights are: 0 at the start and 1 after RAMP_S, but unlike the pond it keeps on climbing (to 8), so a run always ends in the end. */
  private get difficulty(): number {
    return this.phase === 'playing' ? Math.min(8, Math.max(0, this.roundMs / 1000 / RAMP_S)) : 0;
  }

  /** Seconds to the next fish after one that came at `at`: quicker as the run goes on. */
  private gap(at: number): number {
    return lerp(0.9, 0.5, this.diffAt(at)) * (0.7 + 0.6 * this.rng());
  }

  /** A fish arrives (at the edge, or anywhere for the first few). Always takes the same random numbers, so one choice does not change the ones after it. */
  private spawn(at: number, anywhere: boolean): void {
    const d = this.diffAt(at);
    // Small fish get rarer and big ones commoner as the run goes on.
    const weights = KINDS.map((k, i) => k.weight * (i === 0 ? 1 - 0.6 * d : i === 1 ? 1 - 0.3 * d : 1 + 0.5 * d));
    let roll = this.rng() * weights.reduce((a, b) => a + b, 0);
    let tier = 0;
    while (tier < weights.length - 1 && roll >= weights[tier]) roll -= weights[tier++];
    const k = KINDS[tier];
    const base = k.y[0] + this.rng() * (k.y[1] - k.y[0]);
    const dir = this.rng() < 0.5 ? -1 : 1;
    const speed = k.speed * (0.8 + 0.4 * this.rng()) * (1 + 0.5 * d);
    const a1 = 0.03 + 0.04 * this.rng();
    const f1 = 0.8 + 0.8 * this.rng();
    const p1 = this.rng() * Math.PI * 2;
    const a2 = 0.01 + 0.02 * this.rng();
    const f2 = 2 + 1.5 * this.rng();
    const p2 = this.rng() * Math.PI * 2;
    const seed = Math.floor(this.rng() * 4294967296);
    const anyX = 0.08 + 0.84 * this.rng();
    this.fish.push({ n: this.fishCount++, tier, at, x0: anywhere ? anyX : dir === 1 ? -0.1 : 1.1, dir, speed, base, a1, f1, p1, a2, f2, p2, seed });
  }

  /** Half the height of the green zone against this kind of fish now. */
  private zoneHalf(tier: number, d: number): number {
    return KINDS[tier].zone * Math.max(0.4, 1 - 0.2 * d);
  }

  snapshot(): FishingSnapshot {
    const t = this.phase === 'playing' || this.phase === 'over' ? this.roundMs / 1000 : 0;
    const d = this.difficulty;
    const all = [...this.players.values()];
    return {
      id: 'fishing',
      phase: this.phase,
      meters: this.meters,
      speed: 0,
      timerMs: Math.max(0, Math.round(this.timerMs)),
      winnerId: this.winnerId,
      ...this.summary(),
      fish: this.fish.map((f) => {
        const here = fishAt(f, t);
        const next = fishAt(f, t + 0.05);
        return { n: f.n, x: r3(here.x), y: r3(here.y), vx: r3((next.x - here.x) / 0.05), vy: r3((next.y - here.y) / 0.05), tier: f.tier } satisfies FishingFish;
      }),
      players: all.map((p, i) => ({
        id: p.id,
        // Seats are final once the run begins; before that they follow who is here.
        x: this.phase === 'playing' || this.phase === 'over' ? p.x : this.laneOf(i, all.length),
        mode: p.mode === 'casting' ? 'out' : p.mode,
        ly: r3(p.ly),
        power: r3(p.power),
        winding: p.mode === 'out' && p.holding,
        tier: p.mode === 'fight' ? p.tier : -1,
        hooked: p.mode === 'fight' ? p.hooked : -1,
        zone: r3(p.zone),
        zoneV: r3(p.zoneV),
        mark: r3(p.mark),
        half: r3(this.zoneHalf(Math.max(0, p.tier), d)),
        health: r3(p.health),
        catch: r3(p.catch),
        hp: r3(p.hp),
        peak: Math.floor(p.peak),
        lives: p.lives,
        patience: r3(Math.max(0, 1 - p.dry / DRY_LIMIT_S)),
        alive: p.alive,
        wins: p.wins,
        meters: p.alive && this.phase === 'playing' ? Math.floor(p.peak) : p.outAtMeters,
      })),
    };
  }

  protected advance(dt: number): void {
    const t = this.roundMs / 1000;
    while (t >= this.nextSpawn) {
      const at = this.nextSpawn;
      this.spawn(at, false);
      this.nextSpawn = at + this.gap(at);
    }
    // A fish that has swum out of the pond the way it was going is gone.
    this.fish = this.fish.filter((f) => {
      const x = fishAt(f, t).x;
      return f.dir === 1 ? x < 1.2 : x > -0.2;
    });
    const d = this.difficulty;
    for (const p of this.players.values()) {
      if (!p.alive || !this.simulated(p)) continue;
      p.hp -= (HP_DRAIN + HP_DRAIN_GAIN * t) * dt * this.hpDrainScale;
      if (p.hp <= 0) {
        p.hp = 0;
        this.knockOut(p);
        continue;
      }
      this.stepAngler(p, dt, t, d);
    }
  }

  private stepAngler(p: Angler, dt: number, t: number, d: number): void {
    const pressed = p.pressed;
    let released = p.released;
    p.pressed = false;
    p.released = false;

    if (p.mode === 'idle' && pressed) {
      p.mode = 'charging';
      p.power = 0;
      p.powerDir = 1;
      // Held on at the end of the step: a let-go in it came before this press (it ended the last hold), not after.
      if (p.holding) released = false;
    }
    if (p.mode === 'charging') {
      if (released || !p.holding) {
        p.castTo = ROD_Y - (CAST_MIN + p.power * (CAST_MAX - CAST_MIN));
        p.mode = 'casting';
      } else {
        p.power += (p.powerDir * dt) / CHARGE_S;
        if (p.power >= 1) {
          p.power = 1;
          p.powerDir = -1;
        } else if (p.power <= 0) {
          p.power = 0;
          p.powerDir = 1;
        }
      }
    }
    if (p.mode === 'casting') {
      p.ly = Math.max(p.castTo, p.ly - CAST_SPEED * dt);
      if (p.ly <= p.castTo) p.mode = 'out';
    } else if (p.mode === 'out' && p.holding) {
      p.ly += WIND_SPEED * dt;
      if (p.ly >= ROD_Y) {
        p.ly = ROD_Y;
        p.mode = 'idle';
      }
    }
    if (p.mode === 'out') this.tryHook(p, t);

    if (p.mode === 'fight') this.reel(p, dt, d);
    else {
      p.dry += dt;
      if (p.dry >= DRY_LIMIT_S) this.loseLine(p);
    }
  }

  /** The lure touches a fish it has not already had a go at: it is hooked. */
  private tryHook(p: Angler, t: number): void {
    for (const f of this.fish) {
      if (p.taken.has(f.n)) continue;
      const at = fishAt(f, t);
      const reach = LURE_R + FISHING_TIERS[f.tier].r;
      if ((at.x - p.x) ** 2 + (at.y - p.ly) ** 2 > reach * reach) continue;
      p.taken.add(f.n);
      p.mode = 'fight';
      p.hooked = f.n;
      p.tier = f.tier;
      p.fight = mulberry32(f.seed);
      p.zone = 0.5;
      p.zoneV = 0;
      p.mark = 0.5;
      p.markTo = 0.5;
      p.rest = 0.8; // a moment before the fish first darts
      p.catch = 0;
      p.health = 1;
      p.dry = 0;
      return;
    }
  }

  /** One step of reeling in: the zone follows the button, the fish darts about the bar, and the catch and the line follow whether it is in the green. */
  private reel(p: Angler, dt: number, d: number): void {
    const k = KINDS[p.tier];
    p.zoneV = Math.min(MAX_SPEED, Math.max(-MAX_SPEED, p.zoneV + (p.holding ? -REEL_ACCEL : SINK_ACCEL) * dt));
    p.zone += p.zoneV * dt;
    if (p.zone < ZONE_MIN || p.zone > ZONE_MAX) {
      p.zone = Math.min(ZONE_MAX, Math.max(ZONE_MIN, p.zone));
      p.zoneV = -p.zoneV * BOUNCE;
    }
    // The fish darts to a spot, rests, and darts to another, quicker and further as the run goes on.
    p.rest -= dt;
    if (p.rest <= 0) {
      const jump = (p.fight() * 2 - 1) * k.jump;
      const wait = 0.7 + 0.6 * p.fight();
      p.markTo = Math.min(MARK_MAX, Math.max(MARK_MIN, p.mark + jump));
      p.rest = (k.rest * wait) / (1 + 0.5 * d);
    }
    const speed = k.dart * (1 + 0.5 * d);
    const to = p.markTo - p.mark;
    p.mark = Math.abs(to) <= speed * dt ? p.markTo : p.mark + Math.sign(to) * speed * dt;

    if (Math.abs(p.mark - p.zone) <= this.zoneHalf(p.tier, d)) {
      p.catch += k.gain * dt;
      p.health = Math.min(1, p.health + HEALTH_MEND * dt);
    } else {
      p.catch = Math.max(0, p.catch - CATCH_DRAIN * dt);
      p.health -= k.wear * (1 + 0.5 * d) * dt;
    }
    if (p.catch >= 1) {
      p.hp += FISHING_TIERS[p.tier].points * HP_PER_POINT;
      p.peak = Math.max(p.peak, p.hp);
      this.reset(p);
    } else if (p.health <= 0) this.loseLine(p);
  }

  /** The lure is back at the rod, ready to cast. */
  private reset(p: Angler): void {
    p.mode = 'idle';
    p.ly = ROD_Y;
    p.power = 0;
    p.hooked = -1;
    p.tier = -1;
    p.catch = 0;
    p.health = 1;
    p.dry = 0;
  }

  /** A snapped line, or a wait for a bite that went on too long: one line gone, and out when none are left. */
  private loseLine(p: Angler): void {
    p.lives--;
    this.reset(p);
    if (p.lives <= 0) {
      p.lives = 0;
      this.knockOut(p);
    }
  }
}
