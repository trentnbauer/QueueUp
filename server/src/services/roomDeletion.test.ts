import { describe, expect, it } from 'vitest';
import { membersToRestore, parseDeletedMembers, purgeDateFor, ROOM_RETENTION_DAYS, wasRoomMaster, type DeletedMember } from './roomDeletion.js';

const m = (userId: string, role: DeletedMember['role'], joinedAt: string): DeletedMember => ({ userId, role, joinedAt, notificationsReadAt: null });

describe('room deletion', () => {
  it('reads only well-formed member entries', () => {
    const parsed = parseDeletedMembers([
      m('a', 'room_master', '2026-01-01T00:00:00.000Z'),
      { userId: 'b', role: 'owner', joinedAt: '2026-01-02T00:00:00.000Z' },
      { userId: 3, role: 'member', joinedAt: 'x' },
      null,
    ] as never);
    expect(parsed.map((p) => p.userId)).toEqual(['a']);
    expect(parseDeletedMembers(null)).toEqual([]);
    expect(parseDeletedMembers({ userId: 'a' } as never)).toEqual([]);
  });

  it('knows who was Room Master when the room was deleted', () => {
    const snapshot = [m('a', 'room_master', '2026-01-01T00:00:00.000Z'), m('b', 'moderator', '2026-01-02T00:00:00.000Z')] as never;
    expect(wasRoomMaster(snapshot, 'a')).toBe(true);
    expect(wasRoomMaster(snapshot, 'b')).toBe(false);
    expect(wasRoomMaster(snapshot, 'z')).toBe(false);
  });

  it('restores everyone whose account still exists, keeping their roles', () => {
    const snapshot = [m('a', 'room_master', '2026-01-01T00:00:00.000Z'), m('b', 'moderator', '2026-01-02T00:00:00.000Z'), m('c', 'member', '2026-01-03T00:00:00.000Z')];
    const kept = membersToRestore(snapshot, new Set(['a', 'c']));
    expect(kept.map((k) => [k.userId, k.role])).toEqual([['a', 'room_master'], ['c', 'member']]);
  });

  it('promotes the earliest member when the Room Master is gone', () => {
    const snapshot = [m('a', 'room_master', '2026-01-01T00:00:00.000Z'), m('c', 'member', '2026-01-03T00:00:00.000Z'), m('b', 'moderator', '2026-01-02T00:00:00.000Z')];
    const kept = membersToRestore(snapshot, new Set(['b', 'c']));
    expect(kept.map((k) => [k.userId, k.role])).toEqual([['b', 'room_master'], ['c', 'member']]);
    expect(membersToRestore(snapshot, new Set())).toEqual([]);
  });

  it('purges a room the recovery window after it was deleted', () => {
    const deletedAt = new Date('2026-10-01T12:00:00Z');
    expect(purgeDateFor(deletedAt).toISOString()).toBe(new Date(deletedAt.getTime() + ROOM_RETENTION_DAYS * 864e5).toISOString());
  });
});
