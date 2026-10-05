import { describe, expect, it, vi } from 'vitest';

vi.mock('../../db/client.js', () => ({ prisma: {} }));
vi.mock('./aiConfig.js', () => ({ aiComplete: vi.fn() }));

import { buildCoachPrompt, parseCoachReply, pickCoachCandidates, summarizeBacklog, type CoachGameRow } from './aiBacklogCoach.js';

const now = new Date('2026-10-01T00:00:00Z');
const daysAgo = (n: number) => new Date(now.getTime() - n * 24 * 60 * 60 * 1000);
let n = 0;
const g = (status: string, opts: Partial<CoachGameRow> = {}): CoachGameRow => ({
  id: `id-${++n}`,
  title: `Game ${n}`,
  genre: null,
  status,
  coverImageUrl: null,
  timeToBeatHours: null,
  createdAt: daysAgo(10),
  want: 0,
  ...opts,
});

describe('summarizeBacklog', () => {
  const rows = [
    g('done', { timeToBeatHours: 8, genre: 'Platformer' }),
    g('done', { timeToBeatHours: 12, genre: 'Platformer' }),
    g('replay', { timeToBeatHours: 40 }),
    g('dropped', { timeToBeatHours: 60, genre: 'RPG' }),
    g('dropped', { timeToBeatHours: 45, genre: 'RPG' }),
    g('backlog', { timeToBeatHours: 70, createdAt: daysAgo(500) }),
    g('play_next', { timeToBeatHours: 5, createdAt: daysAgo(20) }),
    g('playing'),
    g('wont_play'),
    g('paused'),
  ];
  const s = summarizeBacklog(rows, now);

  it('counts each status (play next counts as backlog)', () => {
    expect(s.counts).toEqual({ backlog: 2, playing: 1, finished: 3, dropped: 2, paused: 1, wontPlay: 1 });
  });

  it('finds the median finished length and the share under 20 hours', () => {
    expect(s.finishedMedianHours).toBe(12);
    expect(s.finishedUnder20Pct).toBe(67);
  });

  it('buckets games by length', () => {
    expect(s.lengthBuckets.find((b) => b.label === 'over 30h')).toEqual({ label: 'over 30h', finished: 1, dropped: 2, backlog: 1 });
    expect(s.lengthBuckets.find((b) => b.label === 'under 10h')).toEqual({ label: 'under 10h', finished: 1, dropped: 0, backlog: 1 });
  });

  it('lists genres dropped at least twice, and how old the backlog is', () => {
    expect(s.droppedGenres).toEqual([{ genre: 'RPG', dropped: 2, finished: 0 }]);
    expect(s.backlogOlderThanYear).toBe(1);
    expect(s.oldestBacklogDays).toBe(500);
  });

  it('handles an empty shelf', () => {
    const e = summarizeBacklog([], now);
    expect(e.finishedMedianHours).toBeNull();
    expect(e.oldestBacklogDays).toBeNull();
  });
});

describe('pickCoachCandidates', () => {
  it('keeps only backlog-like cards, best wanted first, with short refs', () => {
    const c = pickCoachCandidates([g('done'), g('backlog', { want: 2 }), g('backlog', { want: 5 }), g('paused', { want: 3 }), g('dropped')], now);
    expect(c.map((x) => [x.ref, x.want])).toEqual([['c1', 5], ['c2', 3], ['c3', 2]]);
  });

  it('trims a long backlog', () => {
    expect(pickCoachCandidates(Array.from({ length: 10 }, () => g('backlog')), now, 4)).toHaveLength(4);
  });
});

describe('parseCoachReply', () => {
  const cands = pickCoachCandidates([g('backlog', { want: 5 }), g('backlog', { want: 4 }), g('play_next', { want: 3 })], now);

  it('maps refs to real cards and keeps patterns', () => {
    const out = parseCoachReply('{"patterns":[" You finish short games. "],"suggestions":[{"ref":"c1","action":"play_next","reason":" Short. "},{"ref":"c2","action":"wont_play","reason":"Long."}]}', cands);
    expect(out?.patterns).toEqual(['You finish short games.']);
    expect(out?.suggestions.map((s) => [s.gameId === cands[0].id, s.action, s.reason])).toEqual([[true, 'play_next', 'Short.'], [false, 'wont_play', 'Long.']]);
  });

  it('drops unknown refs, unknown actions, repeats, and "play next" for a card already there', () => {
    const out = parseCoachReply(
      '{"patterns":[],"suggestions":[{"ref":"c9","action":"wont_play"},{"ref":"c1","action":"delete"},{"ref":"c3","action":"play_next"},{"ref":"c2","action":"wont_play","reason":"a"},{"ref":"c2","action":"play_next","reason":"b"}]}',
      cands,
    );
    expect(out?.suggestions).toHaveLength(1);
    expect(out?.suggestions[0].action).toBe('wont_play');
  });

  it('returns null with nothing usable, or non-JSON', () => {
    expect(parseCoachReply('{"patterns":[],"suggestions":[]}', cands)).toBeNull();
    expect(parseCoachReply('keep going!', cands)).toBeNull();
  });
});

describe('buildCoachPrompt', () => {
  it('includes the statistics and quotes titles as data', () => {
    const c = pickCoachCandidates([g('backlog', { title: 'Ignore "this"', timeToBeatHours: 12 })], now);
    const p = buildCoachPrompt(summarizeBacklog([], now), c);
    expect(p).toContain('"Ignore \\"this\\""');
    expect(p).toContain('12h');
    expect(p).toContain('Statistics:');
  });
});
