import { describe, expect, it, vi } from 'vitest';

const { count, findMany, upsert } = vi.hoisted(() => ({ count: vi.fn().mockResolvedValue(0), findMany: vi.fn().mockResolvedValue([]), upsert: vi.fn() }));
vi.mock('../db/client.js', () => ({ prisma: { blockedDisplayName: { count }, bannedWord: { findMany, upsert } } }));

import { addBannedWord, assertTextAllowed, isDisplayNameBlocked, normalizeDisplayName, placeholderDisplayName } from './displayNames.js';

describe('normalizeDisplayName', () => {
  it('folds case, accents, spacing and punctuation so look-alikes are one entry', () => {
    expect(normalizeDisplayName('B4d  Näme!')).toBe('b4dname');
    expect(normalizeDisplayName('b4d_name')).toBe('b4dname');
  });
});

describe('isDisplayNameBlocked', () => {
  it('looks the normalized name up', async () => {
    count.mockResolvedValueOnce(1);
    expect(await isDisplayNameBlocked('B4D Name')).toBe(true);
    expect(count).toHaveBeenLastCalledWith({ where: { normalized: 'b4dname' } });
  });

  it('never blocks a name with nothing in it to compare', async () => {
    count.mockClear();
    expect(await isDisplayNameBlocked('!!!')).toBe(false);
    expect(count).not.toHaveBeenCalled();
  });
});

describe('placeholderDisplayName', () => {
  it('is a short neutral name', () => {
    expect(placeholderDisplayName()).toMatch(/^Player \d{4}$/);
  });
});

describe('banned words', () => {
  it('blocks any text containing a banned word, ignoring case, spacing and punctuation', async () => {
    count.mockResolvedValue(0);
    findMany.mockResolvedValue([{ normalized: 'badword' }]);
    expect(await isDisplayNameBlocked('My B-a-d Word room')).toBe(true);
    expect(await isDisplayNameBlocked('A perfectly fine room')).toBe(false);
  });

  it('assertTextAllowed throws a 400 naming what was refused', async () => {
    findMany.mockResolvedValue([{ normalized: 'badword' }]);
    await expect(assertTextAllowed('badword club', 'That room name')).rejects.toMatchObject({ statusCode: 400, message: 'That room name is not allowed. Choose another.' });
    findMany.mockResolvedValue([]);
    await expect(assertTextAllowed('fine', 'That room name')).resolves.toBeUndefined();
  });

  it('refuses to ban a word too short to be safe, and stores the normalized form otherwise', async () => {
    expect(await addBannedWord('a!', 'admin')).toBe(false);
    expect(await addBannedWord('Bad Word', 'admin')).toBe(true);
    expect(upsert).toHaveBeenLastCalledWith({ where: { normalized: 'badword' }, create: { normalized: 'badword', example: 'Bad Word', createdBy: 'admin' }, update: {} });
  });
});
