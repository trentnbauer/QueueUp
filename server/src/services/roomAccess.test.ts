import { beforeEach, describe, expect, it, vi } from 'vitest';

const roomMemberFind = vi.fn();
const roomFind = vi.fn();
const userFind = vi.fn();
vi.mock('../db/client.js', () => ({
  prisma: {
    user: { findUnique: (...a: unknown[]) => userFind(...a) },
    roomMember: { findUnique: (...a: unknown[]) => roomMemberFind(...a) },
    room: { findUniqueOrThrow: (...a: unknown[]) => roomFind(...a) },
  },
}));

const managing = vi.fn();
vi.mock('./redisClient.js', () => ({ redis: { exists: (...a: unknown[]) => managing(...a) } }));

const { requireCanInvite, requireMembership } = await import('./roomAccess.js');

describe('requireCanInvite', () => {
  beforeEach(() => {
    roomMemberFind.mockReset();
    roomFind.mockReset();
    managing.mockReset();
    managing.mockResolvedValue(0);
  });

  it('lets the Room Master and Moderators invite whatever the room setting says', async () => {
    roomFind.mockResolvedValue({ invitePermission: 'moderators' });
    roomMemberFind.mockResolvedValue({ role: 'room_master' });
    await expect(requireCanInvite('r', 'u')).resolves.toMatchObject({ role: 'room_master' });
    roomMemberFind.mockResolvedValue({ role: 'moderator' });
    await expect(requireCanInvite('r', 'u')).resolves.toMatchObject({ role: 'moderator' });
  });

  it('lets a plain member invite when the room allows members to', async () => {
    roomMemberFind.mockResolvedValue({ role: 'member' });
    roomFind.mockResolvedValue({ invitePermission: 'members' });
    await expect(requireCanInvite('r', 'u')).resolves.toMatchObject({ role: 'member' });
  });

  it('refuses a plain member when only moderators and above may invite', async () => {
    roomMemberFind.mockResolvedValue({ role: 'member' });
    roomFind.mockResolvedValue({ invitePermission: 'moderators' });
    await expect(requireCanInvite('r', 'u')).rejects.toMatchObject({ statusCode: 403 });
  });

  it('refuses someone who is not in the room at all', async () => {
    roomMemberFind.mockResolvedValue(null);
    await expect(requireCanInvite('r', 'u')).rejects.toMatchObject({ statusCode: 403 });
  });
});

describe('requireMembership for an administrator managing the room (#792)', () => {
  beforeEach(() => {
    roomMemberFind.mockReset();
    managing.mockReset();
  });

  it('acts as Room Master while "Manage as Room Master" is on and they are still an administrator', async () => {
    roomMemberFind.mockResolvedValue(null);
    managing.mockResolvedValue(1);
    userFind.mockResolvedValue({ isAdmin: true });
    await expect(requireMembership('r', 'admin')).resolves.toMatchObject({ role: 'room_master', adminManaged: true });
  });

  it('refuses once they are no longer an administrator', async () => {
    roomMemberFind.mockResolvedValue(null);
    managing.mockResolvedValue(1);
    userFind.mockResolvedValue({ isAdmin: false });
    await expect(requireMembership('r', 'admin')).rejects.toMatchObject({ statusCode: 403 });
  });

  it('refuses when it is off', async () => {
    roomMemberFind.mockResolvedValue(null);
    managing.mockResolvedValue(0);
    await expect(requireMembership('r', 'admin')).rejects.toMatchObject({ statusCode: 403 });
  });
});
