import { describe, it, expect } from 'vitest';
import { serializeNotification } from './notifications.js';

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
    expect(serializeNotification(row, cutoffs).read).toBe(true);
  });

  it('is unread when it was created after the member last read the room', () => {
    const row = { ...BASE, roomId: 'room-1', recipientId: null, readAt: null, createdAt: new Date('2026-01-01T12:00:00Z') };
    const cutoffs = new Map([['room-1', { notificationsReadAt: new Date('2026-01-01T11:00:00Z'), joinedAt: new Date('2026-01-01T00:00:00Z') }]]);
    expect(serializeNotification(row, cutoffs).read).toBe(false);
  });

  it('falls back to joinedAt as the cutoff when the member has never opened the room', () => {
    const beforeJoin = { ...BASE, roomId: 'room-1', recipientId: null, readAt: null, createdAt: new Date('2026-01-01T00:00:00Z') };
    const afterJoin = { ...beforeJoin, createdAt: new Date('2026-01-02T00:00:00Z') };
    const cutoffs = new Map([['room-1', { notificationsReadAt: null, joinedAt: new Date('2026-01-01T12:00:00Z') }]]);
    expect(serializeNotification(beforeJoin, cutoffs).read).toBe(true);
    expect(serializeNotification(afterJoin, cutoffs).read).toBe(false);
  });

  it('reads direct notifications off their own readAt, ignoring room cutoffs entirely', () => {
    const unread = { ...BASE, roomId: null, recipientId: 'user-1', readAt: null, createdAt: new Date('2026-01-01T00:00:00Z') };
    const read = { ...unread, readAt: new Date('2026-01-01T00:05:00Z') };
    expect(serializeNotification(unread, new Map()).read).toBe(false);
    expect(serializeNotification(read, new Map()).read).toBe(true);
  });
});
