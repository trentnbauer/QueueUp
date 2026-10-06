import { describe, expect, it } from 'vitest';
import { summariseBenchmark, type AiBenchmarkResult, type AiBenchmarkStep } from './aiBenchmark.js';

const step = (s: AiBenchmarkStep, over: Partial<AiBenchmarkResult> = {}): AiBenchmarkResult => ({
  step: s,
  ok: true,
  ms: 1000,
  outputTokens: 100,
  tokensPerSecond: 50,
  validJson: s === 'load' ? null : true,
  timedOut: false,
  error: null,
  ...over,
});

describe('summariseBenchmark', () => {
  it('is good when the biggest request finishes quickly', () => {
    const s = summariseBenchmark([step('load'), step('quick'), step('batch', { ms: 9000, tokensPerSecond: 40 })]);
    expect(s.verdict).toBe('good');
    expect(s.batchSeconds).toBe(9);
    expect(s.tokensPerSecond).toBe(46.7);
    // 600 pairs / 40 per batch = 15 batches, 3 at a time = 5 rounds of 9 s.
    expect(s.bigScanMinutes).toBe(1);
  });

  it('grades by the batch time', () => {
    expect(summariseBenchmark([step('load'), step('quick'), step('batch', { ms: 25_000 })]).verdict).toBe('ok');
    expect(summariseBenchmark([step('load'), step('quick'), step('batch', { ms: 50_000 })]).verdict).toBe('slow');
    expect(summariseBenchmark([step('load'), step('quick'), step('batch', { ms: 61_000 })]).verdict).toBe('tooSlow');
  });

  it('is too slow when the biggest request timed out, and failed for other errors', () => {
    expect(summariseBenchmark([step('load'), step('quick'), step('batch', { ok: false, timedOut: true, ms: 60_000, tokensPerSecond: null, error: 'took too long' })]).verdict).toBe('tooSlow');
    expect(summariseBenchmark([step('load', { ok: false, error: 'bad key', tokensPerSecond: null })]).verdict).toBe('failed');
  });

  it('fails an answer that is not the JSON the app needs, however fast', () => {
    expect(summariseBenchmark([step('load'), step('quick'), step('batch', { ms: 3000, validJson: false })]).verdict).toBe('failed');
  });

  it('estimates a big scan from the batch time', () => {
    // 5 rounds x 30 s = 150 s = 2.5 min, rounded.
    expect(summariseBenchmark([step('load'), step('quick'), step('batch', { ms: 30_000 })]).bigScanMinutes).toBe(3);
  });

  it('gives nothing to estimate from when the batch did not run', () => {
    const s = summariseBenchmark([step('load')]);
    expect(s.verdict).toBe('failed');
    expect(s.batchSeconds).toBeNull();
    expect(s.bigScanMinutes).toBeNull();
  });
});
