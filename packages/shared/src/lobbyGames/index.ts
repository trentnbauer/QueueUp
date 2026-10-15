import { LOBBY_GAME_IDS, type LobbyGameId } from '../spinLobby.js';
import { BattleshipsGame } from './battleships.js';
import { withBots } from './bots.js';
import { CoinsGame } from './coins.js';
import { DodgeGame } from './dodge.js';
import { DrawGame } from './draw.js';
import { FlappyGame } from './flappy.js';
import { RaceGame } from './race.js';
import { RedLightGame } from './redlight.js';
import { RopeGame } from './rope.js';
import { RunnerGame } from './runner.js';
import { TiltGame } from './tilt.js';
import { WhackGame } from './whack.js';
import { LobbyRecord } from './roundGame.js';
import type { LobbyGame } from './types.js';

export type { BotBrain, BotCommand, LobbyGame } from './types.js';
export { LobbyRecord } from './roundGame.js';
export { BattleshipsGame, CoinsGame, DodgeGame, FlappyGame, RaceGame, RedLightGame, RopeGame, RunnerGame, WhackGame, DrawGame, TiltGame };
export { BotFiller, botColor, botNumber, isBotId, withBots } from './bots.js';

/** Starts a fresh game of the given kind, with bots added by the lobby when it needs more players than
 * are in it (see bots.ts). Add new games in `build`. */
export function createLobbyGame(id: LobbyGameId, record?: LobbyRecord): LobbyGame {
  return withBots(build(id, record));
}

function build(id: LobbyGameId, record?: LobbyRecord): LobbyGame {
  switch (id) {
    case 'runner':
      return new RunnerGame(undefined, record);
    case 'flappy':
      return new FlappyGame(undefined, record);
    case 'dodge':
      return new DodgeGame(undefined, record);
    case 'rope':
      return new RopeGame(undefined, record);
    case 'redlight':
      return new RedLightGame(undefined, record);
    case 'coins':
      return new CoinsGame(undefined, record);
    case 'battleships':
      return new BattleshipsGame(undefined, record);
    case 'race':
      return new RaceGame(undefined, record);
    case 'whack':
      return new WhackGame(undefined, record);
    case 'draw':
      return new DrawGame(undefined, record);
    case 'tilt':
      return new TiltGame(undefined, record);
  }
}

/** Which game a new lobby opens with, picked at random. */
export function pickLobbyGame(random: () => number = Math.random, not?: LobbyGameId): LobbyGameId {
  // After a run the lobby moves on to a different game, whenever there is one to move to.
  const choices = LOBBY_GAME_IDS.filter((id) => id !== not);
  const from = choices.length > 0 ? choices : LOBBY_GAME_IDS;
  return from[Math.floor(random() * from.length)];
}
