import { beforeEach, describe, expect, it, vi } from 'vitest';

const roomMemberFind = vi.fn();
const roomFind = vi.fn();
vi.mock('../db/client.js', () => ({
  prisma: {
    roomMember: { findUnique: (...a: unknown[]) => roomMemberFind(...a) },
    room: { findUniqueOrThrow: (...a: unknown[]) => roomFind(...a) },
  },
}));

const { requireCanInvite } = await import('./roomAccess.js');

describe('requireCanInvite', () => {
  beforeEach(() => {
    roomMemberFind.mockReset();
    roomFind.mockReset();
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
