import { SpinLobbyHub } from './spinLobbyHub.js';

// The one hub for this process (production runs a single non-replicated server container). Its
// spin helpers are loaded on first use rather than imported, because routes/roomSpin.ts needs this
// hub too (its "start now" button becomes a vote while a lobby is running) and the two would
// otherwise import each other.
const spin = () => import('../routes/roomSpin.js');

export const spinLobbyHub = new SpinLobbyHub({
  isSpinWaiting: async (roomId) => (await spin()).isSpinWaiting(roomId),
  extendWaitingRoom: async (roomId) => (await spin()).extendWaitingRoom(roomId),
  startSpinNow: async (roomId) => (await spin()).startSpinNow(roomId),
});
