import { LobbyRecord, clampDirection, createLobbyGame, type LobbyGame, type LobbyGameId, type LobbySnapshot } from '@queueup/shared';

/** One mini game running in the browser for a single player, for practice: the same game code the server
 * runs in a room, advanced by whoever owns the timer (see `useLocalLobby`). No vote, no other players. */
export class LocalLobby {
  private readonly game: LobbyGame;
  private ticks = 0;

  /** `record` is the run number, results and wins, which the caller keeps from one game to the next, so
   * changing game while practising does not wipe the scoreboard. */
  constructor(
    gameId: LobbyGameId,
    private readonly me: string,
    record: LobbyRecord = new LobbyRecord(),
    game: LobbyGame = createLobbyGame(gameId, record),
    /** Hears this player's score each time a run ends (for high scores). */
    onScore?: (game: LobbyGameId, score: number) => void,
  ) {
    this.game = game;
    if (onScore) {
      this.game.onRunScores = (scores) => {
        const mine = scores.find((s) => s.userId === me);
        if (mine) onScore(gameId, mine.score);
      };
    }
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

  tap(target: number, ms?: number): void {
    this.game.tap?.(this.me, target, ms);
  }

  /** The same snapshot a room's lobby sends, with no votes and no spin to vote on. */
  snapshot(): LobbySnapshot {
    return { t: 'state', tick: this.ticks, game: this.game.snapshot(this.me), voters: [], needed: 1, spinWaiting: false };
  }
}
