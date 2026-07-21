import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { scheduleJob } from './scheduler.js';

describe('scheduleJob', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('runs immediately by default, then again every intervalMs', async () => {
    const run = vi.fn().mockResolvedValue(undefined);
    const handle = scheduleJob({ name: 'test-job', intervalMs: 1000, run });

    // The immediate run is fired-and-forgotten (not awaited by scheduleJob), so let its promise
    // microtask settle before asserting on it.
    await vi.advanceTimersByTimeAsync(0);
    expect(run).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1000);
    expect(run).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(2000);
    expect(run).toHaveBeenCalledTimes(4);

    handle.stop();
  });

  it('does not run immediately when runImmediately is false', async () => {
    const run = vi.fn().mockResolvedValue(undefined);
    const handle = scheduleJob({ name: 'test-job', intervalMs: 1000, run }, { runImmediately: false });

    await vi.advanceTimersByTimeAsync(0);
    expect(run).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1000);
    expect(run).toHaveBeenCalledTimes(1);

    handle.stop();
  });

  it('skips a tick (rather than overlapping) if the previous run is still in flight', async () => {
    let resolveFirst!: () => void;
    const run = vi
      .fn()
      .mockImplementationOnce(() => new Promise<void>((resolve) => (resolveFirst = resolve)))
      .mockResolvedValue(undefined);
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

    const handle = scheduleJob({ name: 'slow-job', intervalMs: 1000, run }, { logger });

    await vi.advanceTimersByTimeAsync(0); // first (still-pending) run starts
    expect(run).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1000); // second tick fires while the first is still running
    expect(run).toHaveBeenCalledTimes(1); // skipped, not queued
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('slow-job'));

    resolveFirst();
    await vi.advanceTimersByTimeAsync(0); // let the first run's promise settle

    await vi.advanceTimersByTimeAsync(1000); // next tick after the job freed up
    expect(run).toHaveBeenCalledTimes(2);

    handle.stop();
  });

  it('logs and continues past a run that throws, instead of stopping the schedule', async () => {
    const run = vi.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValue(undefined);
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

    const handle = scheduleJob({ name: 'flaky-job', intervalMs: 1000, run }, { logger });

    await vi.advanceTimersByTimeAsync(0);
    expect(run).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('flaky-job'), expect.any(Error));

    await vi.advanceTimersByTimeAsync(1000);
    expect(run).toHaveBeenCalledTimes(2);

    handle.stop();
  });

  it('stop() prevents any further runs', async () => {
    const run = vi.fn().mockResolvedValue(undefined);
    const handle = scheduleJob({ name: 'test-job', intervalMs: 1000, run });

    await vi.advanceTimersByTimeAsync(0);
    expect(run).toHaveBeenCalledTimes(1);

    handle.stop();

    await vi.advanceTimersByTimeAsync(5000);
    expect(run).toHaveBeenCalledTimes(1);
  });
});
