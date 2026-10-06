import { beforeEach, describe, expect, it, vi } from 'vitest';

const { listModels, getUserAiChain, getServerAiChain, assertPublicTarget, envState } = vi.hoisted(() => ({
  listModels: vi.fn(),
  getUserAiChain: vi.fn(),
  getServerAiChain: vi.fn(),
  assertPublicTarget: vi.fn(),
  envState: { AI_ALLOW_USER_BASE_URL: true, AI_ALLOW_PRIVATE_BASE_URL: false } as Record<string, unknown>,
}));
vi.mock('../../config/env.js', () => ({ env: envState }));
vi.mock('./aiConfig.js', async () => ({ getUserAiChain, getServerAiChain, normalizeBaseUrl: (u: string) => u.trim().replace(/\/+$/, '') }));
vi.mock('./aiNetworkGuard.js', () => ({ assertPublicTarget }));
vi.mock('./providers.js', async (orig) => ({ ...(await orig<typeof import('./providers.js')>()), listModels }));

import { listModelsFor } from './aiModels.js';

beforeEach(() => {
  vi.clearAllMocks();
  envState.AI_ALLOW_USER_BASE_URL = true;
  envState.AI_ALLOW_PRIVATE_BASE_URL = false;
  listModels.mockResolvedValue(['a', 'b']);
  assertPublicTarget.mockResolvedValue(undefined);
});

describe('listModelsFor', () => {
  it('lists a hosted provider\'s models with the typed key and its standard address', async () => {
    expect(await listModelsFor({ userId: 'u1' }, { provider: 'anthropic', apiKey: ' sk-new ' })).toEqual({ models: ['a', 'b'] });
    expect(listModels.mock.calls[0][0]).toMatchObject({ provider: 'anthropic', baseUrl: 'https://api.anthropic.com', apiKey: 'sk-new', userSupplied: false });
    expect(assertPublicTarget).not.toHaveBeenCalled();
  });

  it('reuses the saved key of the same entry when none is typed, but not across providers', async () => {
    getUserAiChain.mockResolvedValue([{ provider: 'openai', apiKey: 'sk-saved' }]);
    await listModelsFor({ userId: 'u1' }, { provider: 'openai', index: 0 });
    expect(listModels.mock.calls[0][0].apiKey).toBe('sk-saved');
    await expect(listModelsFor({ userId: 'u1' }, { provider: 'anthropic', index: 0 })).rejects.toMatchObject({ statusCode: 400 });
  });

  it('needs a key for hosted providers, but not for Ollama', async () => {
    await expect(listModelsFor({ userId: 'u1' }, { provider: 'openai' })).rejects.toMatchObject({ statusCode: 400 });
    await listModelsFor({ userId: 'u1' }, { provider: 'ollama', baseUrl: 'http://gpu.example.com:11434/v1' });
    expect(listModels).toHaveBeenCalledTimes(1);
  });

  it('holds a person\'s own address to the same rules as a real request', async () => {
    envState.AI_ALLOW_USER_BASE_URL = false;
    await expect(listModelsFor({ userId: 'u1' }, { provider: 'ollama', baseUrl: 'http://gpu:11434/v1' })).rejects.toMatchObject({ statusCode: 403 });
    envState.AI_ALLOW_USER_BASE_URL = true;
    assertPublicTarget.mockRejectedValue(new Error('That address points inside the network'));
    await expect(listModelsFor({ userId: 'u1' }, { provider: 'ollama', baseUrl: 'http://10.0.0.5:11434/v1' })).rejects.toMatchObject({ statusCode: 424, message: expect.stringContaining('inside the network') });
    expect(listModels).not.toHaveBeenCalled();
  });

  it('withholds the provider\'s error text once private addresses are allowed', async () => {
    envState.AI_ALLOW_PRIVATE_BASE_URL = true;
    await listModelsFor({ userId: 'u1' }, { provider: 'ollama', baseUrl: 'http://10.0.0.5:11434/v1' });
    expect(assertPublicTarget).not.toHaveBeenCalled();
    expect(listModels.mock.calls[0][0]).toMatchObject({ userSupplied: true, hideErrorBody: true });
  });

  it('trusts the Administrator\'s own address and uses the server\'s saved key', async () => {
    envState.AI_ALLOW_USER_BASE_URL = false;
    getServerAiChain.mockResolvedValue([{ provider: 'ollama', apiKey: 'proxy-key' }]);
    await listModelsFor('server', { provider: 'ollama', baseUrl: 'http://10.0.0.5:11434/v1', index: 0 });
    expect(assertPublicTarget).not.toHaveBeenCalled();
    expect(listModels.mock.calls[0][0]).toMatchObject({ apiKey: 'proxy-key', userSupplied: false });
  });

  it('turns a provider failure into a 424 and rejects an unknown provider', async () => {
    const { AiProviderError } = await import('./providers.js');
    listModels.mockRejectedValue(new AiProviderError('The AI provider returned 401', 401));
    await expect(listModelsFor('server', { provider: 'ollama', baseUrl: 'http://h/v1' })).rejects.toMatchObject({ statusCode: 424 });
    await expect(listModelsFor('server', { provider: 'nope' as never })).rejects.toMatchObject({ statusCode: 400 });
  });
});
