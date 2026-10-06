import { beforeEach, describe, expect, it, vi } from 'vitest';

const { listModels, getEntryParts, assertPublicTarget, envState } = vi.hoisted(() => ({
  listModels: vi.fn(),
  getEntryParts: vi.fn(),
  assertPublicTarget: vi.fn(),
  envState: { AI_ALLOW_USER_BASE_URL: true, AI_ALLOW_PRIVATE_BASE_URL: false } as Record<string, unknown>,
}));
vi.mock('../../config/env.js', () => ({ env: envState }));
vi.mock('./aiConfig.js', () => ({ getEntryParts }));
vi.mock('./aiNetworkGuard.js', () => ({ assertPublicTarget }));
vi.mock('./providers.js', async (orig) => ({ ...(await orig<typeof import('./providers.js')>()), listModels }));

import { listModelsFor } from './aiModels.js';

const entry = (over: Record<string, unknown> = {}) => ({ provider: 'openai', model: null, baseUrl: null, apiKey: 'sk-saved', userSupplied: false, ...over });

beforeEach(() => {
  vi.clearAllMocks();
  envState.AI_ALLOW_USER_BASE_URL = true;
  envState.AI_ALLOW_PRIVATE_BASE_URL = false;
  listModels.mockResolvedValue(['a', 'b']);
  assertPublicTarget.mockResolvedValue(undefined);
  getEntryParts.mockResolvedValue(entry());
});

describe('listModelsFor', () => {
  it('lists the models of the saved entry, using only what is saved for it', async () => {
    expect(await listModelsFor({ userId: 'u1' }, { index: 0 })).toEqual({ models: ['a', 'b'] });
    expect(getEntryParts).toHaveBeenCalledWith({ userId: 'u1' }, 0);
    expect(listModels.mock.calls[0][0]).toMatchObject({ provider: 'openai', baseUrl: 'https://api.openai.com/v1', apiKey: 'sk-saved', userSupplied: false });
    expect(assertPublicTarget).not.toHaveBeenCalled();
  });

  it('says so when the entry is not saved', async () => {
    getEntryParts.mockResolvedValue(null);
    await expect(listModelsFor({ userId: 'u1' }, { index: 3 })).rejects.toMatchObject({ statusCode: 404 });
    expect(listModels).not.toHaveBeenCalled();
  });

  it('needs a saved key for hosted providers, but not for Ollama', async () => {
    getEntryParts.mockResolvedValue(entry({ apiKey: null }));
    await expect(listModelsFor({ userId: 'u1' }, { index: 0 })).rejects.toMatchObject({ statusCode: 400 });
    getEntryParts.mockResolvedValue(entry({ provider: 'ollama', apiKey: null, baseUrl: 'http://gpu.example.com:11434/v1', userSupplied: true }));
    await listModelsFor({ userId: 'u1' }, { index: 0 });
    expect(listModels).toHaveBeenCalledTimes(1);
  });

  it('holds a person\'s own address to the same rules as a real request', async () => {
    getEntryParts.mockResolvedValue(entry({ provider: 'ollama', apiKey: null, baseUrl: 'http://10.0.0.5:11434/v1', userSupplied: true }));
    envState.AI_ALLOW_USER_BASE_URL = false;
    await expect(listModelsFor({ userId: 'u1' }, { index: 0 })).rejects.toMatchObject({ statusCode: 403 });
    envState.AI_ALLOW_USER_BASE_URL = true;
    assertPublicTarget.mockRejectedValue(new Error('That address points inside the network'));
    await expect(listModelsFor({ userId: 'u1' }, { index: 0 })).rejects.toMatchObject({ statusCode: 424, message: expect.stringContaining('inside the network') });
    expect(listModels).not.toHaveBeenCalled();
  });

  it('withholds the provider\'s error text once private addresses are allowed', async () => {
    getEntryParts.mockResolvedValue(entry({ provider: 'ollama', apiKey: null, baseUrl: 'http://10.0.0.5:11434/v1', userSupplied: true }));
    envState.AI_ALLOW_PRIVATE_BASE_URL = true;
    await listModelsFor({ userId: 'u1' }, { index: 0 });
    expect(assertPublicTarget).not.toHaveBeenCalled();
    expect(listModels.mock.calls[0][0]).toMatchObject({ userSupplied: true, hideErrorBody: true });
  });

  it('trusts the Administrator\'s own address', async () => {
    envState.AI_ALLOW_USER_BASE_URL = false;
    getEntryParts.mockResolvedValue(entry({ provider: 'ollama', apiKey: 'proxy-key', baseUrl: 'http://10.0.0.5:11434/v1' }));
    await listModelsFor('server', { index: 0 });
    expect(assertPublicTarget).not.toHaveBeenCalled();
    expect(listModels.mock.calls[0][0]).toMatchObject({ apiKey: 'proxy-key', userSupplied: false });
  });

  it('turns a provider failure into a 424', async () => {
    const { AiProviderError } = await import('./providers.js');
    listModels.mockRejectedValue(new AiProviderError('The AI provider returned 401', 401));
    await expect(listModelsFor('server', { index: 0 })).rejects.toMatchObject({ statusCode: 424 });
  });
});
