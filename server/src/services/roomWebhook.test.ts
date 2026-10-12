import { describe, expect, it, vi } from 'vitest';

const findMany = vi.fn();
const update = vi.fn(async (_args: { where: { id: string }; data: { discordWebhookUrl: string } }) => ({}));
vi.mock('../db/client.js', () => ({ prisma: { room: { findMany, update } } }));
vi.mock('../config/env.js', () => ({ env: { SESSION_SECRET: 'this-server-secret' } }));

const { encryptPlaintextWebhooks, encryptWebhookUrl, readWebhookUrl } = await import('./roomWebhook.js');

const URL = 'https://discord.com/api/webhooks/123/token-abc';

describe('room Discord webhook encryption', () => {
  it('stores no readable token, and reads back under the same secret', () => {
    const stored = encryptWebhookUrl(URL, 'secret-a');
    expect(stored).not.toContain('token-abc');
    expect(readWebhookUrl(stored, 'secret-a')).toBe(URL);
  });

  it('cannot be read under another secret', () => {
    expect(readWebhookUrl(encryptWebhookUrl(URL, 'secret-a'), 'secret-b')).toBeNull();
  });

  it('reads a value saved before encryption as-is, and none as null', () => {
    expect(readWebhookUrl(URL, 'secret-a')).toBe(URL);
    expect(readWebhookUrl(null, 'secret-a')).toBeNull();
  });

  it('encrypts only the plain-text ones still stored', async () => {
    findMany.mockResolvedValueOnce([
      { id: 'old', discordWebhookUrl: URL },
      { id: 'new', discordWebhookUrl: encryptWebhookUrl(URL, 'this-server-secret') },
    ]);
    expect(await encryptPlaintextWebhooks()).toBe(1);
    expect(update).toHaveBeenCalledTimes(1);
    const { where, data } = update.mock.calls[0][0];
    expect(where).toEqual({ id: 'old' });
    expect(readWebhookUrl(data.discordWebhookUrl, 'this-server-secret')).toBe(URL);
  });
});
