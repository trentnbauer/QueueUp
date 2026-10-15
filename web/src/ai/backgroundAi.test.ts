import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';

const h = vi.hoisted(() => ({ aiMatch: vi.fn() }));
vi.mock('../api/pendingImports', () => ({ PENDING_IMPORTS_QUERY_KEY: ['pending'], pendingImportsApi: { aiMatch: h.aiMatch } }));

import { AI_MATCH_RESULT_QUERY_KEY, cacheAiResult, noteAiErrorShown, noteAiResultReported, readAiResult, recentlyReportedAiResult, runAiMatchPass, wasShownAsAiError } from './backgroundAi';

const suggestion = (id: string) => ({ id }) as never;

beforeEach(() => {
  h.aiMatch.mockReset();
  vi.useRealTimers();
});

describe('runAiMatchPass', () => {
  it('keeps asking until every waiting title has been looked at, and adds up what it found', async () => {
    h.aiMatch
      .mockResolvedValueOnce({ suggestions: [suggestion('a')], autoMatched: 2, checked: 3, remaining: 2, next: 'c1', stopped: null })
      .mockResolvedValueOnce({ suggestions: [suggestion('b')], autoMatched: 1, checked: 2, remaining: 0, next: null, stopped: null });
    const progress: [number, number][] = [];
    const res = await runAiMatchPass((done, total) => progress.push([done, total]));
    expect(h.aiMatch.mock.calls.map((c) => c[0])).toEqual([null, 'c1']);
    expect([...res.picks.keys()]).toEqual(['a', 'b']);
    expect(res.autoMatched).toBe(3);
    expect(res.stopped).toBeNull();
    expect(progress).toEqual([
      [3, 5],
      [5, 5],
    ]);
  });

  it('throws when nothing could be done, but keeps what earlier chunks found when a later one fails', async () => {
    h.aiMatch.mockRejectedValueOnce(new Error('Out of tokens'));
    await expect(runAiMatchPass()).rejects.toThrow('Out of tokens');

    h.aiMatch
      .mockResolvedValueOnce({ suggestions: [suggestion('a')], autoMatched: 0, checked: 1, remaining: 4, next: 'c1', stopped: null })
      .mockRejectedValueOnce(new Error('Daily limit reached'));
    const res = await runAiMatchPass();
    expect([...res.picks.keys()]).toEqual(['a']);
    expect(res.stopped).toBe('Daily limit reached');
  });
});

describe('what a background job leaves behind', () => {
  it('keeps a result for the dialog for a while, then lets it go', () => {
    vi.useFakeTimers();
    const qc = new QueryClient();
    expect(readAiResult(qc, AI_MATCH_RESULT_QUERY_KEY)).toBeNull();
    cacheAiResult(qc, AI_MATCH_RESULT_QUERY_KEY, ['x']);
    expect(readAiResult(qc, AI_MATCH_RESULT_QUERY_KEY)).toEqual(['x']);
    vi.advanceTimersByTime(31 * 60_000);
    expect(readAiResult(qc, AI_MATCH_RESULT_QUERY_KEY)).toBeNull();
  });

  it('knows which failures and results it has already announced, so the server notice is not a second one', () => {
    vi.useFakeTimers();
    expect(wasShownAsAiError('The AI could not finish the duplicate scan: Out of tokens')).toBe(false);
    noteAiErrorShown('Out of tokens');
    expect(wasShownAsAiError('The AI could not finish the duplicate scan: Out of tokens')).toBe(true);
    expect(wasShownAsAiError('The AI could not finish: Something else')).toBe(false);
    vi.advanceTimersByTime(6 * 60_000);
    expect(wasShownAsAiError('The AI could not finish the duplicate scan: Out of tokens')).toBe(false);

    expect(recentlyReportedAiResult()).toBe(false);
    noteAiResultReported();
    expect(recentlyReportedAiResult()).toBe(true);
    vi.advanceTimersByTime(61_000);
    expect(recentlyReportedAiResult()).toBe(false);
  });
});
