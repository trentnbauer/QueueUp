import type { PotatoSnapshot } from '../spinLobby.js';
import { RoundGame, type RoundPlayer } from './roundGame.js';
import type { BotBrain } from './types.js';

/** A bomb's fuse is a random length of up to this long in the first round, and the longest allowed gets shorter each round. */
const FUSE_START_S = 11;
const FUSE_SHRINK_S = 0.7; // per round
const FUSE_MIN_MAX_S = 4.5;
/** The shortest a fuse can be, as a share of the longest allowed that round. */
const FUSE_SHORTEST = 0.55;
/** After receiving the bomb you must hold it this long before you can pass it on, so it cannot be flicked straight back. */
const PASS_COOLDOWN_S = 0.4;
/** The pause after a bomb goes off before the next one is handed out. */
const BETWEEN_S = 1.3;

interface Holder extends RoundPlayer {
  /** Rounds they survived, counting the one in progress once it is over for them. */
  survived: number;
  /** Seconds they have held a bomb for and then passed on (a hold that ended in the bomb going off in their hands does not count). */
  heldS: number;
}

/** A bomb with a lit fuse is passed round the ring of players. The one holding it when it goes off is out; the
 * fuse is hidden and gets shorter each round. Needs 2 players, so on your own a bot plays you. See RoundGame for
 * how runs start and end. */
export class PotatoGame extends RoundGame<Holder> {
  readonly id = 'potato' as const;
  readonly minPlayers = 2;
  private holderId: string | null = null;
  /** Seconds the fuse has burned, and how long it is in all (never sent). */
  private burned = 0;
  /** How far the fuse had burned when the current holder got it, so what they held it for is the difference. */
  private heldFrom = 0;
  private fuse = 0;
  private cooldown = 0;
  private between = 0;
  private round = 0;
  /** Who passed it last, and when (a count of passes), so the view can show the throw. */
  private from: string | null = null;
  private passes = 0;

  /** The score shown for the run: the round the bomb is on. */
  protected get meters(): number {
    return this.round;
  }

  protected createPlayer(id: string, alive: boolean): Holder {
    return { id, survived: 0, heldS: 0, alive, wins: 0, outAtMeters: 0 };
  }

  protected resetPlayer(p: Holder): void {
    p.survived = 0;
    p.heldS = 0;
  }

  protected resetCourse(): void {
    this.holderId = null;
    this.burned = 0;
    this.heldFrom = 0;
    this.fuse = 0;
    this.cooldown = 0;
    this.between = 0;
    this.round = 0;
    this.from = null;
    this.passes = 0;
  }

  protected beginCourse(): void {
    this.resetCourse();
    this.between = BETWEEN_S * 0.6;
  }

  input(): void {
    // Passing is an action; there is nothing to hold.
  }

  /** The holder throws the bomb to the next player along. */
  action(userId: string, name: string): void {
    if (name !== 'pass' || this.phase !== 'playing' || userId !== this.holderId || this.cooldown > 0) return;
    const ring = [...this.players.values()].filter((p) => p.alive);
    if (ring.length < 2) return;
    const at = ring.findIndex((p) => p.id === userId);
    // Passing it on means they held it safely: that time is theirs.
    const holder = this.players.get(userId);
    if (holder) holder.heldS += this.burned - this.heldFrom;
    this.heldFrom = this.burned;
    this.from = userId;
    this.holderId = ring[(at + 1) % ring.length].id;
    this.cooldown = PASS_COOLDOWN_S;
    this.passes++;
  }

  snapshot(): PotatoSnapshot {
    return {
      id: 'potato',
      phase: this.phase,
      meters: this.meters,
      speed: 0,
      timerMs: Math.max(0, Math.round(this.timerMs)),
      winnerId: this.winnerId,
      ...this.summary(),
      holderId: this.holderId,
      fromId: this.from,
      passes: this.passes,
      // How close it is to going off, 0 to 1, in rough steps: enough to feel it, not enough to count it down.
      heat: this.holderId ? Math.round(Math.min(1, this.burned / this.fuse) * 8) / 8 : 0,
      passCooldownMs: Math.max(0, Math.round(this.cooldown * 1000)),
      round: this.round,
      players: [...this.players.values()].map((p) => ({ id: p.id, alive: p.alive, wins: p.wins, meters: p.alive ? p.survived : p.outAtMeters })),
    };
  }

  protected advance(dt: number): void {
    if (!this.holderId) {
      this.between -= dt;
      if (this.between <= 0) this.startBomb();
      return;
    }
    this.burned += dt;
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (this.burned >= this.fuse) this.explode();
  }

  /** A new bomb, with a fuse shorter than the last round's, handed to a random player still in. */
  private startBomb(): void {
    const ring = [...this.players.values()].filter((p) => p.alive);
    if (ring.length < 2) return;
    this.round++;
    const longest = Math.max(FUSE_MIN_MAX_S, FUSE_START_S - FUSE_SHRINK_S * (this.round - 1));
    this.fuse = longest * (FUSE_SHORTEST + this.rng() * (1 - FUSE_SHORTEST));
    this.burned = 0;
    this.heldFrom = 0;
    this.cooldown = PASS_COOLDOWN_S;
    this.from = null;
    this.holderId = ring[Math.floor(this.rng() * ring.length)].id;
  }

  /** The bomb goes off in the holder's hands: they are out, with the rounds they got through as their score. */
  private explode(): void {
    const holder = this.holderId ? this.players.get(this.holderId) : undefined;
    this.holderId = null;
    this.between = BETWEEN_S;
    if (!holder) return;
    for (const p of this.players.values()) if (p.alive && p !== holder) p.survived = this.round;
    this.knockOut(holder);
    holder.outAtMeters = holder.survived;
  }

  /** The high score is how long they held a bomb without it going off on them, in tenths of a second. */
  protected override runScore(p: Holder): number {
    return Math.round(p.heldS * 10);
  }
}

/** A bot that holds the bomb for a human-ish moment and then throws it. Beatable: it is never quick. */
export function potatoBrain(id: string, rng: () => number): BotBrain {
  let hold = -1;
  let seenPasses = -1;
  return (snap, dtMs) => {
    if (snap.id !== 'potato' || snap.phase !== 'playing' || snap.holderId !== id) {
      hold = -1;
      return {};
    }
    if (snap.passes !== seenPasses || hold < 0) {
      seenPasses = snap.passes;
      hold = 0.55 + rng() * 1.4;
    }
    hold -= dtMs / 1000;
    return hold <= 0 && snap.passCooldownMs === 0 ? { actions: ['pass'] } : {};
  };
}
