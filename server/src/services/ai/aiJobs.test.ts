import { beforeEach, describe, expect, it, vi } from 'vitest';

const { envState } = vi.hoisted(() => ({ envState: { AI_MAX_CONCURRENT_REQUESTS: 0 } as Record<string, unknown> }));
vi.mock('../../config/env.js', () => ({ env: envState }));

import { aiActivityFor, runAiJob } from './aiJobs.js';

function deferred<T = string>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
const tick = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  envState.AI_MAX_CONCURRENT_REQUESTS = 0;
});

describe('runAiJob with no limit', () => {
  it('counts a request as running while it works, and forgets it afterwards', async () => {
    const d = deferred();
    const job = runAiJob('u1', 'duplicates', () => d.promise);
    await tick();
    expect(aiActivityFor('u1')).toEqual([{ label: 'duplicates', running: 1, queued: 0, nextPosition: null }]);
    expect(aiActivityFor('someone-else')).toEqual([]);
    d.resolve('done');
    expect(await job).toBe('done');
    expect(aiActivityFor('u1')).toEqual([]);
  });

  it('groups several of the same kind, and frees the count when the work fails', async () => {
    const a = deferred();
    const b = deferred();
    const failing = deferred();
    const one = runAiJob('u1', 'duplicates', () => a.promise);
    const two = runAiJob('u1', 'duplicates', () => b.promise);
    const bad = runAiJob('u1', 'search', () => failing.promise).catch(() => 'failed');
    await tick();
    expect(aiActivityFor('u1')).toEqual([
      { label: 'duplicates', running: 2, queued: 0, nextPosition: null },
      { label: 'search', running: 1, queued: 0, nextPosition: null },
    ]);
    failing.reject(new Error('boom'));
    expect(await bad).toBe('failed');
    a.resolve('1');
    b.resolve('2');
    await Promise.all([one, two]);
    expect(aiActivityFor('u1')).toEqual([]);
  });
});

describe('runAiJob with a limit of one', () => {
  beforeEach(() => {
    envState.AI_MAX_CONCURRENT_REQUESTS = 1;
  });

  it('makes the next request wait its turn, shows it as queued with its place in line, and hands the slot on', async () => {
    const first = deferred();
    const second = deferred();
    const third = deferred();
    let secondStarted = false;
    const p1 = runAiJob('u1', 'duplicates', () => first.promise);
    const p2 = runAiJob('u2', 'search', async () => {
      secondStarted = true;
      return second.promise;
    });
    const p3 = runAiJob('u1', 'picks', () => third.promise);
    await tick();

    expect(secondStarted).toBe(false);
    expect(aiActivityFor('u1')).toEqual([
      { label: 'duplicates', running: 1, queued: 0, nextPosition: null },
      { label: 'picks', running: 0, queued: 1, nextPosition: 2 },
    ]);
    expect(aiActivityFor('u2')).toEqual([{ label: 'search', running: 0, queued: 1, nextPosition: 1 }]);

    first.resolve('a');
    await p1;
    await tick();
    expect(secondStarted).toBe(true);
    expect(aiActivityFor('u2')).toEqual([{ label: 'search', running: 1, queued: 0, nextPosition: null }]);
    expect(aiActivityFor('u1')).toEqual([{ label: 'picks', running: 0, queued: 1, nextPosition: 1 }]);

    second.resolve('b');
    await p2;
    await tick();
    third.resolve('c');
    expect(await p3).toBe('c');
    expect(aiActivityFor('u1')).toEqual([]);
  });

  it('gives the slot up when a request fails, so the next one still runs', async () => {
    const first = deferred();
    const p1 = runAiJob('u1', 'duplicates', () => first.promise).catch(() => 'failed');
    const p2 = runAiJob('u1', 'search', async () => 'ran');
    await tick();
    first.reject(new Error('boom'));
    expect(await p1).toBe('failed');
    expect(await p2).toBe('ran');
  });
});
