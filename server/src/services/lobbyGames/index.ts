import { LOBBY_GAME_IDS, type LobbyGameId } from '@queueup/shared';
import { TotemGame } from './totem.js';
import type { LobbyGame } from './types.js';

export type { LobbyGame } from './types.js';

/** Starts a fresh game of the given kind. Add new games here. */
export function createLobbyGame(id: LobbyGameId): LobbyGame {
  switch (id) {
    case 'totem':
      return new TotemGame();
  }
}

/** Which game a new lobby opens with. There is one game so far; with more, this picks at random. */
export function pickLobbyGame(random: () => number = Math.random): LobbyGameId {
  return LOBBY_GAME_IDS[Math.floor(random() * LOBBY_GAME_IDS.length)];
}
