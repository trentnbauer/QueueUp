import { describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ gameFindMany: vi.fn(), aiComplete: vi.fn(), requireMembership: vi.fn() }));
vi.mock('../../db/client.js', () => ({ prisma: { game: { findMany: m.gameFindMany } } }));
vi.mock('./aiConfig.js', () => ({ aiComplete: m.aiComplete }));
vi.mock('../roomAccess.js', () => ({ requireMembership: m.requireMembership }));

import { aiPickTonight, buildTonightPrompt, parseTonightReply, type TonightCandidate } from './aiTonight.js';

const cand = (n: number, title: string, hours: number | null = 10): TonightCandidate => ({
  ref: `c${n}`,
  id: `uuid-${n}`,
  title,
  genre: 'Puzzle',
  platform: 'PC',
  coverImageUrl: null,
  timeToBeatHours: hours,
  want: 4,
});
const candidates = [cand(1, 'Portal'), cand(2, 'Hades', 25), cand(3, 'Celeste', null)];

describe('parseTonightReply', () => {
  it('maps refs back to the real cards and trims the reason', () => {
    const out = parseTonightReply('{"pick":{"ref":"c1","reason":"  Short and sweet. "},"alternate":{"ref":"c2","reason":"Longer."}}', candidates);
    expect(out?.pick).toMatchObject({ gameId: 'uuid-1', title: 'Portal', reason: 'Short and sweet.' });
    expect(out?.alternate?.gameId).toBe('uuid-2');
  });

  it('rejects a pick that is not in the list, so no game can be invented', () => {
    expect(parseTonightReply('{"pick":{"ref":"c99","reason":"x"},"alternate":null}', candidates)).toBeNull();
    expect(parseTonightReply('{"pick":{"ref":"Portal 2","reason":"x"}}', candidates)).toBeNull();
  });

  it('drops an alternate that is unknown or the same as the pick', () => {
    expect(parseTonightReply('{"pick":{"ref":"c1","reason":"a"},"alternate":{"ref":"c1","reason":"b"}}', candidates)?.alternate).toBeNull();
    expect(parseTonightReply('{"pick":{"ref":"c1","reason":"a"},"alternate":{"ref":"zz","reason":"b"}}', candidates)?.alternate).toBeNull();
  });

  it('returns null for a non-JSON reply', () => expect(parseTonightReply('I think Portal.', candidates)).toBeNull());

  it('caps a very long reason', () => {
    expect(parseTonightReply(`{"pick":{"ref":"c1","reason":"${'a'.repeat(500)}"}}`, candidates)?.pick.reason).toHaveLength(240);
  });
});

describe('buildTonightPrompt', () => {
  it('lists refs, hours and what they enjoyed, with their request quoted as data', () => {
    const p = buildTonightPrompt('chill, "about an hour"', candidates, ['Hollow Knight']);
    expect(p).toContain('c1: "Portal" | Puzzle | 10h | want 4');
    expect(p).toContain('c3: "Celeste" | Puzzle | unknown length');
    expect(p).toContain('"chill, \\"about an hour\\""');
    expect(p).toContain('"Hollow Knight"');
  });
});

describe('aiPickTonight for a room', () => {
  const game = (id: string, title: string, votes: number[]) => ({ id, title, genre: null, platform: 'PC', coverImageUrl: null, timeToBeatHours: 5, votes: votes.map((value) => ({ value })) });

  it('checks the person is in the room, reads the room queue, adds up everyone\'s votes and bills the room\'s AI', async () => {
    m.requireMembership.mockResolvedValue({});
    m.gameFindMany.mockResolvedValueOnce([game('a', 'Low', [1, 1]), game('b', 'High', [5, 4, 3])]).mockResolvedValueOnce([]);
    m.aiComplete.mockResolvedValue({ text: '{"pick":{"ref":"c1","reason":"Everyone wants it."},"alternate":null}', fallback: null });
    const out = await aiPickTonight('u1', 'something co-op', [], 'room1');
    expect(m.requireMembership).toHaveBeenCalledWith('room1', 'u1');
    expect(m.gameFindMany.mock.calls[0][0].where).toMatchObject({ roomId: 'room1' });
    expect(m.gameFindMany.mock.calls[0][0].where).not.toHaveProperty('addedBy');
    // The group's best (12 total) is offered first, so it is "c1".
    expect(out.pick.title).toBe('High');
    expect(m.aiComplete.mock.calls[0][0].messages[0].content).toContain('group want 12');
    expect(m.aiComplete.mock.calls[0][1]).toMatchObject({ userId: 'u1', roomId: 'room1', label: 'tonight' });
  });

  it('refuses a non-member before reading anything', async () => {
    m.gameFindMany.mockReset();
    m.requireMembership.mockRejectedValue(new Error('not a member'));
    await expect(aiPickTonight('u1', 'x', [], 'room1')).rejects.toThrow('not a member');
    expect(m.gameFindMany).not.toHaveBeenCalled();
  });
});
