import { lowerIsBetter, type LobbyGameId, type MiniGameScoreSource } from '@queueup/shared';
import type { MessageKey } from '../i18n';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** How long ago a run was, as a translation key and its values ("Just now", "5 min ago", "Yesterday"). */
export function whenKey(iso: string, now = Date.now()): { key: MessageKey; values?: { n: number } } {
  const age = Math.max(0, now - new Date(iso).getTime());
  if (age < MINUTE) return { key: 'games.when.now' };
  if (age < HOUR) return { key: 'games.when.minutes', values: { n: Math.floor(age / MINUTE) } };
  if (age < DAY) return { key: 'games.when.hours', values: { n: Math.floor(age / HOUR) } };
  if (age < 2 * DAY) return { key: 'games.when.yesterday' };
  return { key: 'games.when.days', values: { n: Math.floor(age / DAY) } };
}

export const SOURCE_KEYS: Record<MiniGameScoreSource, MessageKey> = {
  solo: 'games.source.solo',
  lobby: 'games.source.lobby',
  waiting_room: 'games.source.waitingRoom',
};

/** A high score as shown: a time in milliseconds for the games where smaller is better, else the plain number. */
export function formatScore(game: LobbyGameId, score: number): string {
  return lowerIsBetter(game) ? `${score} ms` : String(score);
}
