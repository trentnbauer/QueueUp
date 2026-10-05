import { beforeEach, describe, expect, it, vi } from 'vitest';

const prisma = vi.hoisted(() => ({ yearStory: { findUnique: vi.fn(), update: vi.fn(), upsert: vi.fn() } }));
vi.mock('../db/client.js', () => ({ prisma }));

import { roomScope, saveGeneratedStory, toStoryDto, updateStory, userScope } from './yearStory.js';

const row = { text: 'Old text.', edited: false, hidden: false, sharedOnProfile: false, generatedAt: new Date('2026-10-01T00:00:00Z'), updatedAt: new Date('2026-10-02T00:00:00Z') };

beforeEach(() => {
  vi.resetAllMocks();
  prisma.yearStory.findUnique.mockResolvedValue(row);
  prisma.yearStory.update.mockImplementation(async ({ data }: { data: object }) => ({ ...row, ...data }));
});

describe('updateStory', () => {
  it('marks a changed text as edited, and leaves an unchanged one alone', async () => {
    await updateStory('user:1', { text: '  New text.  ' }, true);
    expect(prisma.yearStory.update).toHaveBeenLastCalledWith({ where: { scopeKey: 'user:1' }, data: { text: 'New text.', edited: true } });
    await updateStory('user:1', { text: 'Old text.' }, true);
    expect(prisma.yearStory.update).toHaveBeenLastCalledWith({ where: { scopeKey: 'user:1' }, data: {} });
  });

  it('hides and shares', async () => {
    await updateStory('user:1', { hidden: true, sharedOnProfile: true }, true);
    expect(prisma.yearStory.update).toHaveBeenLastCalledWith({ where: { scopeKey: 'user:1' }, data: { hidden: true, sharedOnProfile: true } });
  });

  it('refuses sharing a room recap on a profile', async () => {
    await expect(updateStory('room:1', { sharedOnProfile: true }, false)).rejects.toThrow(/personal recap/);
  });

  it('rejects empty, too long and wrongly typed values', async () => {
    await expect(updateStory('user:1', { text: '   ' }, true)).rejects.toThrow(/cannot be empty/);
    await expect(updateStory('user:1', { text: 'a'.repeat(2001) }, true)).rejects.toThrow(/at most 2000/);
    await expect(updateStory('user:1', { hidden: 'yes' as unknown as boolean }, true)).rejects.toThrow(/true or false/);
  });

  it('404s when there is no recap yet', async () => {
    prisma.yearStory.findUnique.mockResolvedValue(null);
    await expect(updateStory('user:1', { hidden: true }, true)).rejects.toThrow(/no recap/);
  });
});

describe('saveGeneratedStory', () => {
  it('replaces the text, clears edited and hidden, and keeps the share choice', async () => {
    prisma.yearStory.upsert.mockResolvedValue(row);
    await saveGeneratedStory('user:1', { userId: '1' }, 'Fresh.');
    const arg = prisma.yearStory.upsert.mock.calls[0][0];
    expect(arg.update).toMatchObject({ text: 'Fresh.', edited: false, hidden: false });
    expect(arg.update).not.toHaveProperty('sharedOnProfile');
    expect(arg.create).toMatchObject({ scopeKey: 'user:1', userId: '1', roomId: null, text: 'Fresh.' });
  });
});

describe('helpers', () => {
  it('builds scope keys and DTOs', () => {
    expect(userScope('a')).toBe('user:a');
    expect(roomScope('b')).toBe('room:b');
    expect(toStoryDto(row, true)).toMatchObject({ text: 'Old text.', canManage: true, generatedAt: '2026-10-01T00:00:00.000Z' });
  });
});
