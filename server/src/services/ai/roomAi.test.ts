import { beforeEach, describe, expect, it, vi } from 'vitest';

const { roomFindUnique, roomUpdateMany, memberFindUnique, getUserAiConfig } = vi.hoisted(() => ({
  roomFindUnique: vi.fn(),
  roomUpdateMany: vi.fn(),
  memberFindUnique: vi.fn(),
  getUserAiConfig: vi.fn(),
}));
vi.mock('../../db/client.js', () => ({ prisma: { room: { findUnique: roomFindUnique, updateMany: roomUpdateMany }, roomMember: { findUnique: memberFindUnique } } }));
vi.mock('./aiConfig.js', () => ({ getUserAiConfig }));

import { applyMyAiToRoom, describeRoomAi, removeRoomAi } from './roomAi.js';

const sponsor = { id: 'sp', displayName: 'Sam', avatarColor: '#fff', avatarUrl: null, isAdmin: false };
const usable = { provider: 'anthropic' };

/** The room has `owner` as sponsor (or nobody), and `members` are real members. */
function setRoom(owner: typeof sponsor | null, members: string[]) {
  roomFindUnique.mockResolvedValue({ aiKeyOwnerId: owner?.id ?? null, aiKeyOwner: owner });
  memberFindUnique.mockImplementation(async ({ where }: { where: { roomId_userId: { userId: string } } }) =>
    members.includes(where.roomId_userId.userId) ? { userId: where.roomId_userId.userId } : null,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  roomUpdateMany.mockResolvedValue({ count: 1 });
  getUserAiConfig.mockResolvedValue(usable);
});

describe('describeRoomAi', () => {
  it('lets a Room Master or Moderator with their own settings apply when nobody is sponsoring', async () => {
    setRoom(null, ['u1']);
    expect(await describeRoomAi('r', 'u1', true)).toEqual({ sponsor: null, youAreSponsor: false, canApply: true, canRemove: false, hasOwnSettings: true });
  });

  it('does not offer a plain member the chance to apply', async () => {
    setRoom(null, ['u1']);
    expect(await describeRoomAi('r', 'u1', false)).toMatchObject({ canApply: false, hasOwnSettings: true });
  });

  it('shows the sponsor, and who may remove them', async () => {
    setRoom(sponsor, ['sp', 'u1']);
    const asMember = await describeRoomAi('r', 'u1', false);
    expect(asMember.sponsor).toEqual({ id: 'sp', displayName: 'Sam', avatarColor: '#fff', avatarUrl: null, isAdmin: false });
    expect(asMember).toMatchObject({ youAreSponsor: false, canApply: false, canRemove: false });
    expect(await describeRoomAi('r', 'u1', true)).toMatchObject({ canRemove: true });
    expect(await describeRoomAi('r', 'sp', false)).toMatchObject({ youAreSponsor: true, canRemove: true });
  });

  it('clears a sponsor who has left the room', async () => {
    setRoom(sponsor, ['u1']);
    const r = await describeRoomAi('r', 'u1', false);
    expect(r.sponsor).toBeNull();
    expect(roomUpdateMany).toHaveBeenCalledWith({ where: { id: 'r', aiKeyOwnerId: 'sp' }, data: { aiKeyOwnerId: null } });
  });

  it('cannot apply without usable personal settings', async () => {
    setRoom(null, ['u1']);
    getUserAiConfig.mockResolvedValue(null);
    expect(await describeRoomAi('r', 'u1', true)).toMatchObject({ canApply: false, hasOwnSettings: false });
  });
});

describe('applyMyAiToRoom', () => {
  it('refuses a plain member, so they cannot capture the room\'s prompts', async () => {
    setRoom(null, ['u1']);
    await expect(applyMyAiToRoom('r', 'u1', false)).rejects.toThrow('Room Master or a Moderator');
    expect(roomUpdateMany).not.toHaveBeenCalled();
  });

  it('records the member as sponsor, only while nobody holds it', async () => {
    setRoom(null, ['u1']);
    await applyMyAiToRoom('r', 'u1', true);
    expect(roomUpdateMany).toHaveBeenCalledWith({ where: { id: 'r', aiKeyOwnerId: null }, data: { aiKeyOwnerId: 'u1' } });
  });

  it('is a no-op for the current sponsor', async () => {
    setRoom(sponsor, ['sp']);
    await applyMyAiToRoom('r', 'sp', true);
    expect(roomUpdateMany).not.toHaveBeenCalled();
  });

  it('refuses a non-member, even one who has settings', async () => {
    setRoom(null, []);
    await expect(applyMyAiToRoom('r', 'u1', true)).rejects.toThrow('member of this room');
  });

  it('needs the person\'s own usable settings first', async () => {
    setRoom(null, ['u1']);
    getUserAiConfig.mockResolvedValue(null);
    await expect(applyMyAiToRoom('r', 'u1', true)).rejects.toThrow('account settings');
  });

  it('refuses while someone else sponsors, naming them', async () => {
    setRoom(sponsor, ['sp', 'u1']);
    await expect(applyMyAiToRoom('r', 'u1', true)).rejects.toThrow('Sam already provides');
    expect(roomUpdateMany).not.toHaveBeenCalled();
  });

  it('loses a race for the slot cleanly', async () => {
    setRoom(null, ['u1']);
    roomUpdateMany.mockResolvedValue({ count: 0 });
    await expect(applyMyAiToRoom('r', 'u1', true)).rejects.toThrow('Someone else just applied');
  });
});

describe('removeRoomAi', () => {
  it('lets the sponsor remove themselves', async () => {
    setRoom(sponsor, ['sp']);
    await removeRoomAi('r', 'sp', false);
    expect(roomUpdateMany).toHaveBeenCalledWith({ where: { id: 'r', aiKeyOwnerId: 'sp' }, data: { aiKeyOwnerId: null } });
  });

  it('lets a Room Master or Moderator remove someone else\'s', async () => {
    setRoom(sponsor, ['sp', 'rm']);
    await removeRoomAi('r', 'rm', true);
    expect(roomUpdateMany).toHaveBeenCalledTimes(1);
  });

  it('refuses another plain member', async () => {
    setRoom(sponsor, ['sp', 'u1']);
    await expect(removeRoomAi('r', 'u1', false)).rejects.toThrow('Only the member');
    expect(roomUpdateMany).not.toHaveBeenCalled();
  });

  it('does nothing when there is no sponsor', async () => {
    setRoom(null, ['u1']);
    await removeRoomAi('r', 'u1', false);
    expect(roomUpdateMany).not.toHaveBeenCalled();
  });
});
