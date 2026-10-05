import { beforeEach, describe, expect, it, vi } from 'vitest';

const SECRET = 's'.repeat(32);

const { findUnique, upsert, deleteMany, roomFindUnique, roomUpdateMany, memberFindUnique, envState, getConfigValue } = vi.hoisted(() => ({
  findUnique: vi.fn(),
  roomFindUnique: vi.fn(),
  roomUpdateMany: vi.fn(),
  memberFindUnique: vi.fn(),
  upsert: vi.fn(),
  deleteMany: vi.fn(),
  envState: { AI_ALLOW_USER_SETTINGS: true, AI_ALLOW_USER_BASE_URL: false, SESSION_SECRET: 's'.repeat(32), AI_PROVIDER: undefined as string | undefined } as Record<string, unknown>,
  getConfigValue: vi.fn(),
}));
vi.mock('../../db/client.js', () => ({
  prisma: {
    userAiSettings: { findUnique, upsert, deleteMany },
    room: { findUnique: roomFindUnique, updateMany: roomUpdateMany },
    roomMember: { findUnique: memberFindUnique },
  },
}));
vi.mock('../../config/env.js', () => ({ env: envState }));
vi.mock('../configResolver.js', () => ({ getConfigValue }));

import { buildConfig, clearUserAiSettings, getUserAiConfig, normalizeBaseUrl, resolveAiConfig, saveUserAiSettings } from './aiConfig.js';
import { decryptSetting, encryptSetting } from '../settingsCrypto.js';

beforeEach(() => {
  vi.clearAllMocks();
  envState.AI_ALLOW_USER_SETTINGS = true;
  envState.AI_ALLOW_USER_BASE_URL = false;
  getConfigValue.mockResolvedValue(undefined);
  upsert.mockImplementation(async ({ create }: { create: Record<string, unknown> }) => create);
});

describe('normalizeBaseUrl', () => {
  it('trims the trailing slash and accepts http(s)', () => {
    expect(normalizeBaseUrl(' http://host:11434/v1/ ')).toBe('http://host:11434/v1');
  });

  it('rejects other schemes, credentials, queries and junk', () => {
    expect(() => normalizeBaseUrl('file:///etc/passwd')).toThrow('http');
    expect(() => normalizeBaseUrl('https://user:pw@host/v1')).toThrow('username');
    expect(() => normalizeBaseUrl('https://host/v1?key=1')).toThrow('query');
    expect(() => normalizeBaseUrl('not a url')).toThrow('valid');
  });
});

describe('buildConfig', () => {
  it('fills in the provider defaults', () => {
    expect(buildConfig('anthropic', { apiKey: 'k' })).toEqual({ provider: 'anthropic', model: 'claude-sonnet-5-5', baseUrl: 'https://api.anthropic.com', apiKey: 'k' });
  });

  it('is null while something required is missing', () => {
    expect(buildConfig('openai', { apiKey: 'k' })).toBeNull(); // no model
    expect(buildConfig('anthropic', {})).toBeNull(); // no key
    expect(buildConfig('openai_compatible', { model: 'm' })).toBeNull(); // no address
    expect(buildConfig('ollama', { model: 'llama3' })).toMatchObject({ baseUrl: 'http://localhost:11434/v1', apiKey: null });
  });
});

describe('saveUserAiSettings', () => {
  it('stores the key encrypted and never returns it', async () => {
    const out = await saveUserAiSettings('u1', { provider: 'anthropic', apiKey: ' sk-secret ' });
    const stored = upsert.mock.calls[0][0].create.apiKeyEncrypted as string;
    expect(stored).not.toContain('sk-secret');
    expect(decryptSetting(stored, SECRET)).toBe('sk-secret');
    expect(out).toEqual({ provider: 'anthropic', model: null, baseUrl: null, hasApiKey: true, fallbacks: [] });
    expect(JSON.stringify(out)).not.toContain('sk-secret');
  });

  it('keeps the saved key when none is sent, for the same provider', async () => {
    findUnique.mockResolvedValue({ provider: 'anthropic', apiKeyEncrypted: 'enc-existing' });
    await saveUserAiSettings('u1', { provider: 'anthropic', model: 'claude-x' });
    expect(upsert.mock.calls[0][0].update.apiKeyEncrypted).toBe('enc-existing');
  });

  it('does not carry a key over to a different provider', async () => {
    findUnique.mockResolvedValue({ provider: 'anthropic', apiKeyEncrypted: 'enc-existing' });
    await expect(saveUserAiSettings('u1', { provider: 'openai', model: 'gpt-x' })).rejects.toThrow('API key is required');
  });

  it('removes the key with null or an empty string', async () => {
    findUnique.mockResolvedValue(null);
    await saveUserAiSettings('u1', { provider: 'ollama', model: 'llama3', baseUrl: 'http://h/v1', apiKey: '' }).catch(() => undefined);
    envState.AI_ALLOW_USER_BASE_URL = true;
    await saveUserAiSettings('u1', { provider: 'ollama', model: 'llama3', baseUrl: 'http://h/v1', apiKey: null });
    expect(upsert.mock.calls.at(-1)![0].create.apiKeyEncrypted).toBeNull();
  });

  it('requires a model where there is no default', async () => {
    await expect(saveUserAiSettings('u1', { provider: 'openai', apiKey: 'k' })).rejects.toThrow('model');
  });

  it('refuses a custom address unless the server allows it', async () => {
    await expect(saveUserAiSettings('u1', { provider: 'openai_compatible', model: 'm', baseUrl: 'http://10.0.0.5/v1' })).rejects.toThrow('hosted providers');
    await expect(saveUserAiSettings('u1', { provider: 'ollama', model: 'm' })).rejects.toThrow('hosted providers');
    await expect(saveUserAiSettings('u1', { provider: 'openai', model: 'm', apiKey: 'k', baseUrl: 'https://proxy.example/v1' })).rejects.toThrow('hosted providers');
    envState.AI_ALLOW_USER_BASE_URL = true;
    await expect(saveUserAiSettings('u1', { provider: 'openai_compatible', model: 'm', baseUrl: 'http://10.0.0.5/v1' })).resolves.toMatchObject({ baseUrl: 'http://10.0.0.5/v1' });
  });

  it('refuses everything when personal settings are switched off', async () => {
    envState.AI_ALLOW_USER_SETTINGS = false;
    await expect(saveUserAiSettings('u1', { provider: 'anthropic', apiKey: 'k' })).rejects.toThrow('does not allow');
  });

  it('rejects an unknown provider', async () => {
    await expect(saveUserAiSettings('u1', { provider: 'bogus' as never })).rejects.toThrow('provider must be one of');
  });
});

describe('resolveAiConfig', () => {
  const serverSettings = (values: Record<string, string>) =>
    getConfigValue.mockImplementation(async (key: string) => values[key]);

  it('uses the person\'s own settings before the server\'s', async () => {
    serverSettings({ AI_PROVIDER: 'openai', AI_MODEL: 'gpt-x', AI_API_KEY: 'server-key' });
    findUnique.mockResolvedValue({ provider: 'anthropic', model: null, baseUrl: null, apiKeyEncrypted: encryptSetting('user-key', SECRET) });
    const r = await resolveAiConfig('u1');
    expect(r?.source).toBe('user');
    expect(r?.config.apiKey).toBe('user-key');
  });

  it('falls back to the server\'s settings, and a call with no person only uses those', async () => {
    serverSettings({ AI_PROVIDER: 'openai', AI_MODEL: 'gpt-x', AI_API_KEY: 'server-key' });
    findUnique.mockResolvedValue(null);
    expect((await resolveAiConfig('u1'))?.source).toBe('server');
    findUnique.mockClear();
    expect((await resolveAiConfig())?.source).toBe('server');
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('is null when neither is set up', async () => {
    findUnique.mockResolvedValue(null);
    expect(await resolveAiConfig('u1')).toBeNull();
  });

  it('ignores personal settings the server no longer allows', async () => {
    findUnique.mockResolvedValue({ provider: 'ollama', model: 'llama3', baseUrl: 'http://h/v1', apiKeyEncrypted: null });
    expect(await getUserAiConfig('u1')).toBeNull(); // custom address, not allowed
    envState.AI_ALLOW_USER_SETTINGS = false;
    findUnique.mockResolvedValue({ provider: 'anthropic', model: null, baseUrl: null, apiKeyEncrypted: encryptSetting('k', SECRET) });
    expect(await getUserAiConfig('u1')).toBeNull();
  });

  it('treats a key it cannot decrypt as not set', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    findUnique.mockResolvedValue({ provider: 'anthropic', model: null, baseUrl: null, apiKeyEncrypted: encryptSetting('k', 'o'.repeat(32)) });
    expect(await getUserAiConfig('u1')).toBeNull();
    warn.mockRestore();
  });
});

describe('resolveAiConfig with a room', () => {
  const sponsorRow = { provider: 'anthropic', model: null, baseUrl: null, apiKeyEncrypted: encryptSetting('sponsor-key', SECRET) };

  // findUnique is the personal-settings lookup: the caller has none, the sponsor ('sp') has one.
  const callerHasNone = () => findUnique.mockImplementation(async ({ where }: { where: { userId: string } }) => (where.userId === 'sp' ? sponsorRow : null));

  beforeEach(() => {
    roomFindUnique.mockResolvedValue({ aiKeyOwnerId: 'sp' });
    memberFindUnique.mockResolvedValue({ userId: 'sp' });
    getConfigValue.mockImplementation(async (key: string) => ({ AI_PROVIDER: 'openai', AI_MODEL: 'gpt-x', AI_API_KEY: 'server-key' })[key]);
    callerHasNone();
  });

  it("uses the room sponsor's settings for someone with none of their own", async () => {
    const r = await resolveAiConfig('u1', 'room1');
    expect(r?.source).toBe('room');
    expect(r?.config.apiKey).toBe('sponsor-key');
    expect(memberFindUnique).toHaveBeenCalledWith({ where: { roomId_userId: { roomId: 'room1', userId: 'sp' } }, select: { userId: true } });
  });

  it("still prefers the caller's own settings over the room's", async () => {
    findUnique.mockImplementation(async ({ where }: { where: { userId: string } }) => ({ ...sponsorRow, apiKeyEncrypted: encryptSetting(`${where.userId}-key`, SECRET) }));
    const r = await resolveAiConfig('u1', 'room1');
    expect(r?.source).toBe('user');
    expect(r?.config.apiKey).toBe('u1-key');
  });

  it('skips a sponsor who has left the room, falling back to the server', async () => {
    memberFindUnique.mockResolvedValue(null);
    expect((await resolveAiConfig('u1', 'room1'))?.source).toBe('server');
  });

  it('skips a room with no sponsor, and a sponsor whose own settings are gone', async () => {
    roomFindUnique.mockResolvedValue({ aiKeyOwnerId: null });
    expect((await resolveAiConfig('u1', 'room1'))?.source).toBe('server');
    roomFindUnique.mockResolvedValue({ aiKeyOwnerId: 'sp' });
    findUnique.mockResolvedValue(null);
    expect((await resolveAiConfig('u1', 'room1'))?.source).toBe('server');
  });

  it('does not look at the room when none is given', async () => {
    await resolveAiConfig('u1');
    expect(roomFindUnique).not.toHaveBeenCalled();
  });
});

describe('clearUserAiSettings', () => {
  it('also stops the person sponsoring any room', async () => {
    await clearUserAiSettings('u1');
    expect(deleteMany).toHaveBeenCalledWith({ where: { userId: 'u1' } });
    expect(roomUpdateMany).toHaveBeenCalledWith({ where: { aiKeyOwnerId: 'u1' }, data: { aiKeyOwnerId: null } });
  });
});
