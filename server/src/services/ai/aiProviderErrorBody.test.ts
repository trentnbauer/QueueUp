import { describe, expect, it } from 'vitest';
import { callProvider, type AiConfig } from './providers.js';

const CONFIG: AiConfig = { provider: 'openai_compatible', model: 'm', baseUrl: 'http://8.8.8.8/v1', apiKey: null };
const REQ = { messages: [{ role: 'user' as const, content: 'hi' }] };
const failing = (status: number, body: string) => (async () => new Response(body, { status })) as unknown as typeof fetch;

describe('callProvider error text', () => {
  it('includes the provider\'s own message by default', async () => {
    await expect(callProvider(CONFIG, REQ, failing(402, JSON.stringify({ error: { message: 'You have no credits remaining' } })))).rejects.toMatchObject({
      message: 'The AI provider returned 402: You have no credits remaining',
      upstreamStatus: 402,
    });
  });

  it('keeps only the status when the error text is to be withheld', async () => {
    const body = JSON.stringify({ error: { message: 'internal admin panel: secret-token-123' } });
    let message = '';
    try {
      await callProvider({ ...CONFIG, hideErrorBody: true }, REQ, failing(500, body));
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toBe('The AI provider returned 500');
    expect(message).not.toContain('secret-token');
  });
});
