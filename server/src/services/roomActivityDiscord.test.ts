import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('../db/client.js', () => ({
  prisma: {
    room: {
      findUnique: async () => ({ name: 'Squad', discordWebhookUrl: 'https://discord.com/api/webhooks/1/abc', discordEvents: null }),
    },
  },
}));

const { postRoomDiscord } = await import('./roomActivity.js');

describe('postRoomDiscord', () => {
  afterEach(() => vi.restoreAllMocks());

  it('turns off mentions, so "@everyone" in member-written text pings nobody', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 204 }));
    await postRoomDiscord('room-1', 'Sam reviewed "Portal": @everyone come play', undefined);
    const body = JSON.parse(String(fetchSpy.mock.calls[0]?.[1]?.body));
    expect(body.allowed_mentions).toEqual({ parse: [] });
  });
});
