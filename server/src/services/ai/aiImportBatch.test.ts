import { describe, expect, it } from 'vitest';
import { chunk, pendingCursor, pendingWhere, stopReason } from './aiImportBatch.js';

describe('chunk', () => {
  it('splits into groups of at most the size, keeping order', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 3)).toEqual([]);
  });
});

describe('pending cursor', () => {
  const row = { createdAt: new Date('2026-10-05T01:02:03.456Z'), id: '8f0f5a2e-5a1c-4d6b-9a52-0d4c1b7b3a11' };

  it('starts from the newest with no cursor', () => {
    expect(pendingWhere('u1')).toEqual({ userId: 'u1', dismissedAt: null });
    expect(pendingWhere('u1', null)).toEqual({ userId: 'u1', dismissedAt: null });
  });

  it('round-trips a row into "everything after it" in newest-first order', () => {
    const where = pendingWhere('u1', pendingCursor(row));
    expect(where).toEqual({
      userId: 'u1',
      dismissedAt: null,
      OR: [{ createdAt: { lt: row.createdAt } }, { createdAt: row.createdAt, id: { lt: row.id } }],
    });
  });

  it('rejects a malformed cursor', () => {
    expect(() => pendingWhere('u1', 'nonsense')).toThrow(/not valid/);
    expect(() => pendingWhere('u1', "2026-10-05T01:02:03.456Z|x'; drop table")).toThrow(/not valid/);
  });
});

describe('stopReason', () => {
  it('uses the error message, or a fallback', () => {
    expect(stopReason(new Error("You've used today's limit"))).toBe("You've used today's limit");
    expect(stopReason('boom')).toBe('The AI could not finish');
  });
});
