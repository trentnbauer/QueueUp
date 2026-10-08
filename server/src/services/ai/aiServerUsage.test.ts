import { describe, expect, it } from 'vitest';
import { summarizeServerAiUsage, usageMonth } from './aiServerUsage.js';

const row = (month: string, inputTokens: number, outputTokens: number, requests = 1) => ({ month, inputTokens, outputTokens, requests });

describe('summarizeServerAiUsage', () => {
  const now = new Date('2026-10-08T12:00:00Z');

  it('reports nothing for someone who never used the server AI', () => {
    expect(summarizeServerAiUsage([], now)).toEqual({ tokensThisMonth: 0, requestsThisMonth: 0, avgTokensPerMonth: null, avgRequestsPerMonth: null });
  });

  it('has no average until a month has finished', () => {
    const s = summarizeServerAiUsage([row('2026-10', 100, 50, 3)], now);
    expect(s).toEqual({ tokensThisMonth: 150, requestsThisMonth: 3, avgTokensPerMonth: null, avgRequestsPerMonth: null });
  });

  it('averages finished months since first use, counting quiet months as zero and leaving this month out', () => {
    // July 300, August nothing, September 600 -> 900 over 3 months.
    const s = summarizeServerAiUsage([row('2026-07', 200, 100, 2), row('2026-09', 400, 200, 4), row('2026-10', 1000, 0, 9)], now);
    expect(s).toEqual({ tokensThisMonth: 1000, requestsThisMonth: 9, avgTokensPerMonth: 300, avgRequestsPerMonth: 2 });
  });

  it('counts months across a year boundary', () => {
    const s = summarizeServerAiUsage([row('2025-12', 300, 0)], new Date('2026-02-01T00:00:00Z'));
    expect(s.avgTokensPerMonth).toBe(150);
  });

  it('uses the UTC month', () => {
    expect(usageMonth(new Date('2026-10-31T23:30:00Z'))).toBe('2026-10');
  });
});
