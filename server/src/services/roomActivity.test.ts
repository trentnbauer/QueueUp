import { describe, it, expect } from 'vitest';
import { encodeActivityCursor, decodeActivityCursor } from './roomActivity.js';

describe('activity cursor codec', () => {
  it('round-trips through encode/decode', () => {
    const cursor = { createdAt: new Date('2026-01-01T12:34:56.789Z'), id: 'a1b2c3d4-0000-4000-8000-000000000000' };
    const decoded = decodeActivityCursor(encodeActivityCursor(cursor));
    expect(decoded).toEqual(cursor);
  });

  it('rejects a cursor with no separator', () => {
    expect(decodeActivityCursor('not-a-valid-cursor')).toBeUndefined();
  });

  it('rejects a cursor with an unparseable timestamp half', () => {
    expect(decodeActivityCursor('not-a-date_some-id')).toBeUndefined();
  });
});
