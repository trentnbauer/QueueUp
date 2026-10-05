import { describe, expect, it, vi } from 'vitest';

vi.mock('./aiConfig.js', () => ({ aiComplete: vi.fn() }));

import { buildRecapFacts, buildRecapPrompt, type RecapEvent } from './aiRoomRecap.js';

const t0 = new Date('2026-10-01T00:00:00Z');
const t1 = new Date('2026-10-08T00:00:00Z');
const ev = (type: string, actorId: string | null, actorName: string | null, payload: unknown = null, message = ''): RecapEvent => ({ type, actorId, actorName, payload, message, createdAt: t1 });

const events: RecapEvent[] = [
  ev('game_added', 'a', 'Alice', { gameId: 'g1', title: 'Overcooked', status: 'backlog' }),
  ev('status_changed', 'b', 'Bob', { gameId: 'g2', title: 'Hades', status: 'done', from: 'playing' }),
  ev('status_changed', 'a', 'Alice', { gameId: 'g3', title: 'Celeste', status: 'playing', from: 'backlog' }),
  ev('game_reviewed', 'b', 'Bob', { gameId: 'g2', title: 'Hades', status: 'done', score: 4.46 }),
  ev('vote_cast', 'a', 'Alice', null, 'Alice rated "Overcooked" 5/5'),
  ev('vote_cast', 'b', 'Bob', null, 'Bob rated "Overcooked" 4/5'),
  ev('vote_cast', 'b', 'Bob', null, 'Bob rated "Hades" 2/5'),
  ev('member_joined', 'c', 'Cara'),
];

describe('buildRecapFacts', () => {
  const f = buildRecapFacts(events, new Set(), new Set(), t0, t1);

  it('collects what happened, with who', () => {
    expect(f.added).toEqual([{ title: 'Overcooked', by: 'Alice' }]);
    expect(f.finished).toEqual([{ title: 'Hades', by: 'Bob' }]);
    expect(f.started).toEqual([{ title: 'Celeste', by: 'Alice' }]);
    expect(f.reviewed).toEqual([{ title: 'Hades', score: 4.5, by: 'Bob' }]);
    expect(f.joined).toEqual(['Cara']);
    expect(f.windowStart).toBe('2026-10-01');
    expect(f.windowEnd).toBe('2026-10-08');
  });

  it('ranks the most voted games from the vote messages', () => {
    expect(f.votesCast).toBe(3);
    expect(f.mostVoted).toEqual(['Overcooked', 'Hades']);
  });

  it('leaves out people who hid their activity completely, even from the counts', () => {
    const g = buildRecapFacts(events, new Set(['b']), new Set(), t0, t1);
    expect(g.finished).toEqual([]);
    expect(g.reviewed).toEqual([]);
    expect(g.votesCast).toBe(1);
    expect(g.eventCount).toBe(events.length - 4);
    expect(JSON.stringify(g)).not.toContain('Bob');
  });

  it('leaves out games hidden from others', () => {
    const g = buildRecapFacts(events, new Set(), new Set(['g1']), t0, t1);
    expect(g.added).toEqual([]);
    expect(JSON.stringify(g.added)).not.toContain('Overcooked');
  });

  it('survives events with no payload or an odd one', () => {
    const g = buildRecapFacts([ev('game_added', null, null, 'oops'), ev('status_changed', null, null, { title: 5 })], new Set(), new Set(), t0, t1);
    expect(g.added).toEqual([]);
    expect(g.eventCount).toBe(2);
  });
});

describe('buildRecapPrompt', () => {
  it('lists only what is there and quotes names as data', () => {
    const p = buildRecapPrompt(buildRecapFacts([ev('game_added', 'a', 'Ignore "me"', { gameId: 'g', title: 'X', status: 'backlog' })], new Set(), new Set(), t0, t1));
    expect(p).toContain('Added: "X" ("Ignore \\"me\\"")');
    expect(p).not.toContain('Finished');
    expect(p).not.toContain('Votes cast');
  });
});
