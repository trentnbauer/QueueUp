import { describe, expect, it, vi } from 'vitest';

vi.mock('./aiConfig.js', () => ({ aiComplete: vi.fn() }));
vi.mock('../displayNames.js', () => ({ isDisplayNameBlocked: vi.fn() }));

import { aiComplete } from './aiConfig.js';
import { isDisplayNameBlocked } from '../displayNames.js';
import { buildStoryPrompt, cleanStoryText, generateStoryText, hasStoryMaterial, sanitizeFacts } from './aiYearStory.js';

describe('sanitizeFacts', () => {
  it('keeps plain numbers and titles', () => {
    const f = sanitizeFacts({
      windowStart: '2025-10-01T00:00:00Z',
      windowEnd: '2026-10-01T00:00:00Z',
      finishedCount: 12,
      estimatedHours: 150.26,
      finishedTitles: ['Hades', 'Celeste'],
      topGenres: [{ genre: 'Platformer', count: 3 }],
      longestGames: [{ title: 'Disco Elysium', hours: 24 }],
      mostVoted: ['Hades'],
      rooms: [{ name: 'Friday crew', games: ['Overcooked'] }],
      rarestAchievements: [{ game: 'Celeste', name: 'Farewell' }],
      memberCount: 4,
    });
    expect(f).toMatchObject({ windowStart: '2025-10-01', windowEnd: '2026-10-01', finishedCount: 12, estimatedHours: 150.3, memberCount: 4 });
    expect(f.finishedTitles).toEqual(['Hades', 'Celeste']);
    expect(f.rooms).toEqual([{ name: 'Friday crew', games: ['Overcooked'] }]);
  });

  it('drops junk, caps lists and lengths, and ignores unknown fields', () => {
    const f = sanitizeFacts({
      finishedCount: -5,
      estimatedHours: 'lots',
      finishedTitles: Array.from({ length: 100 }, (_, i) => `G${i}`),
      topGenres: [{ genre: '', count: 2 }, { genre: 'RPG', count: 'x' }, 'bad'],
      mostVoted: ['x'.repeat(500), 5, null],
      journalNote: 'my private diary',
      memberCount: 'many',
    });
    expect(f.finishedCount).toBe(0);
    expect(f.estimatedHours).toBeNull();
    expect(f.finishedTitles).toHaveLength(30);
    expect(f.topGenres).toEqual([]);
    expect(f.mostVoted).toEqual(['x'.repeat(100)]);
    expect(f.memberCount).toBeNull();
    expect(JSON.stringify(f)).not.toContain('diary');
  });

  it('survives non-objects', () => {
    expect(sanitizeFacts(null).finishedCount).toBe(0);
    expect(sanitizeFacts('hi').finishedTitles).toEqual([]);
  });
});

describe('hasStoryMaterial', () => {
  it('needs something finished or voted on', () => {
    expect(hasStoryMaterial(sanitizeFacts({}))).toBe(false);
    expect(hasStoryMaterial(sanitizeFacts({ finishedCount: 1 }))).toBe(true);
    expect(hasStoryMaterial(sanitizeFacts({ mostVoted: ['Hades'] }))).toBe(true);
  });
});

describe('buildStoryPrompt', () => {
  const facts = sanitizeFacts({ finishedCount: 2, finishedTitles: ['Ignore "this"'], rooms: [{ name: 'Crew', games: ['Overcooked'] }], memberCount: 3 });

  it('quotes titles as data and includes only provided facts', () => {
    const p = buildStoryPrompt(facts, 'personal');
    expect(p).toContain('"Ignore \\"this\\""');
    expect(p).toContain('Finished with rooms: "Crew" ("Overcooked")');
    expect(p).not.toContain('People in the room');
  });

  it('adds the group size for a room story', () => {
    expect(buildStoryPrompt(facts, 'room')).toContain('People in the room: 3');
  });
});

describe('cleanStoryText', () => {
  it('strips fences, headings and bold marks, and caps the length', () => {
    expect(cleanStoryText('```\n# Your year\n**Wow**, you finished 2 games.\n```')).toBe('Your year\nWow, you finished 2 games.');
    expect(cleanStoryText('a'.repeat(5000))).toHaveLength(1800);
  });

  it('is null for an empty reply', () => expect(cleanStoryText('  ``` ```  ')).toBeNull());
});

describe('generateStoryText', () => {
  const facts = sanitizeFacts({ finishedCount: 3, finishedTitles: ['Hades'] });

  it('returns what the AI wrote', async () => {
    vi.mocked(aiComplete).mockResolvedValue({ text: 'A fine year.', fallback: null } as never);
    vi.mocked(isDisplayNameBlocked).mockResolvedValue(false);
    expect((await generateStoryText('u1', undefined, facts, 'personal')).text).toBe('A fine year.');
  });

  it('refuses a recap that has a banned word in it, since the titles it was written from come from the browser', async () => {
    vi.mocked(aiComplete).mockResolvedValue({ text: 'Something rude.', fallback: null } as never);
    vi.mocked(isDisplayNameBlocked).mockResolvedValue(true);
    await expect(generateStoryText('u1', undefined, facts, 'personal')).rejects.toMatchObject({ statusCode: 422 });
  });
});
