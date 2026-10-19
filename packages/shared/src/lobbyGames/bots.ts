import type { LobbyGameId, LobbyGameSnapshot, LobbyRunScore } from '../spinLobby.js';
import { battleshipsBrain } from './battleships.js';
import { drawBrain } from './draw.js';
import { secureRandom } from './roundGame.js';
import { sumoBrain } from './sumo.js';
import type { BotBrain, LobbyGame } from './types.js';

const BOT_PREFIX = 'bot:';

/** Bots have ids no real member can have (member ids are UUIDs). */
export function isBotId(id: string): boolean {
  return id.startsWith(BOT_PREFIX);
}

/** Which bot this is (1, 2, ...), for a name and a colour. */
export function botNumber(id: string): number {
  return Number(id.slice(BOT_PREFIX.length)) || 1;
}

/** Colours for bots' avatars: muted, so a bot never looks like somebody's chosen colour. */
const BOT_COLORS = ['#7d8793', '#8a8f6a', '#8b7d96', '#7a9a9c', '#a08a76', '#8c93a6'];
export function botColor(id: string): string {
  return BOT_COLORS[(botNumber(id) - 1) % BOT_COLORS.length];
}

/** The games that have a bot brain. A game that sets `minPlayers` above 1 must have one here. */
const BRAINS: Partial<Record<LobbyGameId, (botId: string, rng: () => number) => BotBrain>> = {
  battleships: battleshipsBrain,
  sumo: sumoBrain,
  draw: drawBrain,
};

/** Wraps a game that needs more players than the lobby has, and adds bots until there are enough.
 *
 * - Bots are players in the game like anyone else (`bot:1`, `bot:2`, ...), so the game's rules need no
 *   special case. They are not members: they never vote, count as present or appear in the room.
 * - Bots are only added or removed between runs (never during one), up to exactly the minimum: the
 *   first run after enough real players arrive has no bots.
 * - When the last real player leaves, the bots go too and the game resets.
 * - Each bot has its own brain, which reads the snapshot and presses what a person could press. */
export class BotFiller implements LobbyGame {
  readonly id: LobbyGameId;
  private readonly humans = new Set<string>();
  private readonly bots = new Map<string, BotBrain>();
  /** The last direction each bot was told to hold, so only changes are sent. */
  private readonly held = new Map<string, string>();
  private nextBot = 1;

  constructor(
    private readonly inner: LobbyGame,
    readonly minPlayers: number,
    private readonly makeBrain: (botId: string) => BotBrain,
  ) {
    this.id = inner.id;
  }

  get onRunOver(): (() => boolean) | undefined {
    return this.inner.onRunOver;
  }

  set onRunOver(fn: (() => boolean) | undefined) {
    this.inner.onRunOver = fn;
  }

  get timeLimitS(): number | null | undefined {
    return this.inner.timeLimitS;
  }

  set timeLimitS(s: number | null | undefined) {
    this.inner.timeLimitS = s;
  }

  get onRunScores(): ((scores: LobbyRunScore[]) => void) | undefined {
    return this.inner.onRunScores;
  }

  set onRunScores(fn: ((scores: LobbyRunScore[]) => void) | undefined) {
    this.inner.onRunScores = fn;
  }

  /** How many bots are in the game right now. */
  get botCount(): number {
    return this.bots.size;
  }

  join(userId: string): void {
    this.humans.add(userId);
    this.inner.join(userId);
    this.balance();
  }

  leave(userId: string): void {
    this.humans.delete(userId);
    this.inner.leave(userId);
    this.balance();
  }

  input(userId: string, dx: number, dy: number): void {
    this.inner.input(userId, dx, dy);
  }

  action(userId: string, name: string): void {
    this.inner.action(userId, name);
  }

  get clientSim(): boolean {
    return this.inner.clientSim ?? false;
  }

  simStart(): ReturnType<NonNullable<LobbyGame['simStart']>> {
    return this.inner.simStart?.() ?? null;
  }

  report(userId: string, run: number, alive: boolean, f: Record<string, number>): void {
    this.inner.report?.(userId, run, alive, f);
  }

  tap(userId: string, target: number, ms?: number): void {
    this.inner.tap?.(userId, target, ms);
  }

  tick(dtMs: number): void {
    this.balance();
    if (this.bots.size > 0) {
      // Each bot looks at the game as that bot would see it (its own ships, not the others').
      for (const [id, brain] of this.bots) this.drive(id, brain(this.inner.snapshot(id), dtMs));
    }
    this.inner.tick(dtMs);
  }

  snapshot(viewer?: string): LobbyGameSnapshot {
    return this.inner.snapshot(viewer);
  }

  private drive(id: string, cmd: ReturnType<BotBrain>): void {
    const dx = cmd.dx ?? 0;
    const dy = cmd.dy ?? 0;
    const key = `${dx},${dy}`;
    if (this.held.get(id) !== key) {
      this.held.set(id, key);
      this.inner.input(id, dx, dy);
    }
    for (const name of cmd.actions ?? []) this.inner.action(id, name);
    for (const target of cmd.taps ?? []) this.inner.tap?.(id, target);
  }

  /** Brings the number of bots to what the game needs, whenever a run is not on. */
  private balance(): void {
    if (this.humans.size === 0) {
      for (const id of [...this.bots.keys()]) this.removeBot(id);
      return;
    }
    if (this.inner.snapshot().phase === 'playing') return;
    const want = Math.max(0, this.minPlayers - this.humans.size);
    while (this.bots.size < want) {
      const id = `${BOT_PREFIX}${this.nextBot++}`;
      this.bots.set(id, this.makeBrain(id));
      this.inner.join(id);
    }
    // Drop the newest bots first.
    while (this.bots.size > want) this.removeBot([...this.bots.keys()].pop() as string);
  }

  private removeBot(id: string): void {
    this.bots.delete(id);
    this.held.delete(id);
    this.inner.leave(id);
  }
}

/** Gives a game its bots if it needs more than one player, and returns it unchanged if not. */
export function withBots(game: LobbyGame, rng: () => number = secureRandom): LobbyGame {
  const min = game.minPlayers ?? 1;
  const brain = BRAINS[game.id];
  if (game instanceof BotFiller || min <= 1 || !brain) return game;
  return new BotFiller(game, min, (botId) => brain(botId, rng));
}
