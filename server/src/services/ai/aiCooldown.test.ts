import { beforeEach, describe, expect, it } from 'vitest';
import { AiProviderError } from './providers.js';
import { coolDownSeconds, cooldownKey, coolingReason, endCooldown, resetCooldowns, startCooldown } from './aiCooldown.js';

const err = (message: string, status: number | null, retryAfter: number | null = null) => new AiProviderError(message, status, retryAfter);

describe('coolDownSeconds', () => {
  it('skips for a while after a bad key, no access or no credit', () => {
    for (const status of [401, 402, 403]) expect(coolDownSeconds(err('no', status)), String(status)).toBe(600);
    expect(coolDownSeconds(err('You exceeded your current quota', 400))).toBe(600);
    expect(coolDownSeconds(err('Your credit balance is too low', 400))).toBe(600);
  });

  it('treats a 429 as long only when it says so', () => {
    expect(coolDownSeconds(err('slow down', 429))).toBeNull();
    expect(coolDownSeconds(err('slow down', 429, 30))).toBeNull();
    expect(coolDownSeconds(err('slow down', 429, 600))).toBe(600);
    expect(coolDownSeconds(err('slow down', 429, 86_400))).toBe(1800);
    expect(coolDownSeconds(err('You exceeded your current quota', 429))).toBe(600);
  });

  it('never skips for a timeout, an unreachable provider, a 5xx or an ordinary bad request', () => {
    expect(coolDownSeconds(err('took too long', null))).toBeNull();
    expect(coolDownSeconds(err('overloaded', 503))).toBeNull();
    expect(coolDownSeconds(err('bad json', 400))).toBeNull();
  });
});

describe('the cool-down list', () => {
  beforeEach(() => resetCooldowns());

  it('remembers a provider until its time is up, and lets a pass clear it', () => {
    const key = cooldownKey({ provider: 'openai', model: 'gpt-x', baseUrl: 'https://api.openai.com/v1', apiKey: 'sk-1' });
    expect(coolingReason(key, 1000)).toBeNull();
    startCooldown(key, 60, 'out of credit', 1000);
    expect(coolingReason(key, 1000 + 30_000)).toEqual({ message: 'out of credit', secondsLeft: 30 });
    expect(coolingReason(key, 1000 + 61_000)).toBeNull();
    startCooldown(key, 60, 'again', 1000);
    endCooldown(key);
    expect(coolingReason(key, 1000)).toBeNull();
  });

  it('treats a changed key, model or address as a different provider and never contains the key', () => {
    const base = { provider: 'openai' as const, model: 'gpt-x', baseUrl: 'https://a', apiKey: 'sk-secret-1' };
    const key = cooldownKey(base);
    expect(key).not.toContain('secret');
    expect(cooldownKey({ ...base, apiKey: 'sk-secret-2' })).not.toBe(key);
    expect(cooldownKey({ ...base, model: 'gpt-y' })).not.toBe(key);
    expect(cooldownKey({ ...base, baseUrl: 'https://b' })).not.toBe(key);
    expect(cooldownKey({ ...base })).toBe(key);
  });
});
