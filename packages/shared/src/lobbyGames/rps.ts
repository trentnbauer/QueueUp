import { RPS_CHOICES, type RpsOutcome, type RpsSnapshot, type RpsStage } from '../spinLobby.js';
import { RoundGame, type RoundPlayer } from './roundGame.js';
import type { BotBrain } from './types.js';

/** How long everyone has to pick: roomy in the first round, then less each round, down to a floor. */
const PICK_START_S = 3.5;
const PICK_SHRINK_S = 0.15; // per round
const PICK_MIN_S = 1.2;
/** The result of a round shows for this long. */
const REVEAL_S = 1.6;
/** A moment before the first round, so there is time to get ready. */
const FIRST_S = 0.6;

interface Hand extends RoundPlayer {
  /** What they picked this round (0 rock, 1 paper, 2 scissors), or -1 before they have. Their first tap counts. */
  pick: number;
  /** How the round went for them, once it is decided (null before). */
  outcome: RpsOutcome | null;
  /** Rounds they have won this run. */
  score: number;
}

/** Whether choice `a` beats choice `b`: paper beats rock, scissors beat paper, rock beats scissors (0 rock, 1 paper, 2 scissors). */
export const beats = (a: number, b: number): boolean => (a - b + 3) % 3 === 1;

/** Rock, paper, scissors for as many as are in. Everyone picks at once (nobody sees what the others pick until it is shown). If two
 * different choices were made, the one that beats the other wins and whoever made the losing one is out. If everyone made the same
 * choice, or all three were made, it is a draw and the round is played again. Someone who has not picked when the time is up is out.
 * Last one in wins. The time to pick gets shorter every round. Needs 2 players, so on your own a bot plays you. See RoundGame for how
 * runs start and end. */
export class RpsGame extends RoundGame<Hand> {
  readonly id = 'rps' as const;
  readonly minPlayers = 2;
  private stage: RpsStage = 'pick';
  private round = 0;
  private elapsed = 0;
  private allowed = PICK_START_S;
  /** Seconds before the first round, or while a result is showing. */
  private wait = 0;
  /** How the last round that was decided or drawn came out: what everyone had picked is still on the players. */
  private lastDraw = false;

  /** The score shown for the run: the most rounds anyone has won, counting those who are out. */
  protected get meters(): number {
    let best = 0;
    for (const p of this.players.values()) best = Math.max(best, p.alive ? p.score : p.outAtMeters);
    return best;
  }

  protected createPlayer(id: string, alive: boolean): Hand {
    return { id, pick: -1, outcome: null, score: 0, alive, wins: 0, outAtMeters: 0 };
  }

  protected resetPlayer(p: Hand): void {
    p.pick = -1;
    p.outcome = null;
    p.score = 0;
  }

  protected resetCourse(): void {
    this.stage = 'reveal';
    this.round = 0;
    this.elapsed = 0;
    this.allowed = PICK_START_S;
    this.wait = 0;
    this.lastDraw = false;
  }

  protected beginCourse(): void {
    this.resetCourse();
    this.wait = FIRST_S;
  }

  input(): void {
    // The three choices are the controller: there is nothing to hold.
  }

  action(): void {
    // Tapping a choice is all there is to do.
  }

  protected override knockOut(p: Hand): void {
    super.knockOut(p);
    p.outAtMeters = p.score;
  }

  tap(userId: string, target: number): void {
    const p = this.players.get(userId);
    if (this.phase !== 'playing' || this.stage !== 'pick' || !p || !p.alive || p.pick >= 0) return;
    if (!Number.isInteger(target) || target < 0 || target >= RPS_CHOICES) return;
    p.pick = target;
  }

  /** What `viewer` is shown: everyone's picks once a round is decided, but while people are still choosing, only their own (and who has chosen). */
  snapshot(viewer?: string): RpsSnapshot {
    const picking = this.stage === 'pick';
    return {
      id: 'rps',
      phase: this.phase,
      meters: this.meters,
      speed: 0,
      timerMs: Math.max(0, Math.round(this.timerMs)),
      winnerId: this.winnerId,
      ...this.summary(),
      stage: this.stage,
      round: this.round,
      draw: this.stage === 'reveal' && this.round > 0 && this.lastDraw,
      pickLeftMs: picking ? Math.max(0, Math.round((this.allowed - this.elapsed) * 1000)) : 0,
      pickTotalMs: Math.round(this.allowed * 1000),
      players: [...this.players.values()].map((p) => ({
        id: p.id,
        alive: p.alive,
        wins: p.wins,
        meters: p.alive ? p.score : p.outAtMeters,
        picked: p.pick >= 0,
        // Only their own pick is shown while people are choosing; after that, everyone's.
        pick: !picking || p.id === viewer ? p.pick : -1,
        outcome: picking ? null : p.outcome,
      })),
    };
  }

  protected advance(dt: number): void {
    if (this.stage === 'reveal') {
      this.wait -= dt;
      if (this.wait <= 0) this.startRound();
      return;
    }
    this.elapsed += dt;
    const here = [...this.players.values()].filter((p) => p.alive);
    if (this.elapsed >= this.allowed || (here.length > 0 && here.every((p) => p.pick >= 0))) this.decide(here);
  }

  private startRound(): void {
    this.round++;
    this.allowed = Math.max(PICK_MIN_S, PICK_START_S - PICK_SHRINK_S * (this.round - 1));
    this.elapsed = 0;
    this.stage = 'pick';
    for (const p of this.players.values()) {
      p.pick = -1;
      p.outcome = null;
    }
  }

  /** The round is over: who is out, who scores, or a draw. */
  private decide(here: Hand[]): void {
    const picked = here.filter((p) => p.pick >= 0);
    // Whoever did not pick in time is out, whatever else happened.
    for (const p of here) if (p.pick < 0) p.outcome = 'late';
    const kinds = new Set(picked.map((p) => p.pick));
    this.lastDraw = kinds.size !== 2;
    if (kinds.size === 2) {
      const [a, b] = [...kinds];
      const winning = beats(a, b) ? a : b;
      for (const p of picked) {
        p.outcome = p.pick === winning ? 'win' : 'lose';
        if (p.pick === winning) p.score++;
      }
    } else for (const p of picked) p.outcome = 'draw';
    this.stage = 'reveal';
    this.wait = REVEAL_S;
    for (const p of here) if (p.outcome === 'lose' || p.outcome === 'late') this.knockOut(p);
  }
}

/** A bot that picks a little after the round starts: at random, but a third of the time it plays what beats whatever a rival showed last round (people repeat themselves). */
export function rpsBrain(id: string, rng: () => number): BotBrain {
  let round = -1;
  let at = 0;
  let waited = 0;
  let pick = 0;
  let rival = -1;
  return (snap, dtMs) => {
    if (snap.id !== 'rps' || snap.phase !== 'playing') return {};
    if (snap.stage === 'reveal') {
      // Everyone's pick is shown now: remember a rival's.
      const other = snap.players.find((p) => p.id !== id && p.pick >= 0);
      if (other) rival = other.pick;
      return {};
    }
    const me = snap.players.find((p) => p.id === id);
    if (!me?.alive || me.picked) return {};
    if (snap.round !== round) {
      round = snap.round;
      waited = 0;
      at = 300 + rng() * Math.min(900, snap.pickTotalMs * 0.45);
      pick = rival >= 0 && rng() < 0.34 ? (rival + 1) % RPS_CHOICES : Math.floor(rng() * RPS_CHOICES);
    }
    waited += dtMs;
    return waited >= at ? { taps: [pick] } : {};
  };
}
