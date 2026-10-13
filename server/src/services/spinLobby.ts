import {
  LOBBY_PLAYER_SPEED,
  clampDirection,
  lobbyVotesNeeded,
  type LobbyPlayer,
  type LobbySnapshot,
} from '@queueup/shared';

/** One room's live lobby: who is in it, where they stand in the shared arena, and who has voted to
 * spin. Pure state and rules - no sockets or timers (see spinLobbyHub.ts), so it is easy to test.
 * A member with several tabs open counts once: `join`/`leave` are reference-counted per person. */
export class SpinLobby {
  private readonly players = new Map<string, LobbyPlayer & { dx: number; dy: number; connections: number }>();
  private readonly votes = new Set<string>();
  private tickCount = 0;

  /** Members currently in the lobby. */
  get present(): string[] {
    return [...this.players.keys()];
  }

  get size(): number {
    return this.players.size;
  }

  join(userId: string): void {
    const existing = this.players.get(userId);
    if (existing) {
      existing.connections++;
      return;
    }
    // Spread new arrivals around the arena so they do not stack on one spot.
    const n = this.players.size;
    const angle = (n * 2.399963) % (Math.PI * 2);
    this.players.set(userId, {
      id: userId,
      x: 0.5 + 0.3 * Math.cos(angle),
      y: 0.5 + 0.3 * Math.sin(angle),
      dx: 0,
      dy: 0,
      connections: 1,
    });
  }

  /** One connection closed. The person leaves the lobby (and their vote goes) when their last one does. */
  leave(userId: string): void {
    const p = this.players.get(userId);
    if (!p) return;
    p.connections--;
    if (p.connections <= 0) {
      this.players.delete(userId);
      this.votes.delete(userId);
    }
  }

  setInput(userId: string, dx: unknown, dy: unknown): void {
    const p = this.players.get(userId);
    if (!p) return;
    p.dx = clampDirection(dx);
    p.dy = clampDirection(dy);
  }

  vote(userId: string, on: boolean): void {
    if (!this.players.has(userId)) return;
    if (on) this.votes.add(userId);
    else this.votes.delete(userId);
  }

  get needed(): number {
    return lobbyVotesNeeded(this.players.size);
  }

  /** Whether more than half of the members in the lobby have voted to spin. */
  get votePassed(): boolean {
    return this.players.size > 0 && this.votes.size >= this.needed;
  }

  /** Moves everyone for `dtMs` milliseconds. Diagonals are not faster than straight lines. */
  tick(dtMs: number): void {
    this.tickCount++;
    const dt = Math.min(dtMs, 250) / 1000;
    for (const p of this.players.values()) {
      if (p.dx === 0 && p.dy === 0) continue;
      const len = Math.hypot(p.dx, p.dy);
      p.x = Math.min(1, Math.max(0, p.x + (p.dx / len) * LOBBY_PLAYER_SPEED * dt));
      p.y = Math.min(1, Math.max(0, p.y + (p.dy / len) * LOBBY_PLAYER_SPEED * dt));
    }
  }

  snapshot(spinWaiting: boolean): LobbySnapshot {
    return {
      t: 'state',
      tick: this.tickCount,
      players: [...this.players.values()].map((p) => ({ id: p.id, x: Math.round(p.x * 1000) / 1000, y: Math.round(p.y * 1000) / 1000 })),
      voters: [...this.votes],
      needed: this.needed,
      spinWaiting,
    };
  }
}
