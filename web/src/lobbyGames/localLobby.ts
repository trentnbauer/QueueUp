import { clampDirection, createLobbyGame, type LobbyGame, type LobbyGameId, type LobbySnapshot } from '@queueup/shared';

/** One mini game running in the browser for a single player, for practice: the same game code the server
 * runs in a room, advanced by whoever owns the timer (see `useLocalLobby`). No vote, no other players. */
export class LocalLobby {
  private readonly game: LobbyGame;
  private ticks = 0;

  constructor(gameId: LobbyGameId, private readonly me: string, game: LobbyGame = createLobbyGame(gameId)) {
    this.game = game;
    this.game.join(me);
  }

  /** Moves the game on by `dtMs` milliseconds. */
  tick(dtMs: number): void {
    this.ticks++;
    this.game.tick(dtMs);
  }

  input(dx: number, dy: number): void {
    this.game.input(this.me, clampDirection(dx), clampDirection(dy));
  }

  action(name: string): void {
    this.game.action(this.me, name);
  }

  /** The same snapshot a room's lobby sends, with no votes and no spin to vote on. */
  snapshot(): LobbySnapshot {
    return { t: 'state', tick: this.ticks, game: this.game.snapshot(), voters: [], needed: 1, spinWaiting: false };
  }
}
