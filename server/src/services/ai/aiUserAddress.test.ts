import { beforeEach, describe, expect, it, vi } from 'vitest';

const { findUnique, appFindUnique, callProvider, getConfigValue, envState } = vi.hoisted(() => ({
  findUnique: vi.fn(),
  appFindUnique: vi.fn(),
  callProvider: vi.fn(),
  getConfigValue: vi.fn(),
  envState: {
    AI_ALLOW_USER_SETTINGS: true,
    AI_ALLOW_USER_BASE_URL: true,
    AI_ALLOW_PRIVATE_BASE_URL: false,
    AI_SERVER_DAILY_LIMIT: 0,
    SESSION_SECRET: 's'.repeat(32),
  } as Record<string, unknown>,
}));
vi.mock('../../db/client.js', () => ({
  prisma: { userAiSettings: { findUnique }, appSetting: { findUnique: appFindUnique }, room: { findUnique: vi.fn() }, roomMember: { findUnique: vi.fn() } },
}));
vi.mock('../../config/env.js', () => ({ env: envState }));
vi.mock('../configResolver.js', () => ({ getConfigValue }));
vi.mock('./providers.js', async (orig) => ({ ...(await orig<typeof import('./providers.js')>()), callProvider }));

import { aiComplete } from './aiConfig.js';

const REQ = { messages: [{ role: 'user' as const, content: 'hi' }] };
const userRow = (baseUrl: string) => ({ provider: 'openai_compatible', model: 'm', baseUrl, apiKeyEncrypted: null, fallbacksEncrypted: null });

describe('person-supplied AI addresses', () => {
  beforeEach(() => {
    for (const m of [findUnique, appFindUnique, callProvider, getConfigValue]) m.mockReset();
    envState.AI_ALLOW_PRIVATE_BASE_URL = false;
    appFindUnique.mockResolvedValue(null);
    getConfigValue.mockResolvedValue(undefined);
    callProvider.mockResolvedValue({ text: 'ok', provider: 'openai_compatible', model: 'm' });
  });

  it('refuses an address inside the network without calling it, naming why', async () => {
    findUnique.mockResolvedValue(userRow('http://169.254.169.254/v1'));
    await expect(aiComplete(REQ, { userId: 'u1' })).rejects.toMatchObject({ statusCode: 424, message: expect.stringContaining('private or local network') });
    expect(callProvider).not.toHaveBeenCalled();
  });

  it('refuses a private LAN address too', async () => {
    findUnique.mockResolvedValue(userRow('http://192.168.1.50:11434/v1'));
    await expect(aiComplete(REQ, { userId: 'u1' })).rejects.toMatchObject({ statusCode: 424 });
    expect(callProvider).not.toHaveBeenCalled();
  });

  it('calls a public address normally, with its error text still shown', async () => {
    findUnique.mockResolvedValue(userRow('http://8.8.8.8/v1'));
    await aiComplete(REQ, { userId: 'u1' });
    expect(callProvider).toHaveBeenCalledTimes(1);
    const config = callProvider.mock.calls[0][0];
    expect(config.userSupplied).toBe(true);
    expect(config.hideErrorBody).toBeUndefined();
  });

  it('lets a private address through when the operator allows it, but withholds its error text', async () => {
    envState.AI_ALLOW_PRIVATE_BASE_URL = true;
    findUnique.mockResolvedValue(userRow('http://192.168.1.50:11434/v1'));
    await aiComplete(REQ, { userId: 'u1' });
    expect(callProvider).toHaveBeenCalledTimes(1);
    expect(callProvider.mock.calls[0][0]).toMatchObject({ userSupplied: true, hideErrorBody: true });
  });

  it('does not check the operator\'s own address (server-wide settings are trusted)', async () => {
    findUnique.mockResolvedValue(null);
    const values: Record<string, string> = { AI_PROVIDER: 'ollama', AI_MODEL: 'llama3', AI_BASE_URL: 'http://10.0.0.5:11434/v1' };
    getConfigValue.mockImplementation(async (key: string) => values[key]);
    await aiComplete(REQ, {});
    expect(callProvider).toHaveBeenCalledTimes(1);
    expect(callProvider.mock.calls[0][0].userSupplied).toBeUndefined();
  });
});
