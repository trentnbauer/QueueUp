import { beforeEach, describe, expect, it, vi } from 'vitest';

const findUnique = vi.fn();
const update = vi.fn(async () => ({}));
vi.mock('../db/client.js', () => ({ prisma: { apiKey: { findUnique, update } } }));

const { generateApiKeyToken, hashApiKeyToken, isApiKeyActive, resolveApiKey } = await import('./apiKeys.js');

const row = (over: Record<string, unknown> = {}) => ({ id: 'k1', userId: 'u1', revokedAt: null, expiresAt: null, readOnly: false, ...over });
const bearer = () => `Bearer ${generateApiKeyToken()}`;

describe('isApiKeyActive', () => {
  const now = Date.parse('2026-10-06T00:00:00Z');
  it('is active with no expiry and not revoked', () => {
    expect(isApiKeyActive({ revokedAt: null, expiresAt: null }, now)).toBe(true);
  });
  it('is inactive once revoked', () => {
    expect(isApiKeyActive({ revokedAt: new Date(now - 1), expiresAt: null }, now)).toBe(false);
  });
  it('is active before its expiry and inactive at or after it', () => {
    expect(isApiKeyActive({ revokedAt: null, expiresAt: new Date(now + 1000) }, now)).toBe(true);
    expect(isApiKeyActive({ revokedAt: null, expiresAt: new Date(now) }, now)).toBe(false);
    expect(isApiKeyActive({ revokedAt: null, expiresAt: new Date(now - 1000) }, now)).toBe(false);
  });
});

describe('resolveApiKey', () => {
  beforeEach(() => {
    findUnique.mockReset();
    update.mockClear();
  });

  it('returns the user and read-only flag for a working key', async () => {
    findUnique.mockResolvedValue(row({ readOnly: true }));
    await expect(resolveApiKey(bearer())).resolves.toEqual({ userId: 'u1', readOnly: true });
  });

  it('rejects a missing header, an unknown key, a revoked key and an expired key', async () => {
    await expect(resolveApiKey(undefined)).rejects.toMatchObject({ statusCode: 401 });
    findUnique.mockResolvedValue(null);
    await expect(resolveApiKey(bearer())).rejects.toMatchObject({ statusCode: 401 });
    findUnique.mockResolvedValue(row({ revokedAt: new Date() }));
    await expect(resolveApiKey(bearer())).rejects.toMatchObject({ statusCode: 401 });
    findUnique.mockResolvedValue(row({ expiresAt: new Date(Date.now() - 1000) }));
    await expect(resolveApiKey(bearer())).rejects.toMatchObject({ statusCode: 401 });
  });

  it('looks the key up by the hash of the token, never the token', async () => {
    findUnique.mockResolvedValue(row());
    const header = bearer();
    await resolveApiKey(header);
    expect(findUnique).toHaveBeenCalledWith({ where: { hash: hashApiKeyToken(header.slice('Bearer '.length)) } });
  });
});
