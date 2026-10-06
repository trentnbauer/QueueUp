import { beforeEach, describe, expect, it, vi } from 'vitest';

const { aiCompleteEntry } = vi.hoisted(() => ({ aiCompleteEntry: vi.fn() }));
vi.mock('../../db/client.js', () => ({ prisma: {} }));
vi.mock('../notifications.js', () => ({ notifyMergeSuggestions: vi.fn() }));
vi.mock('./aiConfig.js', () => ({ aiCompleteEntry, aiComplete: vi.fn() }));

import { HttpError } from '../../util/httpError.js';
import { benchmarkPairs, isBenchmarkStep, runBenchmarkStep } from './aiBenchmark.js';

const reply = (text: string, outputTokens: number | null = 120) => ({ text, provider: 'ollama', model: 'm', usage: { inputTokens: 10, outputTokens }, fallback: null });

beforeEach(() => vi.clearAllMocks());

describe('benchmarkPairs', () => {
  it('makes the asked number of pairs of distinct cards, mixing editions and look-alikes', () => {
    const pairs = benchmarkPairs(40);
    expect(pairs).toHaveLength(40);
    expect(new Set(pairs.flat().map((g) => g.id)).size).toBe(80);
    expect(pairs[0][1].title).toContain(pairs[0][0].title);
    expect(pairs[1][1].title).not.toContain(pairs[1][0].title);
  });
});

describe('runBenchmarkStep', () => {
  it('knows the three steps', () => {
    expect(['load', 'quick', 'batch'].every(isBenchmarkStep)).toBe(true);
    expect(isBenchmarkStep('huge')).toBe(false);
  });

  it('sends the duplicate finder\'s own request, sized by step, to the chosen entry', async () => {
    aiCompleteEntry.mockResolvedValue(reply('[{"pair":1,"same":true}]'));
    await runBenchmarkStep('server', 2, 'batch');
    const [scope, index, req] = aiCompleteEntry.mock.calls[0];
    expect(scope).toBe('server');
    expect(index).toBe(2);
    expect(req.maxTokens).toBe(2048);
    expect(req.messages[0].content).toContain('Pair 40:');
    await runBenchmarkStep({ userId: 'u1' }, 0, 'quick');
    expect(aiCompleteEntry.mock.calls[1][2].messages[0].content).toContain('Pair 6:');
    expect(aiCompleteEntry.mock.calls[1][2].messages[0].content).not.toContain('Pair 7:');
  });

  it('reports time, speed and whether the answer was JSON', async () => {
    aiCompleteEntry.mockResolvedValue(reply('[{"pair":1,"same":true}]', 100));
    const ok = await runBenchmarkStep('server', 0, 'quick');
    expect(ok).toMatchObject({ step: 'quick', ok: true, validJson: true, outputTokens: 100, timedOut: false, error: null });
    expect(ok.ms).toBeGreaterThan(0);
    expect(ok.tokensPerSecond).toBeGreaterThan(0);

    aiCompleteEntry.mockResolvedValue(reply('Sure! Here are my thoughts.', null));
    const bad = await runBenchmarkStep('server', 0, 'batch');
    expect(bad.validJson).toBe(false);
    expect(bad.outputTokens).toBeGreaterThan(0);

    aiCompleteEntry.mockResolvedValue(reply('OK'));
    expect((await runBenchmarkStep('server', 0, 'load')).validJson).toBeNull();
  });

  it('turns a provider failure into a result, marking a timeout', async () => {
    aiCompleteEntry.mockRejectedValue(new HttpError(424, 'The AI provider failed. ollama (m): The AI provider took too long to answer'));
    expect(await runBenchmarkStep('server', 0, 'batch')).toMatchObject({ ok: false, timedOut: true, tokensPerSecond: null });
    aiCompleteEntry.mockRejectedValue(new HttpError(424, 'The AI provider failed. ollama (m): The AI provider returned 401'));
    expect(await runBenchmarkStep('server', 0, 'batch')).toMatchObject({ ok: false, timedOut: false, error: expect.stringContaining('401') });
  });

  it('still raises an entry that is not saved', async () => {
    aiCompleteEntry.mockRejectedValue(new HttpError(404, 'That provider is not saved yet.'));
    await expect(runBenchmarkStep('server', 9, 'load')).rejects.toMatchObject({ statusCode: 404 });
  });
});
