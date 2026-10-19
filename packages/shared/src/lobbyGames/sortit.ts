import { ENDLESS_LIVES, SORTIT_RULES, type SortitJudge, type SortitItem, type SortitSnapshot } from '../spinLobby.js';
import { RoundGame, type RoundPlayer } from './roundGame.js';

/** Over `RAMP_S` seconds: a new item every so often (quicker and quicker), each on the belt for less time before it reaches the line (less warning), and
 * the rule changing more often. The first value is where it starts, the second where it ends, and it stays there. */
const EVERY_S = [1.3, 0.38] as const;
const TRAVEL_S = [2.6, 1.3] as const;
const RULE_EVERY = [8, 5] as const;
const RAMP_S = 40;
/** The first item reaches the line after this long, so there is a moment to get going. */
const FIRST_S = 2.2;
/** After the rule changes there is this much more time before the next item, to read it. */
const RULE_PAUSE_S = 0.8;
/** An item can be sorted from when it is on the belt until this long after it reaches the line; after that it has got by. */
const GRACE_S = 0.35;
/** What a judgement says stays up this long (the view reads `agoMs`). */
const LASTING_MS = 600;

const lerp = (pair: readonly [number, number], d: number) => pair[0] + (pair[1] - pair[0]) * d;
const along = (seconds: number) => Math.min(1, Math.max(0, seconds / RAMP_S));

interface Item {
  n: number;
  /** Each 0 or 1: colour (red, blue), shape (circle, square) and size (small, big). */
  attr: [number, number, number];
  /** Which of the three the rule is for this item (0 colour, 1 shape, 2 size): the item goes left for 0 and right for 1 of that. */
  rule: number;
  /** Seconds into the run when it reaches the line, and how long it was on the belt before that. */
  at: number;
  travelS: number;
}

interface Sorter extends RoundPlayer {
  score: number;
  lives: number;
  /** The items (by number) they have sorted or let go by. */
  done: Set<number>;
  last: { kind: SortitJudge; at: number } | null;
}

/** Sort what rides the belt into two bins by a rule: by colour (red left, blue right), by shape (circle left, square right) or by size (small
 * left, big right). The rule changes every few items. Tap the bin (left or right): right is a point, wrong, or an item that gets past the line, costs a
 * life, and three lives is the end of your run. Everyone sorts the same belt, each at their own pace, and players never touch, so each device
 * works out its own sorting (see RoundGame.clientSim). It all gets quicker and the rule changes more often for 40 seconds. Last one in wins;
 * alone it is a high score (items sorted). See RoundGame for how runs start and end. */
export class SortitGame extends RoundGame<Sorter> {
  readonly id = 'sortit' as const;
  private items: Item[] = [];
  private spawned = 0;
  /** When (seconds into the run) the next item reaches the line. */
  private nextAt = FIRST_S;
  private rule = 0;
  private sinceRule = 0;

  get clientSim(): boolean {
    return true;
  }

  /** The most items anyone has sorted, counting those who are out. */
  protected get meters(): number {
    let best = 0;
    for (const p of this.players.values()) best = Math.max(best, p.alive ? p.score : p.outAtMeters);
    return best;
  }

  protected readReport(p: Sorter, f: Record<string, number>): void {
    // Items sorted only go up, one at a time; lives only go down.
    p.score = Math.max(p.score, Math.min(Math.floor(RoundGame.num(f.s, p.score)), p.score + 2));
    p.lives = Math.max(0, Math.min(p.lives, Math.floor(RoundGame.num(f.l, p.lives))));
  }

  protected writeReport(p: Sorter): Record<string, number> {
    return { s: p.score, l: p.lives };
  }

  protected createPlayer(id: string, alive: boolean): Sorter {
    return { id, score: 0, lives: ENDLESS_LIVES, done: new Set(), last: null, alive, wins: 0, outAtMeters: 0 };
  }

  protected resetPlayer(p: Sorter): void {
    p.score = 0;
    p.lives = ENDLESS_LIVES;
    p.done = new Set();
    p.last = null;
  }

  protected resetCourse(): void {
    this.items = [];
    this.spawned = 0;
    this.nextAt = FIRST_S;
    this.rule = 0;
    this.sinceRule = 0;
    this.lay(0);
  }

  protected beginCourse(): void {
    // The first items were laid when the countdown began.
  }

  input(): void {
    // The two bins are the controller: there is nothing to hold.
  }

  action(): void {
    // Tapping a bin is all there is to do.
  }

  protected override knockOut(p: Sorter): void {
    super.knockOut(p);
    p.outAtMeters = p.score;
  }

  /** At the time cap whoever is still in keeps their items, and nobody wins. */
  protected override limitReached(): void {
    for (const p of this.players.values()) if (p.alive) p.outAtMeters = p.score;
    this.endRun(null);
  }

  /** Lays every item that reaches the line up to a little after `seconds` plus the longest it spends on the belt. */
  private lay(seconds: number): void {
    while (this.nextAt <= seconds + TRAVEL_S[0] + 0.2) {
      const d = along(this.nextAt);
      // Always the same four random numbers for each item, so one item does not change the ones after it.
      const [colour, shape, size, change] = [this.rng(), this.rng(), this.rng(), this.rng()];
      let pause = 0;
      if (this.sinceRule >= Math.round(lerp(RULE_EVERY, d))) {
        // A new rule, never the same as the last.
        this.rule = (this.rule + 1 + Math.floor(change * (SORTIT_RULES - 1))) % SORTIT_RULES;
        this.sinceRule = 0;
        pause = RULE_PAUSE_S;
      }
      this.sinceRule++;
      const at = this.nextAt + pause;
      this.items.push({ n: ++this.spawned, attr: [colour < 0.5 ? 0 : 1, shape < 0.5 ? 0 : 1, size < 0.5 ? 0 : 1], rule: this.rule, at, travelS: lerp(TRAVEL_S, d) });
      this.nextAt = at + lerp(EVERY_S, d);
    }
  }

  /** `side` is the bin tapped: 0 for the left, 1 for the right. Sorts the oldest item on the belt that has not been dealt with. */
  tap(userId: string, side: number): void {
    const p = this.players.get(userId);
    if (this.phase !== 'playing' || !p || !p.alive || !this.simulated(p)) return;
    if (side !== 0 && side !== 1) return;
    const t = this.roundMs / 1000;
    const item = this.items.find((x) => !p.done.has(x.n) && x.at - x.travelS <= t);
    // Nothing on the belt yet: the tap does nothing.
    if (!item) return;
    p.done.add(item.n);
    if (item.attr[item.rule] === side) {
      p.score++;
      p.last = { kind: 'right', at: t };
    } else {
      p.last = { kind: 'wrong', at: t };
      this.loseLife(p);
    }
  }

  private loseLife(p: Sorter): void {
    if (--p.lives <= 0) this.knockOut(p);
  }

  snapshot(): SortitSnapshot {
    const t = this.phase === 'playing' ? this.roundMs / 1000 : 0;
    return {
      id: 'sortit',
      phase: this.phase,
      meters: this.meters,
      speed: 0,
      timerMs: Math.max(0, Math.round(this.timerMs)),
      winnerId: this.winnerId,
      ...this.summary(),
      items: this.items
        .filter((x) => x.at - x.travelS <= t + 0.001 && x.at + GRACE_S + 0.4 >= t)
        .map((x): SortitItem => ({ n: x.n, colour: x.attr[0], shape: x.attr[1], size: x.attr[2], rule: x.rule, inMs: Math.round((x.at - t) * 1000), travelMs: Math.round(x.travelS * 1000) })),
      players: [...this.players.values()].map((p) => ({
        id: p.id,
        alive: p.alive,
        wins: p.wins,
        meters: p.alive ? p.score : p.outAtMeters,
        lives: p.lives,
        done: [...p.done].filter((n) => this.items.some((x) => x.n === n)),
        last: p.last && t - p.last.at <= LASTING_MS / 1000 ? { kind: p.last.kind, agoMs: Math.round((t - p.last.at) * 1000) } : null,
      })),
    };
  }

  protected advance(): void {
    const t = this.roundMs / 1000;
    this.lay(t);
    for (const p of this.players.values()) {
      if (!p.alive || !this.simulated(p)) continue;
      // An item that got past the line unsorted costs a life.
      for (const item of this.items) {
        if (item.at + GRACE_S >= t || p.done.has(item.n)) continue;
        p.done.add(item.n);
        p.last = { kind: 'miss', at: t };
        this.loseLife(p);
        if (!p.alive) break;
      }
    }
    // Forget items everyone is well past, and what the players did with them.
    const gone = this.items.filter((x) => x.at + GRACE_S + 1 < t).map((x) => x.n);
    if (gone.length > 0) {
      this.items = this.items.filter((x) => !gone.includes(x.n));
      for (const p of this.players.values()) for (const n of gone) p.done.delete(n);
    }
  }
}
