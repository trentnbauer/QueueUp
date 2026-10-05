import { beforeEach, describe, expect, it, vi } from 'vitest';

const prisma = vi.hoisted(() => ({
  room: { findMany: vi.fn(), findUnique: vi.fn() },
  roomRecap: { findFirst: vi.fn(), create: vi.fn(), findMany: vi.fn(), deleteMany: vi.fn() },
  roomActivity: { findMany: vi.fn() },
  game: { findMany: vi.fn() },
}));
const generateRecapText = vi.hoisted(() => vi.fn());
const postRoomDiscord = vi.hoisted(() => vi.fn());
vi.mock('../db/client.js', () => ({ prisma }));
vi.mock('./roomActivity.js', () => ({ postRoomDiscord }));
vi.mock('./ai/aiRoomRecap.js', async () => {
  const actual = await vi.importActual<typeof import('./ai/aiRoomRecap.js')>('./ai/aiRoomRecap.js').catch(() => null);
  return { buildRecapFacts: actual?.buildRecapFacts ?? (() => ({})), generateRecapText };
});

import { HttpError } from '../util/httpError.js';
import { runWeeklyRecaps } from './weeklyRecap.js';

const now = new Date('2026-10-08T12:00:00Z');
const daysAgo = (n: number) => new Date(now.getTime() - n * 24 * 60 * 60 * 1000);

beforeEach(() => {
  vi.resetAllMocks();
  prisma.roomActivity.findMany.mockResolvedValue([]);
  prisma.game.findMany.mockResolvedValue([]);
  prisma.roomRecap.create.mockResolvedValue({ id: 'r1' });
  prisma.roomRecap.findMany.mockResolvedValue([]);
  prisma.room.findUnique.mockResolvedValue({ name: 'Crew', weeklyRecapDiscord: false });
});

describe('runWeeklyRecaps', () => {
  it('writes a recap for a room that has none, and saves it', async () => {
    prisma.room.findMany.mockResolvedValue([{ id: 'room1' }]);
    prisma.roomRecap.findFirst.mockResolvedValue(null);
    generateRecapText.mockResolvedValue('A good week.');
    expect(await runWeeklyRecaps(now)).toEqual({ created: 1, skipped: 0 });
    expect(prisma.roomRecap.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ roomId: 'room1', text: 'A good week.' }) }));
    expect(postRoomDiscord).not.toHaveBeenCalled();
  });

  it('leaves a room alone when its last recap is under a week old', async () => {
    prisma.room.findMany.mockResolvedValue([{ id: 'room1' }]);
    prisma.roomRecap.findFirst.mockResolvedValue({ createdAt: daysAgo(2) });
    expect(await runWeeklyRecaps(now)).toEqual({ created: 0, skipped: 0 });
    expect(generateRecapText).not.toHaveBeenCalled();
  });

  it('writes a new one once the last is about a week old', async () => {
    prisma.room.findMany.mockResolvedValue([{ id: 'room1' }]);
    prisma.roomRecap.findFirst.mockResolvedValue({ createdAt: daysAgo(6.9) });
    generateRecapText.mockResolvedValue('Again.');
    expect((await runWeeklyRecaps(now)).created).toBe(1);
  });

  it('skips quietly when there is no AI or too little happened, and keeps going with other rooms', async () => {
    prisma.room.findMany.mockResolvedValue([{ id: 'quiet' }, { id: 'busy' }]);
    prisma.roomRecap.findFirst.mockResolvedValue(null);
    generateRecapText.mockRejectedValueOnce(new HttpError(400, 'Not much happened')).mockResolvedValueOnce('Busy week.');
    expect(await runWeeklyRecaps(now)).toEqual({ created: 1, skipped: 1 });
  });

  it('logs and carries on after an unexpected failure', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    prisma.room.findMany.mockResolvedValue([{ id: 'a' }, { id: 'b' }]);
    prisma.roomRecap.findFirst.mockResolvedValue(null);
    generateRecapText.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce('Fine.');
    expect(await runWeeklyRecaps(now)).toEqual({ created: 1, skipped: 0 });
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });

  it('also posts to Discord when the room asked for it', async () => {
    prisma.room.findMany.mockResolvedValue([{ id: 'room1' }]);
    prisma.roomRecap.findFirst.mockResolvedValue(null);
    prisma.room.findUnique.mockResolvedValue({ name: 'Crew', weeklyRecapDiscord: true });
    generateRecapText.mockResolvedValue('Hello.');
    await runWeeklyRecaps(now);
    expect(postRoomDiscord).toHaveBeenCalledWith('room1', expect.stringContaining('This week in Crew'), undefined);
  });

  it('prunes recaps beyond the newest eight', async () => {
    prisma.room.findMany.mockResolvedValue([{ id: 'room1' }]);
    prisma.roomRecap.findFirst.mockResolvedValue(null);
    prisma.roomRecap.findMany.mockResolvedValue([{ id: 'old1' }, { id: 'old2' }]);
    generateRecapText.mockResolvedValue('x');
    await runWeeklyRecaps(now);
    expect(prisma.roomRecap.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['old1', 'old2'] } } });
  });
});
