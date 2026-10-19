import { SpinLobbyHub } from './spinLobbyHub.js';
import { recordRunScores } from './miniGameScores.js';
import { playWeights } from './playWeights.js';
import { OPEN_LOBBY_PREFIX, openLobbies } from './openLobbies.js';

// The one hub for this process (production runs a single non-replicated server container). Its
// spin helpers are loaded on first use rather than imported, because routes/roomSpin.ts needs this
// hub too (its "start now" button becomes a vote while a lobby is running) and the two would
// otherwise import each other.
const spin = () => import('../routes/roomSpin.js');

export const spinLobbyHub = new SpinLobbyHub({
  isSpinWaiting: async (roomId) => (await spin()).isSpinWaiting(roomId),
  extendWaitingRoom: async (roomId) => (await spin()).extendWaitingRoom(roomId),
  startSpinNow: async (roomId) => (await spin()).startSpinNow(roomId),
  // An open lobby's runs are not a room's, so they carry no room id.
  recordScores: (key, game, source, scores) => {
    const open = key.startsWith(OPEN_LOBBY_PREFIX) ? openLobbies.get(key.slice(OPEN_LOBBY_PREFIX.length)) : undefined;
    // A practice lobby's runs are saved as solo ones, as they always were.
    void recordRunScores(game, open?.solo ? 'solo' : source, scores, key.startsWith(OPEN_LOBBY_PREFIX) ? undefined : key);
  },
  pickWeights: playWeights,
  // The lobby stays open until everyone has left, then it is gone.
  onEmpty: (key) => {
    if (key.startsWith(OPEN_LOBBY_PREFIX)) openLobbies.close(key.slice(OPEN_LOBBY_PREFIX.length));
  },
});
