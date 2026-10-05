import { describe, expect, it, vi } from 'vitest';

vi.mock('../../db/client.js', () => ({ prisma: {} }));
vi.mock('./aiConfig.js', () => ({ aiComplete: vi.fn() }));

import { buildTonightPrompt, parseTonightReply, type TonightCandidate } from './aiTonight.js';

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
