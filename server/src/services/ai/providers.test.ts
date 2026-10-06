import { describe, expect, it, vi } from 'vitest';
import { AiProviderError, buildRequest, callProvider, errorMessageFrom, listModels, parseResponse, type AiConfig } from './providers.js';

const req = { system: 'Be brief.', messages: [{ role: 'user' as const, content: 'Hi' }, { role: 'assistant' as const, content: 'Hello' }, { role: 'user' as const, content: 'Again' }], maxTokens: 50, temperature: 0.2 };

const anthropic: AiConfig = { provider: 'anthropic', model: 'claude-sonnet-5-5', baseUrl: 'https://api.anthropic.com', apiKey: 'sk-ant' };
const openai: AiConfig = { provider: 'openai', model: 'gpt-x', baseUrl: 'https://api.openai.com/v1', apiKey: 'sk-oa' };
const gemini: AiConfig = { provider: 'gemini', model: 'gemini-x', baseUrl: 'https://generativelanguage.googleapis.com/v1beta', apiKey: 'g-key' };
const ollama: AiConfig = { provider: 'ollama', model: 'llama3', baseUrl: 'http://localhost:11434/v1', apiKey: null };

describe('buildRequest', () => {
  it('builds an Anthropic messages call with the key in a header', () => {
    const r = buildRequest(anthropic, req);
    expect(r.url).toBe('https://api.anthropic.com/v1/messages');
    expect(r.headers['x-api-key']).toBe('sk-ant');
    expect(r.headers['anthropic-version']).toBe('2023-06-01');
    expect(r.body).toEqual({ model: 'claude-sonnet-5-5', max_tokens: 50, system: 'Be brief.', temperature: 0.2, messages: req.messages });
  });

  it('builds an OpenAI chat call with the system prompt first and max_completion_tokens', () => {
    const r = buildRequest(openai, req) as { url: string; headers: Record<string, string>; body: Record<string, unknown> };
    expect(r.url).toBe('https://api.openai.com/v1/chat/completions');
    expect(r.headers.authorization).toBe('Bearer sk-oa');
    expect(r.body.max_completion_tokens).toBe(50);
    expect(r.body.max_tokens).toBeUndefined();
    expect((r.body.messages as { role: string }[])[0]).toEqual({ role: 'system', content: 'Be brief.' });
  });

  it('uses max_tokens and no auth header for a local model without a key', () => {
    const r = buildRequest(ollama, req) as { headers: Record<string, string>; body: Record<string, unknown> };
    expect(r.headers.authorization).toBeUndefined();
    expect(r.body.max_tokens).toBe(50);
    expect(r.body.max_completion_tokens).toBeUndefined();
  });

  it('builds a Gemini call with the key in a header and assistant turns as "model"', () => {
    const r = buildRequest(gemini, req) as { url: string; headers: Record<string, string>; body: any };
    expect(r.url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-x:generateContent');
    expect(r.url).not.toContain('g-key');
    expect(r.headers['x-goog-api-key']).toBe('g-key');
    expect(r.body.systemInstruction).toEqual({ parts: [{ text: 'Be brief.' }] });
    expect(r.body.contents.map((c: { role: string }) => c.role)).toEqual(['user', 'model', 'user']);
    expect(r.body.generationConfig).toEqual({ maxOutputTokens: 50, temperature: 0.2 });
  });

  it('defaults the reply length and leaves out unset options', () => {
    const r = buildRequest(anthropic, { messages: [{ role: 'user', content: 'x' }] });
    expect(r.body).toEqual({ model: 'claude-sonnet-5-5', max_tokens: 1024, messages: [{ role: 'user', content: 'x' }] });
  });
});

describe('parseResponse', () => {
  it('joins Anthropic text blocks and reads usage', () => {
    const res = parseResponse(anthropic, { content: [{ type: 'text', text: 'Hel' }, { type: 'tool_use' }, { type: 'text', text: 'lo' }], usage: { input_tokens: 3, output_tokens: 2 } });
    expect(res).toEqual({ text: 'Hello', provider: 'anthropic', model: 'claude-sonnet-5-5', usage: { inputTokens: 3, outputTokens: 2 } });
  });

  it('reads an OpenAI-style reply', () => {
    const res = parseResponse(ollama, { choices: [{ message: { content: 'OK' } }], usage: { prompt_tokens: 4, completion_tokens: 1 } });
    expect(res.text).toBe('OK');
    expect(res.usage).toEqual({ inputTokens: 4, outputTokens: 1 });
  });

  it('reads a Gemini reply', () => {
    const res = parseResponse(gemini, { candidates: [{ content: { parts: [{ text: 'A' }, { text: 'B' }] } }], usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 2 } });
    expect(res.text).toBe('AB');
    expect(res.usage).toEqual({ inputTokens: 5, outputTokens: 2 });
  });

  it('treats an empty or blocked answer as an error', () => {
    expect(() => parseResponse(gemini, { candidates: [{ finishReason: 'SAFETY' }] })).toThrow(AiProviderError);
    expect(() => parseResponse(openai, { choices: [{ message: { content: null } }] })).toThrow('empty reply');
    expect(() => parseResponse(openai, null)).toThrow(AiProviderError);
  });
});

describe('errorMessageFrom', () => {
  it('finds the message in each provider\'s error shape', () => {
    expect(errorMessageFrom(JSON.stringify({ error: { message: 'bad key' } }))).toBe('bad key');
    expect(errorMessageFrom(JSON.stringify({ message: 'nope' }))).toBe('nope');
    expect(errorMessageFrom(JSON.stringify({ error: 'plain' }))).toBe('plain');
  });

  it('falls back to the start of a non-JSON body', () => {
    expect(errorMessageFrom('<html>' + 'x'.repeat(1000))).toHaveLength(300);
  });
});

describe('callProvider', () => {
  it('posts the built request and returns the parsed reply', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: 'hi' } }] }), { status: 200 }));
    const res = await callProvider(openai, req, fetchImpl as unknown as typeof fetch);
    expect(res.text).toBe('hi');
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.openai.com/v1/chat/completions');
    expect(init.method).toBe('POST');
  });

  it('reports an upstream error without including the key', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ error: { message: 'Invalid API key' } }), { status: 401 }));
    const err = await callProvider(openai, req, fetchImpl as unknown as typeof fetch).catch((e) => e);
    expect(err).toBeInstanceOf(AiProviderError);
    expect(err.upstreamStatus).toBe(401);
    expect(err.message).toContain('401');
    expect(err.message).toContain('Invalid API key');
    expect(err.message).not.toContain('sk-oa');
  });

  it('retries without temperature when the model rejects it, and remembers that', async () => {
    const strict: AiConfig = { ...anthropic, model: 'claude-strict-temp-test' };
    const ok = JSON.stringify({ content: [{ type: 'text', text: 'hi' }] });
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) =>
      JSON.parse(String(init?.body)).temperature !== undefined
        ? new Response(JSON.stringify({ error: { message: '`temperature` is deprecated for this model.' } }), { status: 400 })
        : new Response(ok, { status: 200 }),
    );
    expect((await callProvider(strict, req, fetchImpl as unknown as typeof fetch)).text).toBe('hi');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    // Second call goes straight out without it.
    await callProvider(strict, req, fetchImpl as unknown as typeof fetch);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('does not retry other 400s', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ error: { message: 'max_tokens too large' } }), { status: 400 }));
    await expect(callProvider({ ...openai, model: 'gpt-other' }, req, fetchImpl as unknown as typeof fetch)).rejects.toThrow('400');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('turns a network failure and a timeout into friendly errors', async () => {
    const down = vi.fn(async () => {
      throw new TypeError('fetch failed');
    });
    await expect(callProvider(ollama, req, down as unknown as typeof fetch)).rejects.toThrow('Could not reach');
    const slow = vi.fn(async () => {
      throw Object.assign(new Error('t'), { name: 'TimeoutError' });
    });
    await expect(callProvider(ollama, req, slow as unknown as typeof fetch)).rejects.toThrow('took too long');
  });
});

describe('listModels', () => {
  const gemini: AiConfig = { provider: 'gemini', model: '', baseUrl: 'https://generativelanguage.googleapis.com/v1beta', apiKey: 'g-key' };
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

  it('asks Anthropic for /v1/models with its key headers, and returns the names sorted', async () => {
    const fetchImpl = vi.fn(async () => json({ data: [{ id: 'claude-sonnet-5-5' }, { id: 'claude-haiku-4-5-20251001' }] }));
    expect(await listModels(anthropic, fetchImpl as unknown as typeof fetch)).toEqual(['claude-haiku-4-5-20251001', 'claude-sonnet-5-5']);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.anthropic.com/v1/models?limit=1000');
    expect((init.headers as Record<string, string>)['x-api-key']).toBe('sk-ant');
    expect(init.redirect).toBe('manual');
  });

  it('asks OpenAI-style servers (Ollama too) for /models, sending a key only when there is one', async () => {
    const fetchImpl = vi.fn(async () => json({ data: [{ id: 'llama3.2:3b' }, { id: 'llama3.2:3b' }, { id: 'qwen2.5:3b' }] }));
    expect(await listModels(ollama, fetchImpl as unknown as typeof fetch)).toEqual(['llama3.2:3b', 'qwen2.5:3b']);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${ollama.baseUrl}/models`);
    expect((init.headers as Record<string, string>).authorization).toBeUndefined();
    await listModels(openai, fetchImpl as unknown as typeof fetch);
    expect(((fetchImpl.mock.calls[1] as unknown as [string, RequestInit])[1].headers as Record<string, string>).authorization).toBe('Bearer sk-oa');
  });

  it('keeps only Gemini models that can write text, without the "models/" prefix', async () => {
    const fetchImpl = vi.fn(async () =>
      json({ models: [{ name: 'models/gemini-2.5-flash', supportedGenerationMethods: ['generateContent'] }, { name: 'models/text-embedding-004', supportedGenerationMethods: ['embedContent'] }] }),
    );
    expect(await listModels(gemini, fetchImpl as unknown as typeof fetch)).toEqual(['gemini-2.5-flash']);
    expect(((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].headers as Record<string, string>)['x-goog-api-key']).toBe('g-key');
  });

  it('reports failures like a normal request, hiding the body when asked', async () => {
    const bad = vi.fn(async () => json({ error: { message: 'Invalid API key' } }, 401));
    await expect(listModels(openai, bad as unknown as typeof fetch)).rejects.toThrow('401: Invalid API key');
    await expect(listModels({ ...openai, hideErrorBody: true }, bad as unknown as typeof fetch)).rejects.toThrow(/^The AI provider returned 401$/);
    const down = vi.fn(async () => {
      throw new TypeError('fetch failed');
    });
    await expect(listModels(ollama, down as unknown as typeof fetch)).rejects.toThrow('Could not reach');
  });
});
