import { beforeEach, describe, expect, it, vi } from 'vitest';

const findMany = vi.fn();
const count = vi.fn();
vi.mock('../../db/client.js', () => ({ prisma: { pendingLibraryImport: { findMany, count } } }));
const aiComplete = vi.fn();
vi.mock('./aiConfig.js', () => ({ aiComplete }));
const resolvePendingImport = vi.fn(async () => {});
vi.mock('../pendingImportResolve.js', () => ({ resolvePendingImport }));

const { aiMatchPendingImports, AI_MATCH_BATCH } = await import('./aiImportMatch.js');
const { AI_BATCHES_PER_REQUEST } = await import('./aiImportBatch.js');

const row = (n: number) => ({
  id: `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`,
  title: `Game ${n}`,
  source: 'playnite',
  platforms: ['pc'],
  candidates: [{ igdbId: 1000 + n, title: `Game ${n}`, platform: 'PC' }],
  createdAt: new Date(Date.UTC(2026, 9, 5, 0, 0, 0) - n * 1000),
});
const rows = (n: number) => Array.from({ length: n }, (_, i) => row(i));
const reply = (batchRows: ReturnType<typeof row>[], confidence: number) =>
  JSON.stringify(batchRows.map((r) => ({ id: r.id, igdbId: r.candidates[0].igdbId, confidence })));
/** Answers each AI call by reading the item ids out of its prompt, so every row gets a pick. */
const answerAll = (confidence: number) =>
  aiComplete.mockImplementation(async (req: { messages: { content: string }[] }) => {
    const ids = [...req.messages[0].content.matchAll(/^Item "([^"]+)"/gm)].map((m) => m[1]);
    const all = rows(AI_MATCH_BATCH * AI_BATCHES_PER_REQUEST + 5);
    return { text: reply(all.filter((r) => ids.includes(r.id)), confidence), fallback: null, source: 'user' };
  });

describe('aiMatchPendingImports (one chunk of a whole-queue run)', () => {
  beforeEach(() => {
    for (const m of [findMany, count, aiComplete, resolvePendingImport]) m.mockReset();
    resolvePendingImport.mockResolvedValue(undefined);
  });

  it('splits a full chunk into parallel batches and hands back where to carry on', async () => {
    const full = rows(AI_MATCH_BATCH * AI_BATCHES_PER_REQUEST);
    findMany.mockResolvedValue(full);
    count.mockResolvedValue(7);
    answerAll(0.7);
    const res = await aiMatchPendingImports('u1');
    expect(aiComplete).toHaveBeenCalledTimes(AI_BATCHES_PER_REQUEST);
    expect(res.checked).toBe(full.length);
    expect(res.suggestions).toHaveLength(full.length);
    expect(res.next).toBe(`${full[full.length - 1].createdAt.toISOString()}|${full[full.length - 1].id}`);
    expect(res.remaining).toBe(7);
    expect(res.stopped).toBeNull();
  });

  it('ends the run (next = null) when the chunk is the last one', async () => {
    findMany.mockResolvedValue(rows(5));
    answerAll(0.7);
    const res = await aiMatchPendingImports('u1');
    expect(res.next).toBeNull();
    expect(res.remaining).toBe(0);
    expect(count).not.toHaveBeenCalled();
  });

  it('matches very confident picks straight away', async () => {
    findMany.mockResolvedValue(rows(3));
    answerAll(0.99);
    const res = await aiMatchPendingImports('u1');
    expect(resolvePendingImport).toHaveBeenCalledTimes(3);
    expect(res.autoMatched).toBe(3);
    expect(res.suggestions).toHaveLength(0);
  });

  it('keeps what worked and says why it stopped when one batch fails', async () => {
    findMany.mockResolvedValue(rows(AI_MATCH_BATCH * 2));
    count.mockResolvedValue(0);
    let calls = 0;
    aiComplete.mockImplementation(async (req: { messages: { content: string }[] }) => {
      calls += 1;
      if (calls === 2) throw Object.assign(new Error("You've used today's limit"), { statusCode: 429 });
      const ids = [...req.messages[0].content.matchAll(/^Item "([^"]+)"/gm)].map((m) => m[1]);
      return { text: reply(rows(AI_MATCH_BATCH * 2).filter((r) => ids.includes(r.id)), 0.7), fallback: null, source: 'server' };
    });
    const res = await aiMatchPendingImports('u1');
    expect(res.suggestions).toHaveLength(AI_MATCH_BATCH);
    expect(res.stopped).toBe("You've used today's limit");
    expect(res.next).toBeNull();
  });

  it('throws when nothing could be checked at all', async () => {
    findMany.mockResolvedValue(rows(4));
    aiComplete.mockRejectedValue(new Error('The AI provider failed.'));
    await expect(aiMatchPendingImports('u1')).rejects.toMatchObject({ statusCode: 424, message: 'The AI provider failed.' });
  });

  it('does not call the AI for titles with no candidates', async () => {
    findMany.mockResolvedValue(rows(3).map((r) => ({ ...r, candidates: [] })));
    const res = await aiMatchPendingImports('u1');
    expect(aiComplete).not.toHaveBeenCalled();
    expect(res.suggestions).toEqual([]);
  });
});
