import { describe, expect, it, vi } from 'vitest';

const { count } = vi.hoisted(() => ({ count: vi.fn() }));
vi.mock('../db/client.js', () => ({ prisma: { blockedDisplayName: { count } } }));

import { isDisplayNameBlocked, normalizeDisplayName, placeholderDisplayName } from './displayNames.js';

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
