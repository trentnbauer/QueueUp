import { describe, expect, it, vi } from 'vitest';

const { findMany, create } = vi.hoisted(() => ({ findMany: vi.fn(), create: vi.fn() }));
vi.mock('../db/client.js', () => ({ prisma: { accountEvent: { findMany, create } } }));

import { ACCOUNT_EVENT_PAGE_SIZE, getAccountEvents, logAccountEvent } from './accountEvents.js';

const row = (n: number) => ({ id: `e${n}`, type: 't', message: `m${n}`, createdAt: new Date(2026, 0, 1, 0, 0, 100 - n) });

describe('getAccountEvents', () => {
  it('returns a page and a cursor when there are more', async () => {
    findMany.mockResolvedValueOnce(Array.from({ length: ACCOUNT_EVENT_PAGE_SIZE + 1 }, (_, i) => row(i)));
    const page = await getAccountEvents('u');
    expect(page.entries).toHaveLength(ACCOUNT_EVENT_PAGE_SIZE);
    expect(page.nextBefore).toBe(row(ACCOUNT_EVENT_PAGE_SIZE - 1).createdAt.toISOString());
  });

  it('has no cursor on the last page and ignores a bad cursor', async () => {
    findMany.mockResolvedValueOnce([row(1)]);
    const page = await getAccountEvents('u', 'not-a-date');
    expect(page.nextBefore).toBeNull();
    expect(findMany.mock.calls.at(-1)?.[0].where).toEqual({ userId: 'u' });
  });
});

describe('logAccountEvent', () => {
  it('never throws when the write fails', async () => {
    create.mockRejectedValueOnce(new Error('db down'));
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(logAccountEvent('u', 't', 'm')).resolves.toBeUndefined();
    spy.mockRestore();
  });
});
