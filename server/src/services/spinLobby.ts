import { LOBBY_ACTION_NAME_MAX, lobbyVotesNeeded, type LobbySnapshot } from '@queueup/shared';
import { createLobbyGame, pickLobbyGame, type LobbyGame } from './lobbyGames/index.js';

/** One room's live lobby: who is in it, who has voted to spin, and the mini game they are playing.
 * Pure state and rules - no sockets or timers (see spinLobbyHub.ts), so it is easy to test. A member
 * with several tabs open counts once: `join`/`leave` are reference-counted per person, and the game
 * only hears about the person arriving and leaving. */
export class SpinLobby {
  private readonly connections = new Map<string, number>();
  private readonly votes = new Set<string>();
  private tickCount = 0;

  constructor(private readonly game: LobbyGame = createLobbyGame(pickLobbyGame())) {}

  /** Members currently in the lobby. */
  get present(): string[] {
    return [...this.connections.keys()];
  }

  get size(): number {
    return this.connections.size;
  }

  join(userId: string): void {
    const n = this.connections.get(userId) ?? 0;
    this.connections.set(userId, n + 1);
    if (n === 0) this.game.join(userId);
  }

  /** One connection closed. The person leaves the lobby (and their vote goes) when their last one does. */
  leave(userId: string): void {
    const n = this.connections.get(userId);
    if (n === undefined) return;
    if (n > 1) {
      this.connections.set(userId, n - 1);
      return;
    }
    this.connections.delete(userId);
    this.votes.delete(userId);
    this.game.leave(userId);
  }

  setInput(userId: string, dx: unknown, dy: unknown): void {
    if (!this.connections.has(userId)) return;
    this.game.input(userId, dx === 1 || dx === -1 ? dx : 0, dy === 1 || dy === -1 ? dy : 0);
  }

  action(userId: string, name: unknown): void {
    if (!this.connections.has(userId) || typeof name !== 'string' || name.length > LOBBY_ACTION_NAME_MAX) return;
    this.game.action(userId, name);
  }

  vote(userId: string, on: boolean): void {
    if (!this.connections.has(userId)) return;
    if (on) this.votes.add(userId);
    else this.votes.delete(userId);
  }

  get needed(): number {
    return lobbyVotesNeeded(this.connections.size);
  }

  /** Whether more than half of the members in the lobby have voted to spin. */
  get votePassed(): boolean {
    return this.connections.size > 0 && this.votes.size >= this.needed;
  }

  tick(dtMs: number): void {
    this.tickCount++;
    this.game.tick(dtMs);
  }

  snapshot(spinWaiting: boolean): LobbySnapshot {
    return { t: 'state', tick: this.tickCount, game: this.game.snapshot(), voters: [...this.votes], needed: this.needed, spinWaiting };
  }
}
