import { beforeEach, describe, expect, it, vi } from 'vitest';

const SECRET = 's'.repeat(32);

const { findUnique, appFindUnique, callProvider, chargeServerAiUse, refund, envState } = vi.hoisted(() => ({
  findUnique: vi.fn(),
  appFindUnique: vi.fn(),
  callProvider: vi.fn(),
  chargeServerAiUse: vi.fn(),
  refund: vi.fn(),
  envState: {
    AI_ALLOW_USER_SETTINGS: true,
    AI_ALLOW_USER_BASE_URL: false,
    SESSION_SECRET: 's'.repeat(32),
    AI_PROVIDER: 'openai',
    AI_MODEL: 'server-model',
    AI_API_KEY: 'sk-server',
  } as Record<string, unknown>,
}));
vi.mock('../../db/client.js', () => ({
  prisma: { userAiSettings: { findUnique }, appSetting: { findUnique: appFindUnique }, room: { findUnique: vi.fn() }, roomMember: { findUnique: vi.fn() } },
}));
vi.mock('../../config/env.js', () => ({ env: envState }));
vi.mock('../configResolver.js', () => ({ getConfigValue: vi.fn(async (_k: string, fallback: unknown) => fallback) }));
vi.mock('./aiQuota.js', () => ({ chargeServerAiUse }));
vi.mock('./providers.js', async (orig) => ({ ...(await orig<typeof import('./providers.js')>()), callProvider }));

import { HttpError } from '../../util/httpError.js';
import { AiProviderError } from './providers.js';
import { aiComplete, resolveAiChain } from './aiConfig.js';
import { encryptSetting } from '../settingsCrypto.js';

const REQ = { messages: [{ role: 'user' as const, content: 'hi' }] };
const ok = (text: string) => ({ text, provider: 'openai', model: 'm' });

beforeEach(() => {
  vi.clearAllMocks();
  appFindUnique.mockResolvedValue(null);
  chargeServerAiUse.mockResolvedValue({ refund });
  findUnique.mockResolvedValue({ provider: 'anthropic', model: null, baseUrl: null, apiKeyEncrypted: encryptSetting('sk-user', SECRET), fallbacksEncrypted: null });
});

describe('the server AI as the last resort', () => {
  it('sits at the very end of a person\'s own chain', async () => {
    const chain = await resolveAiChain('u1');
    expect(chain?.source).toBe('user');
    expect(chain?.configs.map((c) => [c.provider, !!c.viaServer])).toEqual([['anthropic', false], ['openai', true]]);
  });

  it('is only reached, and charged, when the person\'s own providers fail', async () => {
    callProvider.mockResolvedValueOnce(ok('mine'));
    expect((await aiComplete(REQ, { userId: 'u1' })).text).toBe('mine');
    expect(chargeServerAiUse).not.toHaveBeenCalled();

    callProvider.mockRejectedValueOnce(new AiProviderError('down', null)).mockResolvedValueOnce(ok('server'));
    const res = await aiComplete(REQ, { userId: 'u1' });
    expect(res.text).toBe('server');
    expect(res.fallback).toMatchObject({ failedProvider: 'anthropic', usedProvider: 'openai' });
    expect(chargeServerAiUse).toHaveBeenCalledWith('u1');
  });

  it('refunds the use when the server AI fails too', async () => {
    callProvider.mockRejectedValue(new AiProviderError('down', null));
    await expect(aiComplete(REQ, { userId: 'u1' })).rejects.toMatchObject({ statusCode: 424 });
    expect(refund).toHaveBeenCalledTimes(1);
  });

  it('stops at the daily limit instead of using the server AI', async () => {
    chargeServerAiUse.mockRejectedValue(new HttpError(429, "You've used today's 50 requests"));
    callProvider.mockRejectedValue(new AiProviderError('down', null));
    await expect(aiComplete(REQ, { userId: 'u1' })).rejects.toMatchObject({ statusCode: 424, message: expect.stringContaining("used today's 50") });
    expect(callProvider).toHaveBeenCalledTimes(1);
  });
});
