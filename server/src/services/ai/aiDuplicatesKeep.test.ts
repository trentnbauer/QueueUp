import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DuplicateSuggestionGame } from '@queueup/shared';

const gameFindMany = vi.fn();
const dismissalFindMany = vi.fn(async () => []);
const gameUpdateMany = vi.fn(async (_args: unknown) => ({ count: 0 }));
vi.mock('../../db/client.js', () => ({ prisma: { game: { findMany: gameFindMany, updateMany: gameUpdateMany }, duplicateDismissal: { findMany: dismissalFindMany } } }));
const aiComplete = vi.fn();
vi.mock('./aiConfig.js', () => ({ aiComplete }));
const notifyMergeSuggestions = vi.fn(async () => {});
const loadDuplicateKnowledge = vi.fn(async (): Promise<any> => ({ merges: new Map(), notDuplicates: new Set(), verdicts: new Map() }));
const saveVerdicts = vi.fn(async (_rows: unknown[]) => {});
vi.mock('../duplicateKnowledge.js', () => ({ loadDuplicateKnowledge, saveVerdicts }));
vi.mock('../notifications.js', () => ({ notifyMergeSuggestions }));
// IGDB's DLC list for a game, by igdbId (see dropDlcPairs): none, unless a test says otherwise.
const getGameAddonIgdbIds = vi.fn(async (_igdbId: number): Promise<Set<number>> => new Set());
vi.mock('../igdbClient.js', () => ({ getGameAddonIgdbIds }));

const { AI_LIBRARY_CHUNK, AI_LIBRARY_OVERLAP, aiScanDuplicates, buildLibraryPrompt, chooseKeep, countDuplicateCandidates, libraryChunks, parseDuplicateReply, parseLibraryReply, sameIgdbPairs } = await import('./aiDuplicates.js');

const g = (id: string, title: string, releaseYear: number | null): DuplicateSuggestionGame => ({
  id,
  igdbId: Number(id.replace(/\D/g, '')) || 1,
  title,
  platform: 'PC',
  releaseYear,
  coverImageUrl: null,
  status: 'backlog',
});

describe('chooseKeep (merge into the base game / earlier release)', () => {
  it('keeps the earlier release when both years are known, whatever the AI said', () => {
    expect(chooseKeep(g('1', 'Skyrim', 2011), g('2', 'Skyrim Special Edition', 2016), 'B')).toBe('a');
    expect(chooseKeep(g('1', 'Skyrim Special Edition', 2016), g('2', 'Skyrim', 2011), 'A')).toBe('b');
  });

  it('uses the AI pick when the years do not decide it', () => {
    expect(chooseKeep(g('1', 'Hades', 2020), g('2', 'Hades Complete', 2020), 'b')).toBe('b');
    expect(chooseKeep(g('1', 'Hades', null), g('2', 'Hades Complete', 2020), ' A ')).toBe('a');
  });

  it('falls back to the shorter (base) title, then the first card', () => {
    expect(chooseKeep(g('1', 'Doom Complete Edition', 2016), g('2', 'Doom', 2016), undefined)).toBe('b');
    expect(chooseKeep(g('1', 'Doom', 2016), g('2', 'Doom', 2016), 'nonsense')).toBe('a');
  });
});

describe('parseDuplicateReply keep', () => {
  it('carries the card to keep on each suggestion', () => {
    const pairs: [DuplicateSuggestionGame, DuplicateSuggestionGame][] = [[g('1', 'Skyrim', 2011), g('2', 'Skyrim Special Edition', 2016)]];
    const out = parseDuplicateReply('[{"pair":1,"same":true,"confidence":0.9,"keep":"B","reason":"re-release"}]', pairs);
    expect(out[0].keep).toBe('a');
  });
});

describe('aiScanDuplicates (whole shelf)', () => {
  beforeEach(() => {
    gameFindMany.mockReset();
    gameUpdateMany.mockClear();
    aiComplete.mockReset();
    notifyMergeSuggestions.mockClear();
    saveVerdicts.mockClear();
    loadDuplicateKnowledge.mockReset();
    loadDuplicateKnowledge.mockResolvedValue({ merges: new Map(), notDuplicates: new Set(), verdicts: new Map() });
    getGameAddonIgdbIds.mockReset();
    getGameAddonIgdbIds.mockResolvedValue(new Set());
    gameUpdateMany.mockClear();
  });

  const card = (id: string, igdbId: number, title: string, releaseYear: number | null = null) => ({ ...g(id, title, releaseYear), igdbId, igdbCollectionId: null });
  /** The numbers the prompt gave each title, so a fake reply can point at cards by name. */
  const numbersIn = (prompt: string) => new Map(prompt.split('\n').map((line) => { const m = line.match(/^(\d+)\. "(.*)"/); return [m?.[2] ?? '', Number(m?.[1])]; }));
  const replyPairs = (pairs: [string, string][], confidence = 0.9) =>
    aiComplete.mockImplementation(async (req: { messages: { content: string }[] }) => {
      const nums = numbersIn(req.messages[0].content);
      const items = pairs.filter(([x, y]) => nums.has(x) && nums.has(y)).map(([x, y]) => ({ a: nums.get(x), b: nums.get(y), confidence, keep: 'a', reason: 'same game' }));
      return { text: JSON.stringify(items), fallback: null };
    });

  it('sends every shelf game, and finds duplicates whose titles look nothing alike', async () => {
    gameFindMany.mockResolvedValue([card('1', 1, 'Halo: The Master Chief Collection', 2014), card('2', 2, 'Halo MCC', 2019), card('3', 3, 'Portal')]);
    replyPairs([['Halo: The Master Chief Collection', 'Halo MCC']]);
    const res = await aiScanDuplicates('u1');
    expect(aiComplete).toHaveBeenCalledTimes(1);
    const prompt = aiComplete.mock.calls[0][0].messages[0].content as string;
    for (const t of ['Halo MCC', 'Halo: The Master Chief Collection', 'Portal']) expect(prompt).toContain(t);
    expect(res).toMatchObject({ checked: 3, candidates: 0, reused: 0, stopped: null });
    expect(res.pairs).toHaveLength(1);
    expect(res.pairs[0]).toMatchObject({ source: 'ai', keep: 'a' });
    expect(res.pairs[0].a.title).toBe('Halo: The Master Chief Collection');
    expect(notifyMergeSuggestions).toHaveBeenCalledWith('u1', 1);
  });

  it('splits a big shelf into overlapping chunks so every game is checked', async () => {
    const shelf = Array.from({ length: 400 }, (_, i) => card(`g${i}`, i + 1, `Title ${String(i).padStart(3, '0')}`));
    gameFindMany.mockResolvedValue(shelf);
    aiComplete.mockResolvedValue({ text: '[]', fallback: null });
    const res = await aiScanDuplicates('u1');
    expect(aiComplete).toHaveBeenCalledTimes(libraryChunks(shelf).length);
    expect(res.checked).toBe(400);
  });

  it('pairs cards IGDB says are the same game first, without the AI, and sends only one of them to the AI', async () => {
    gameFindMany.mockResolvedValue([card('x1', 7, 'Skyrim', 2011), card('x2', 7, 'The Elder Scrolls V: Skyrim', 2011), card('y', 8, 'Portal')]);
    aiComplete.mockResolvedValue({ text: '[]', fallback: null });
    const res = await aiScanDuplicates('u1');
    expect(res.pairs).toHaveLength(1);
    expect(res.pairs[0]).toMatchObject({ source: 'igdb', confidence: 1 });
    const prompt = aiComplete.mock.calls[0][0].messages[0].content as string;
    expect(prompt.split('\n')).toHaveLength(2);
    expect(saveVerdicts.mock.calls[0][0]).toEqual([]);
    // Dismissing the pair hides it next time.
    dismissalFindMany.mockResolvedValueOnce([{ igdbIdLow: 7, igdbIdHigh: 7 }] as never);
    expect((await aiScanDuplicates('u1')).pairs).toEqual([]);
  });

  it('carries on where an earlier scan stopped: chunks already checked are skipped, and their duplicates come back from saved answers', async () => {
    const checkedBefore = new Date('2026-10-01T00:00:00Z');
    // 300 games: two chunks. The first chunk was checked before; the second was not.
    const shelf = Array.from({ length: 300 }, (_, i) => ({ ...card(`g${i}`, i + 1, `Title ${String(i).padStart(3, '0')}`), duplicateCheckedAt: i < AI_LIBRARY_CHUNK ? checkedBefore : null }));
    gameFindMany.mockResolvedValue(shelf);
    loadDuplicateKnowledge.mockResolvedValue({ merges: new Map(), notDuplicates: new Set(), verdicts: new Map([['1:2', { same: true, keepIgdbId: 1, confidence: 0.9, reason: 'saved' }]]) });
    aiComplete.mockResolvedValue({ text: '[]', fallback: null });
    const res = await aiScanDuplicates('u1');
    const chunks = libraryChunks(shelf);
    expect(aiComplete).toHaveBeenCalledTimes(chunks.length - 1);
    expect(res.alreadyChecked).toBeGreaterThan(0);
    expect(res.remaining).toBe(0);
    expect(res.pairs).toMatchObject([{ reason: 'saved' }]);
    // The cards it did check are recorded.
    expect(gameUpdateMany).toHaveBeenCalledTimes(chunks.length - 1);
    // "Scan again" checks every chunk.
    aiComplete.mockClear();
    await aiScanDuplicates('u1', { fresh: true });
    expect(aiComplete).toHaveBeenCalledTimes(chunks.length);
  });

  it('says how many games are left when the daily limit stops it', async () => {
    const shelf = Array.from({ length: 300 }, (_, i) => card(`g${i}`, i + 1, `Title ${String(i).padStart(3, '0')}`));
    gameFindMany.mockResolvedValue(shelf);
    let calls = 0;
    aiComplete.mockImplementation(async () => {
      calls += 1;
      if (calls > 1) throw new Error("You've used today's limit");
      return { text: '[]', fallback: null };
    });
    const res = await aiScanDuplicates('u1');
    expect(res.checked).toBe(AI_LIBRARY_CHUNK);
    expect(res.remaining).toBe(300 - AI_LIBRARY_CHUNK);
    expect(res.alreadyChecked).toBe(0);
    expect(res.stopped).toBe("You've used today's limit");
  });

  it('suggests a pair other people merged even when the titles look nothing alike', async () => {
    gameFindMany.mockResolvedValue([card('a', 1, 'Halo: The Master Chief Collection', 2014), card('b', 2, 'Halo MCC', 2019)]);
    loadDuplicateKnowledge.mockResolvedValue({ merges: new Map([['1:2', { users: 2, keepIgdbId: 1 }]]), notDuplicates: new Set(), verdicts: new Map() });
    aiComplete.mockResolvedValue({ text: '[]', fallback: null });
    const res = await aiScanDuplicates('u1');
    expect(res.pairs).toMatchObject([{ source: 'community', mergedBy: 2, keep: 'a' }]);
  });

  it('suggests what other people merged straight away and still asks the AI about the rest', async () => {
    gameFindMany.mockResolvedValue([card('a1', 1, 'Alpha', 2010), card('b1', 2, 'Alpha Complete Edition', 2014), card('c', 3, 'Gamma')]);
    loadDuplicateKnowledge.mockResolvedValue({ merges: new Map([['1:2', { users: 3, keepIgdbId: 2 }]]), notDuplicates: new Set(), verdicts: new Map() });
    replyPairs([['Alpha', 'Alpha Complete Edition']]);
    const res = await aiScanDuplicates('u1');
    expect(res.reused).toBe(1);
    expect(res.pairs).toHaveLength(1);
    expect(res.pairs[0]).toMatchObject({ source: 'community', mergedBy: 3, keep: 'b' });
  });

  it('never suggests a pair the person dismissed or people agreed is different', async () => {
    gameFindMany.mockResolvedValue([card('a', 1, 'Alpha'), card('b', 2, 'Alpha Remastered'), card('c', 3, 'Beta'), card('d', 4, 'Beta Gold')]);
    dismissalFindMany.mockResolvedValueOnce([{ igdbIdLow: 1, igdbIdHigh: 2 }] as never);
    loadDuplicateKnowledge.mockResolvedValue({ merges: new Map(), notDuplicates: new Set(['3:4']), verdicts: new Map() });
    replyPairs([['Alpha', 'Alpha Remastered'], ['Beta', 'Beta Gold']]);
    const res = await aiScanDuplicates('u1');
    expect(res.pairs).toEqual([]);
    expect(saveVerdicts.mock.calls[0][0]).toEqual([]);
  });

  it('reuses an earlier "same game" answer unless asked to scan again', async () => {
    gameFindMany.mockResolvedValue([card('a', 1, 'Alpha', 2010), card('b', 2, 'Alpha Complete Edition', 2014)]);
    loadDuplicateKnowledge.mockResolvedValue({ merges: new Map(), notDuplicates: new Set(), verdicts: new Map([['1:2', { same: true, keepIgdbId: 1, confidence: 0.9, reason: 'edition' }]]) });
    aiComplete.mockResolvedValue({ text: '[]', fallback: null });
    expect(await aiScanDuplicates('u1')).toMatchObject({ reused: 1, pairs: [{ source: 'ai', reason: 'edition' }] });
    expect((await aiScanDuplicates('u1', { fresh: true })).pairs).toEqual([]);
  });

  it('remembers the AI\'s "same game" answers for everyone', async () => {
    gameFindMany.mockResolvedValue([card('a', 1, 'Alpha', 2010), card('b', 2, 'Alpha GOTY', 2012)]);
    replyPairs([['Alpha', 'Alpha GOTY']]);
    await aiScanDuplicates('u1');
    const saved = saveVerdicts.mock.calls[0][0] as { igdbIdA: number; igdbIdB: number; same: boolean; keepIgdbId: number }[];
    expect(saved.map((v) => [v.igdbIdA, v.igdbIdB, v.same, v.keepIgdbId])).toEqual([[1, 2, true, 1]]);
  });

  it('does not ask the AI with fewer than two games', async () => {
    gameFindMany.mockResolvedValue([card('a', 1, 'Alpha')]);
    const res = await aiScanDuplicates('u1');
    expect(aiComplete).not.toHaveBeenCalled();
    expect(res).toMatchObject({ pairs: [], checked: 0 });
    expect(notifyMergeSuggestions).not.toHaveBeenCalled();
  });

  it('keeps what it found and says why it stopped when a later chunk fails', async () => {
    const shelf = Array.from({ length: 300 }, (_, i) => card(`g${i}`, i + 1, `Title ${String(i).padStart(3, '0')}`));
    gameFindMany.mockResolvedValue(shelf);
    let calls = 0;
    aiComplete.mockImplementation(async () => {
      calls += 1;
      if (calls > 1) throw new Error("You've used today's limit");
      return { text: '[{"a":1,"b":2,"confidence":0.9,"keep":"a","reason":"x"}]', fallback: null };
    });
    const res = await aiScanDuplicates('u1');
    expect(res.pairs).toHaveLength(1);
    expect(res.checked).toBe(AI_LIBRARY_CHUNK);
    expect(res.stopped).toBe("You've used today's limit");
  });

  it('keeps answers already known when the AI fails, and throws when nothing could be answered', async () => {
    gameFindMany.mockResolvedValue([card('a', 1, 'Alpha', 2010), card('b', 2, 'Alpha Complete Edition', 2014)]);
    aiComplete.mockRejectedValue(new Error('The AI provider failed.'));
    await expect(aiScanDuplicates('u1')).rejects.toMatchObject({ statusCode: 424 });
    loadDuplicateKnowledge.mockResolvedValue({ merges: new Map([['1:2', { users: 2, keepIgdbId: 1 }]]), notDuplicates: new Set(), verdicts: new Map() });
    const res = await aiScanDuplicates('u1');
    expect(res.pairs).toHaveLength(1);
    expect(res.stopped).not.toBeNull();
  });

  it('keeps a DLC card whose title looks like its base game out of the scan, and links it', async () => {
    gameFindMany.mockResolvedValue([card('base', 1, 'Cyberpunk 2077', 2020), card('dlc', 2, 'Cyberpunk 2077: Phantom Liberty', 2023), card('p', 3, 'Portal')]);
    getGameAddonIgdbIds.mockImplementation(async (igdbId) => new Set(igdbId === 1 ? [2] : []));
    // An AI that would call them the same game if it were asked.
    replyPairs([['Cyberpunk 2077', 'Cyberpunk 2077: Phantom Liberty']]);
    const res = await aiScanDuplicates('u1');
    const prompt = aiComplete.mock.calls[0][0].messages[0].content as string;
    expect(prompt).not.toContain('Phantom Liberty');
    expect(res).toMatchObject({ pairs: [], candidates: 0, checked: 2 });
    expect(gameUpdateMany).toHaveBeenCalledWith({ where: { id: 'dlc', roomId: null, addedBy: 'u1', baseGameId: null }, data: { baseGameId: 'base' } });
  });

  it('drops a game and its DLC that the AI or an earlier answer paired up, and does not remember them as the same game', async () => {
    // Titles that don't look alike, so only the AI's answer and the saved one pair them.
    gameFindMany.mockResolvedValue([card('w', 1, 'The Witcher 3: Wild Hunt', 2015), card('bw', 2, 'Blood and Wine', 2016), card('s', 3, 'Skyrim', 2011), card('dg', 4, 'Dawnguard', 2012)]);
    getGameAddonIgdbIds.mockImplementation(async (igdbId) => new Set(igdbId === 1 ? [2] : igdbId === 3 ? [4] : []));
    loadDuplicateKnowledge.mockResolvedValue({ merges: new Map(), notDuplicates: new Set(), verdicts: new Map([['3:4', { same: true, keepIgdbId: 3, confidence: 0.9, reason: 'saved' }]]) });
    replyPairs([['The Witcher 3: Wild Hunt', 'Blood and Wine']]);
    const res = await aiScanDuplicates('u1');
    expect(res.pairs).toEqual([]);
    expect(saveVerdicts.mock.calls[0][0]).toEqual([]);
    expect(notifyMergeSuggestions).toHaveBeenCalledWith('u1', 0);
  });

  it('counts the cheap no-AI candidates without calling the AI', async () => {
    gameFindMany.mockResolvedValue([card('a', 1, 'Alpha'), card('b', 2, 'Alpha Complete Edition'), card('c', 3, 'Beta')]);
    expect(await countDuplicateCandidates('u1')).toBe(1);
    expect(aiComplete).not.toHaveBeenCalled();
  });
});

describe('libraryChunks', () => {
  it('sorts by title core and overlaps neighbouring chunks', () => {
    const games = Array.from({ length: 300 }, (_, i) => ({ title: `T${String(299 - i).padStart(3, '0')}` }));
    const chunks = libraryChunks(games);
    expect(chunks[0][0].title).toBe('T000');
    expect(chunks.every((c) => c.length <= AI_LIBRARY_CHUNK)).toBe(true);
    // Last cards of one chunk open the next.
    expect(chunks[1].slice(0, AI_LIBRARY_OVERLAP)).toEqual(chunks[0].slice(-AI_LIBRARY_OVERLAP));
    expect(new Set(chunks.flat().map((x) => x.title)).size).toBe(300);
    expect(libraryChunks([{ title: 'b' }, { title: 'The A' }])).toEqual([[{ title: 'The A' }, { title: 'b' }]]);
    expect(libraryChunks([])).toEqual([]);
  });
});

describe('parseLibraryReply', () => {
  const cards = [g('1', 'Alpha', 2010), g('2', 'Alpha GOTY', 2012), g('3', 'Beta', null)];
  it('keeps sure pairs of two different known cards, each once, best first', () => {
    const out = parseLibraryReply(
      '[{"a":1,"b":2,"confidence":0.8,"keep":"b","reason":" edition "},{"a":2,"b":1,"confidence":0.9},{"a":1,"b":1,"confidence":1},{"a":1,"b":9,"confidence":1},{"a":3,"b":2,"confidence":0.95,"keep":"a"},{"a":1,"b":3,"confidence":0.3}]',
      cards,
    );
    expect(out.map((p) => [p.a.id, p.b.id])).toEqual([['3', '2'], ['1', '2']]);
    // Known, different release years decide which to keep.
    expect(out[1]).toMatchObject({ keep: 'a', reason: 'edition' });
    expect(parseLibraryReply('nope', cards)).toEqual([]);
  });
});

describe('sameIgdbPairs and buildLibraryPrompt', () => {
  it('pairs every extra card of one IGDB game with the one to keep', () => {
    const cards = [{ ...g('1', 'Game Deluxe', 2016), igdbId: 5 }, { ...g('2', 'Game', 2015), igdbId: 5 }, { ...g('3', 'Game GOTY', null), igdbId: 5 }, { ...g('4', 'Other', 2015), igdbId: 6 }];
    expect(sameIgdbPairs(cards).map((p) => [p.a.id, p.b.id, p.keep])).toEqual([['2', '1', 'a'], ['2', '3', 'a']]);
  });

  it('gives each card its title, full release date (or year) and platform', () => {
    const cards = [g('1', 'Alpha', 2010), g('2', 'Beta', null), g('3', 'Gamma', 2012)];
    const prompt = buildLibraryPrompt(cards, new Map([['1', new Date('2010-03-04T00:00:00Z')]]));
    expect(prompt.split('\n')).toEqual(['1. "Alpha", released 2010-03-04, PC', '2. "Beta", release date unknown, PC', '3. "Gamma", released 2012, PC']);
  });
});
