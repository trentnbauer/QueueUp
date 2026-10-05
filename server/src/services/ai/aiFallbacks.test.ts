import { beforeEach, describe, expect, it, vi } from 'vitest';

const SECRET = 's'.repeat(32);

const { findUnique, appFindUnique, callProvider, envState } = vi.hoisted(() => ({
  findUnique: vi.fn(),
  appFindUnique: vi.fn(),
  callProvider: vi.fn(),
  envState: { AI_ALLOW_USER_SETTINGS: true, AI_ALLOW_USER_BASE_URL: false, SESSION_SECRET: 's'.repeat(32) } as Record<string, unknown>,
}));
vi.mock('../../db/client.js', () => ({
  prisma: { userAiSettings: { findUnique }, appSetting: { findUnique: appFindUnique }, room: { findUnique: vi.fn() }, roomMember: { findUnique: vi.fn() } },
}));
vi.mock('../../config/env.js', () => ({ env: envState }));
vi.mock('../configResolver.js', () => ({ getConfigValue: vi.fn().mockResolvedValue(undefined) }));
vi.mock('./providers.js', async (orig) => ({ ...(await orig<typeof import('./providers.js')>()), callProvider }));

import { AiProviderError } from './providers.js';
import { aiComplete } from './aiConfig.js';
import { getLastFallback, mergeFallbacks, openFallbacks, sealFallbacks } from './aiFallbacks.js';
import { encryptSetting } from '../settingsCrypto.js';

const REQ = { messages: [{ role: 'user' as const, content: 'hi' }] };
const ok = (text: string) => ({ text, provider: 'x', model: 'm' });

describe('mergeFallbacks', () => {
  it('keeps a saved key when it is left out, and drops it when the provider changes', () => {
    const existing = [{ id: 'a', provider: 'openai' as const, model: null, baseUrl: null, apiKey: 'sk-1' }];
    expect(mergeFallbacks(existing, [{ id: 'a', provider: 'openai', model: 'gpt-x' }], false)[0]).toMatchObject({ id: 'a', apiKey: 'sk-1' });
    expect(() => mergeFallbacks(existing, [{ id: 'a', provider: 'anthropic', model: 'c' }], false)).toThrow('API key');
  });

  it('keeps the order it is given and rejects too many or custom addresses', () => {
    const list = mergeFallbacks([], [
      { provider: 'openai', model: 'gpt-x', apiKey: 'k1' },
      { provider: 'gemini', model: 'g', apiKey: 'k2' },
    ], false);
    expect(list.map((e) => e.provider)).toEqual(['openai', 'gemini']);
    expect(() => mergeFallbacks([], Array(5).fill({ provider: 'openai', model: 'gpt-x', apiKey: 'k' }), false)).toThrow('At most');
    expect(() => mergeFallbacks([], [{ provider: 'ollama', model: 'llama3', baseUrl: 'http://h:1' }], false)).toThrow('hosted');
  });

  it('round-trips encrypted and never stores a key in the clear', () => {
    const list = mergeFallbacks([], [{ provider: 'openai', model: 'gpt-x', apiKey: 'sk-secret' }], false);
    const sealed = sealFallbacks(list, SECRET)!;
    expect(sealed).not.toContain('sk-secret');
    expect(openFallbacks(sealed, SECRET)[0].apiKey).toBe('sk-secret');
    expect(openFallbacks(sealed, 'x'.repeat(32))).toEqual([]);
  });
});

describe('aiComplete with backups', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const fallbacksEncrypted = sealFallbacks(mergeFallbacks([], [{ provider: 'openai', model: 'gpt-x', apiKey: 'sk-2' }], false), SECRET);
    findUnique.mockResolvedValue({ provider: 'anthropic', model: null, baseUrl: null, apiKeyEncrypted: encryptSetting('sk-1', SECRET), fallbacksEncrypted });
  });

  it('falls back to the next provider and records a warning', async () => {
    callProvider.mockRejectedValueOnce(new AiProviderError('Anthropic said: out of credit')).mockResolvedValueOnce(ok('OK'));
    const res = await aiComplete(REQ, { userId: 'u1' });
    expect(res.text).toBe('OK');
    expect(res.fallback).toMatchObject({ failedProvider: 'anthropic', usedProvider: 'openai', error: 'Anthropic said: out of credit' });
    expect(getLastFallback('user:u1')).not.toBeNull();
  });

  it('clears the warning once the first provider answers again', async () => {
    callProvider.mockResolvedValueOnce(ok('OK'));
    const res = await aiComplete(REQ, { userId: 'u1' });
    expect(res.fallback).toBeNull();
    expect(getLastFallback('user:u1')).toBeNull();
  });

  it('throws a 502 naming the count when every provider fails', async () => {
    callProvider.mockRejectedValue(new AiProviderError('down'));
    await expect(aiComplete(REQ, { userId: 'u1' })).rejects.toMatchObject({ statusCode: 502, message: expect.stringContaining('All 2') });
  });
});
