import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DuplicateSuggestionGame } from '@queueup/shared';

const gameFindMany = vi.fn();
const dismissalFindMany = vi.fn(async () => []);
vi.mock('../../db/client.js', () => ({ prisma: { game: { findMany: gameFindMany }, duplicateDismissal: { findMany: dismissalFindMany } } }));
const aiComplete = vi.fn();
vi.mock('./aiConfig.js', () => ({ aiComplete }));
const notifyMergeSuggestions = vi.fn(async () => {});
vi.mock('../notifications.js', () => ({ notifyMergeSuggestions }));

const { AI_DUPLICATE_BATCH, aiScanDuplicates, chooseKeep, countDuplicateCandidates, parseDuplicateReply } = await import('./aiDuplicates.js');

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

describe('aiScanDuplicates', () => {
  beforeEach(() => {
    gameFindMany.mockReset();
    aiComplete.mockReset();
    notifyMergeSuggestions.mockClear();
  });

  // 50 games that each have a "Complete Edition" twin: 50 candidate pairs, more than one batch.
  const shelf = () =>
    Array.from({ length: 50 }, (_, i) => [
      { ...g(`a${i + 100}`, `Game ${i}`, 2010), igdbId: i * 2 + 1, igdbCollectionId: null },
      { ...g(`b${i + 100}`, `Game ${i} Complete Edition`, 2014), igdbId: i * 2 + 2, igdbCollectionId: null },
    ]).flat();
  const answerAll = (confidence: number) =>
    aiComplete.mockImplementation(async (req: { messages: { content: string }[] }) => {
      const n = (req.messages[0].content.match(/^Pair \d+:/gm) ?? []).length;
      return { text: JSON.stringify(Array.from({ length: n }, (_, i) => ({ pair: i + 1, same: true, confidence, keep: 'A', reason: 'edition' }))), fallback: null };
    });

  it('judges every candidate pair in batches and merges the results', async () => {
    gameFindMany.mockResolvedValue(shelf());
    answerAll(0.9);
    const res = await aiScanDuplicates('u1');
    expect(aiComplete).toHaveBeenCalledTimes(Math.ceil(50 / AI_DUPLICATE_BATCH));
    expect(res.checked).toBe(50);
    expect(res.pairs).toHaveLength(50);
    expect(res.pairs.every((p) => p.keep === 'a')).toBe(true);
    expect(res.stopped).toBeNull();
    // Told when the scan finishes with suggestions, even if the dialog was closed meanwhile.
    expect(notifyMergeSuggestions).toHaveBeenCalledWith('u1', 50);
  });

  it('still tells the person about what it found when a later batch fails', async () => {
    gameFindMany.mockResolvedValue(shelf());
    let calls = 0;
    aiComplete.mockImplementation(async (req: { messages: { content: string }[] }) => {
      calls += 1;
      if (calls > 1) throw new Error('limit');
      const n = (req.messages[0].content.match(/^Pair \d+:/gm) ?? []).length;
      return { text: JSON.stringify(Array.from({ length: n }, (_, i) => ({ pair: i + 1, same: true, confidence: 0.9, keep: 'A', reason: 'x' }))), fallback: null };
    });
    await aiScanDuplicates('u1');
    expect(notifyMergeSuggestions).toHaveBeenCalledWith('u1', AI_DUPLICATE_BATCH);
  });

  it('counts the cheap no-AI candidates without calling the AI', async () => {
    gameFindMany.mockResolvedValue(shelf());
    expect(await countDuplicateCandidates('u1')).toBe(50);
    expect(aiComplete).not.toHaveBeenCalled();
  });

  it('does not nudge or ask the AI when nothing looks alike', async () => {
    gameFindMany.mockResolvedValue([g('1', 'Alpha', 2000), g('2', 'Beta', 2001)].map((x, i) => ({ ...x, igdbId: i + 1, igdbCollectionId: null })));
    const res = await aiScanDuplicates('u1');
    expect(res.pairs).toEqual([]);
    expect(aiComplete).not.toHaveBeenCalled();
    expect(notifyMergeSuggestions).not.toHaveBeenCalled();
  });

  it('keeps what it found and says why it stopped when a later batch fails', async () => {
    gameFindMany.mockResolvedValue(shelf());
    let calls = 0;
    aiComplete.mockImplementation(async (req: { messages: { content: string }[] }) => {
      calls += 1;
      if (calls > 1) throw new Error("You've used today's limit");
      const n = (req.messages[0].content.match(/^Pair \d+:/gm) ?? []).length;
      return { text: JSON.stringify(Array.from({ length: n }, (_, i) => ({ pair: i + 1, same: true, confidence: 0.9, keep: 'A', reason: 'x' }))), fallback: null };
    });
    const res = await aiScanDuplicates('u1');
    expect(res.pairs).toHaveLength(AI_DUPLICATE_BATCH);
    expect(res.stopped).toBe("You've used today's limit");
  });

  it('throws when nothing could be checked at all', async () => {
    gameFindMany.mockResolvedValue(shelf());
    aiComplete.mockRejectedValue(new Error('The AI provider failed.'));
    await expect(aiScanDuplicates('u1')).rejects.toMatchObject({ statusCode: 424 });
  });
});
