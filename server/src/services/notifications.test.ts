import { describe, it, expect } from 'vitest';
import { serializeNotification, unreadNotificationWhere } from './notifications.js';

const VIEWER = 'user-viewer';

const BASE = {
  id: 'notif-1',
  roomName: 'Squad Alpha',
  type: 'game_added' as const,
  message: 'Trent added "Portal 2" to the room',
  actorId: 'user-trent',
  actor: null,
};

describe('serializeNotification', () => {
  it('is read once the room member has read past its createdAt', () => {
    const row = { ...BASE, roomId: 'room-1', recipientId: null, readAt: null, createdAt: new Date('2026-01-01T10:00:00Z') };
    const cutoffs = new Map([['room-1', { notificationsReadAt: new Date('2026-01-01T11:00:00Z'), joinedAt: new Date('2026-01-01T00:00:00Z') }]]);
    expect(serializeNotification(row, VIEWER, cutoffs).read).toBe(true);
  });

  it('is unread when it was created after the member last read the room', () => {
    const row = { ...BASE, roomId: 'room-1', recipientId: null, readAt: null, createdAt: new Date('2026-01-01T12:00:00Z') };
    const cutoffs = new Map([['room-1', { notificationsReadAt: new Date('2026-01-01T11:00:00Z'), joinedAt: new Date('2026-01-01T00:00:00Z') }]]);
    expect(serializeNotification(row, VIEWER, cutoffs).read).toBe(false);
  });

  it('falls back to joinedAt as the cutoff when the member has never opened the room', () => {
    const beforeJoin = { ...BASE, roomId: 'room-1', recipientId: null, readAt: null, createdAt: new Date('2026-01-01T00:00:00Z') };
    const afterJoin = { ...beforeJoin, createdAt: new Date('2026-01-02T00:00:00Z') };
    const cutoffs = new Map([['room-1', { notificationsReadAt: null, joinedAt: new Date('2026-01-01T12:00:00Z') }]]);
    expect(serializeNotification(beforeJoin, VIEWER, cutoffs).read).toBe(true);
    expect(serializeNotification(afterJoin, VIEWER, cutoffs).read).toBe(false);
  });

  it('reads direct notifications off their own readAt, ignoring room cutoffs entirely', () => {
    const unread = { ...BASE, roomId: null, recipientId: 'user-1', readAt: null, createdAt: new Date('2026-01-01T00:00:00Z') };
    const read = { ...unread, readAt: new Date('2026-01-01T00:05:00Z') };
    expect(serializeNotification(unread, VIEWER, new Map()).read).toBe(false);
    expect(serializeNotification(read, VIEWER, new Map()).read).toBe(true);
  });

  it("is always read for the notification's own actor, even past their unread cutoff", () => {
    const row = { ...BASE, roomId: 'room-1', recipientId: null, readAt: null, createdAt: new Date('2026-01-01T12:00:00Z') };
    // Cutoff is well before createdAt - an "other viewer" would see this as unread (see the
    // preceding test), but the actor who caused it should never see their own action as unread,
    // without that also silently clearing anyone else's pending unread notifications in the room.
    const cutoffs = new Map([['room-1', { notificationsReadAt: new Date('2026-01-01T00:00:00Z'), joinedAt: new Date('2026-01-01T00:00:00Z') }]]);
    expect(serializeNotification(row, row.actorId, cutoffs).read).toBe(true);
  });
});

describe('unreadNotificationWhere', () => {
  it('builds one room-scoped branch per membership, each gated on that room\'s own cutoff', () => {
    const memberships = [
      { roomId: 'room-1', notificationsReadAt: new Date('2026-01-01T11:00:00Z'), joinedAt: new Date('2026-01-01T00:00:00Z') },
      { roomId: 'room-2', notificationsReadAt: null, joinedAt: new Date('2026-01-02T00:00:00Z') },
    ];
    expect(unreadNotificationWhere(VIEWER, memberships)).toEqual({
      OR: [
        { roomId: 'room-1', actorId: { not: VIEWER }, createdAt: { gt: new Date('2026-01-01T11:00:00Z') } },
        // No notificationsReadAt yet - falls back to joinedAt, same as serializeNotification.
        { roomId: 'room-2', actorId: { not: VIEWER }, createdAt: { gt: new Date('2026-01-02T00:00:00Z') } },
        { recipientId: VIEWER, actorId: { not: VIEWER }, readAt: null },
      ],
    });
  });

  it('still includes the recipient-scoped branch with zero room memberships', () => {
    expect(unreadNotificationWhere(VIEWER, [])).toEqual({
      OR: [{ recipientId: VIEWER, actorId: { not: VIEWER }, readAt: null }],
    });
  });

  it("excludes the caller's own actions from every branch, matching serializeNotification treating your own actions as always-read", () => {
    const memberships = [{ roomId: 'room-1', notificationsReadAt: null, joinedAt: new Date('2026-01-01T00:00:00Z') }];
    const where = unreadNotificationWhere(VIEWER, memberships) as { OR: { actorId?: { not: string } }[] };
    for (const branch of where.OR) {
      expect(branch.actorId).toEqual({ not: VIEWER });
    }
  });
});
