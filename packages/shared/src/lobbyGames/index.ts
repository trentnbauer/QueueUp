import { LOBBY_GAME_IDS, type LobbyGameId } from '../spinLobby.js';
import { DodgeGame } from './dodge.js';
import { FlappyGame } from './flappy.js';
import { RedLightGame } from './redlight.js';
import { RunnerGame } from './runner.js';
import type { LobbyGame } from './types.js';

export type { LobbyGame } from './types.js';

/** Starts a fresh game of the given kind. Add new games here. */
export function createLobbyGame(id: LobbyGameId): LobbyGame {
  switch (id) {
    case 'runner':
      return new RunnerGame();
    case 'flappy':
      return new FlappyGame();
    case 'dodge':
      return new DodgeGame();
    case 'redlight':
      return new RedLightGame();
  }
}

/** Which game a new lobby opens with, picked at random. */
export function pickLobbyGame(random: () => number = Math.random): LobbyGameId {
  return LOBBY_GAME_IDS[Math.floor(random() * LOBBY_GAME_IDS.length)];
}
