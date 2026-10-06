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
import { aiComplete, aiCompleteEntry, getEntryParts, resolveAiChain } from './aiConfig.js';
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
    callProvider.mockRejectedValueOnce(new AiProviderError('Anthropic said: out of credit', 402)).mockResolvedValueOnce(ok('OK'));
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

  it('throws a 424 naming every provider and its reason when all fail', async () => {
    callProvider.mockRejectedValue(new AiProviderError('down', null));
    await expect(aiComplete(REQ, { userId: 'u1' })).rejects.toMatchObject({
      statusCode: 424,
      message: expect.stringMatching(/All 2.*anthropic \(claude.*openai \(gpt-x\): down/),
    });
  });
});

describe('aiCompleteEntry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const fallbacksEncrypted = sealFallbacks(mergeFallbacks([], [{ provider: 'openai', model: 'gpt-x', apiKey: 'sk-2' }], false), SECRET);
    findUnique.mockResolvedValue({ provider: 'anthropic', model: null, baseUrl: null, apiKeyEncrypted: encryptSetting('sk-1', SECRET), fallbacksEncrypted });
  });

  it('tries only the chosen entry, so a broken one is not covered for by the next', async () => {
    callProvider.mockRejectedValue(new AiProviderError('bad key', 401));
    await expect(aiCompleteEntry({ userId: 'u1' }, 0, REQ)).rejects.toMatchObject({ statusCode: 424, message: expect.stringContaining('bad key') });
    expect(callProvider).toHaveBeenCalledTimes(1);
    expect(callProvider.mock.calls[0][0]).toMatchObject({ provider: 'anthropic' });
  });

  it('can test a backup on its own and leaves the first-provider warning alone', async () => {
    callProvider.mockResolvedValue(ok('OK'));
    const res = await aiCompleteEntry({ userId: 'u1' }, 1, REQ);
    expect(res.text).toBe('OK');
    expect(callProvider.mock.calls[0][0]).toMatchObject({ provider: 'openai' });
    expect(getLastFallback('user:u1')).toBeNull();
  });

  it('says so when the entry is not saved', async () => {
    await expect(aiCompleteEntry({ userId: 'u1' }, 5, REQ)).rejects.toMatchObject({ statusCode: 404 });
    await expect(aiCompleteEntry({ userId: 'u1' }, -1, REQ)).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('switching providers off', () => {
  const backups = (extra: object = {}) =>
    sealFallbacks(mergeFallbacks([], [{ provider: 'openai', model: 'gpt-x', apiKey: 'sk-2', ...extra }], false), SECRET);
  const row = (over: object) => ({ provider: 'anthropic', model: null, baseUrl: null, apiKeyEncrypted: encryptSetting('sk-1', SECRET), fallbacksEncrypted: backups(), disabled: false, ...over });

  beforeEach(() => {
    vi.clearAllMocks();
    appFindUnique.mockResolvedValue(null);
  });

  it('keeps the flag on a backup through saving, and keeps it when a client leaves it out', () => {
    const [off] = mergeFallbacks([], [{ provider: 'openai', model: 'gpt-x', apiKey: 'k', disabled: true }], false);
    expect(off.disabled).toBe(true);
    expect(mergeFallbacks([off], [{ id: off.id, provider: 'openai', model: 'gpt-x' }], false)[0].disabled).toBe(true);
    expect(mergeFallbacks([off], [{ id: off.id, provider: 'openai', model: 'gpt-x', disabled: false }], false)[0].disabled).toBeUndefined();
  });

  it('skips a switched-off first provider and uses the backups', async () => {
    findUnique.mockResolvedValue(row({ disabled: true }));
    const chain = await resolveAiChain('u1');
    expect(chain?.configs.map((c) => c.provider)).toEqual(['openai']);
    callProvider.mockResolvedValue(ok('OK'));
    await aiComplete(REQ, { userId: 'u1' });
    expect(callProvider.mock.calls[0][0]).toMatchObject({ provider: 'openai' });
  });

  it('skips a switched-off backup', async () => {
    findUnique.mockResolvedValue(row({ fallbacksEncrypted: backups({ disabled: true }) }));
    const chain = await resolveAiChain('u1');
    expect(chain?.configs.map((c) => c.provider)).toEqual(['anthropic']);
  });

  it('lets a person with everything switched off fall through to the server', async () => {
    findUnique.mockResolvedValue(row({ disabled: true, fallbacksEncrypted: backups({ disabled: true }) }));
    expect(await resolveAiChain('u1')).toBeNull();
  });

  it('still tests a switched-off entry by its position in the list', async () => {
    findUnique.mockResolvedValue(row({ disabled: true }));
    callProvider.mockResolvedValue(ok('OK'));
    await aiCompleteEntry({ userId: 'u1' }, 0, REQ);
    expect(callProvider.mock.calls[0][0]).toMatchObject({ provider: 'anthropic' });
  });
});

describe('entries with no model chosen yet', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    appFindUnique.mockResolvedValue(null);
    const fallbacksEncrypted = sealFallbacks(mergeFallbacks([], [{ provider: 'openai', model: null, apiKey: 'sk-2' }], false), SECRET);
    findUnique.mockResolvedValue({ provider: 'anthropic', model: null, baseUrl: null, apiKeyEncrypted: encryptSetting('sk-1', SECRET), fallbacksEncrypted, disabled: false });
  });

  it('reads the saved parts of any entry by position, usable or not', async () => {
    expect(await getEntryParts({ userId: 'u1' }, 0)).toMatchObject({ provider: 'anthropic', apiKey: 'sk-1', userSupplied: false });
    expect(await getEntryParts({ userId: 'u1' }, 1)).toMatchObject({ provider: 'openai', model: null, apiKey: 'sk-2' });
    expect(await getEntryParts({ userId: 'u1' }, 2)).toBeNull();
    expect(await getEntryParts({ userId: 'u1' }, -1)).toBeNull();
  });

  it('tells the person to choose a model when testing one, instead of calling it unsaved', async () => {
    await expect(aiCompleteEntry({ userId: 'u1' }, 1, REQ)).rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining('Choose a model') });
    expect(callProvider).not.toHaveBeenCalled();
  });

  it('leaves the unfinished entry out of real calls', async () => {
    const chain = await resolveAiChain('u1');
    expect(chain?.configs.map((c) => c.provider)).toEqual(['anthropic']);
  });
});
