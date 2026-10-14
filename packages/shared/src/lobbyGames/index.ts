import { LOBBY_GAME_IDS, type LobbyGameId } from '../spinLobby.js';
import { withBots } from './bots.js';
import { DodgeGame } from './dodge.js';
import { FlappyGame } from './flappy.js';
import { RedLightGame } from './redlight.js';
import { RopeGame } from './rope.js';
import { RunnerGame } from './runner.js';
import type { LobbyGame } from './types.js';

export type { BotBrain, BotCommand, LobbyGame } from './types.js';
export { BotFiller, botColor, botNumber, isBotId, withBots } from './bots.js';

/** Starts a fresh game of the given kind, with bots added by the lobby when it needs more players than
 * are in it (see bots.ts). Add new games in `build`. */
export function createLobbyGame(id: LobbyGameId): LobbyGame {
  return withBots(build(id));
}

function build(id: LobbyGameId): LobbyGame {
  switch (id) {
    case 'runner':
      return new RunnerGame();
    case 'flappy':
      return new FlappyGame();
    case 'dodge':
      return new DodgeGame();
    case 'rope':
      return new RopeGame();
    case 'redlight':
      return new RedLightGame();
  }
}

/** Which game a new lobby opens with, picked at random. */
export function pickLobbyGame(random: () => number = Math.random): LobbyGameId {
  return LOBBY_GAME_IDS[Math.floor(random() * LOBBY_GAME_IDS.length)];
}
