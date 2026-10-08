import { purgeExpiredRooms } from '../services/roomDeletion.js';
import { scheduleJob, type JobHandle } from './scheduler.js';

// Deleted rooms are kept for ROOM_RETENTION_DAYS (#1103); a day's slack on top is harmless.
export const ROOM_PURGE_INTERVAL_MS = 24 * 60 * 60 * 1000;

/** Removes rooms whose recovery window has passed. Same single-process reasoning as the other jobs
 * in jobs/scheduler.ts. */
export function startRoomPurgeJob(): JobHandle {
  return scheduleJob({
    name: 'deleted-room-purge',
    intervalMs: ROOM_PURGE_INTERVAL_MS,
    run: async () => {
      const count = await purgeExpiredRooms();
      if (count) console.warn(`[room-purge] permanently removed ${count} room(s) deleted more than the recovery window ago`);
    },
  });
}
