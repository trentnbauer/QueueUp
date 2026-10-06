import type { AiProvider } from '@queueup/shared';

/** Talks to a language model over plain HTTP, so there is no SDK to keep up to date and a new
 * OpenAI-style server needs no code. Each provider is a pair of pure functions - build the request,
 * read the reply - which keeps them unit-testable without a network; `callProvider` is the only
 * part that does I/O. Nothing here knows about users or where settings are stored (see aiConfig.ts). */

export interface AiMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AiRequest {
  /** Instructions for the model, kept apart from the conversation (every provider has its own spot for it). */
  system?: string;
  messages: AiMessage[];
  /** Upper bound on the reply length, in tokens. Defaults to DEFAULT_MAX_TOKENS. */
  maxTokens?: number;
  temperature?: number;
}

export interface AiResponse {
  text: string;
  provider: AiProvider;
  model: string;
  usage: { inputTokens: number | null; outputTokens: number | null };
}

/** Everything needed to make one call, already resolved from user / server settings. */
export interface AiConfig {
  provider: AiProvider;
  model: string;
  /** Without a trailing slash. */
  baseUrl: string;
  /** Null for providers that don't need one (a local model). */
  apiKey: string | null;
  /** The address was entered by a person (their own settings, a room sponsor's, their backups), not
   * set by the operator. Such an address is checked against the server's own network before every
   * request (see aiNetworkGuard.ts), and where the operator allows private addresses the provider's
   * error text is not shown back, since either would let a person probe what the server can reach. */
  userSupplied?: boolean;
  /** This entry is the server's own AI tacked on after a person's (or room sponsor's) providers as
   * the last resort. Using it counts against that person's daily allowance on the shared AI. */
  viaServer?: boolean;
  /** Set by the caller (not stored): leave the provider's error text out of failures. */
  hideErrorBody?: boolean;
}

export const DEFAULT_MAX_TOKENS = 1024;
export const REQUEST_TIMEOUT_MS = 60_000;
/** How much of an upstream error body is kept in the message - enough to say what's wrong, small
 * enough that a verbose error page can't flood a log. */
const ERROR_BODY_LIMIT = 300;

export const PROVIDER_DEFAULTS: Record<AiProvider, { baseUrl: string | null; model: string | null; needsKey: boolean }> = {
  anthropic: { baseUrl: 'https://api.anthropic.com', model: 'claude-sonnet-5-5', needsKey: true },
  openai: { baseUrl: 'https://api.openai.com/v1', model: null, needsKey: true },
  gemini: { baseUrl: 'https://generativelanguage.googleapis.com/v1beta', model: null, needsKey: true },
  // From inside a container, localhost is the container itself - point at the host (for example
  // http://host.docker.internal:11434/v1) when Ollama runs outside this stack.
  ollama: { baseUrl: 'http://localhost:11434/v1', model: null, needsKey: false },
  // No default: the address is the whole point of choosing this one.
  openai_compatible: { baseUrl: null, model: null, needsKey: false },
};

export class AiProviderError extends Error {
  constructor(
    message: string,
    /** The upstream HTTP status, or null when the request never got a reply (timeout, DNS, refused). */
    readonly upstreamStatus: number | null,
    /** From a Retry-After header (whole seconds), when the provider sent one. */
    readonly retryAfterSeconds: number | null = null,
  ) {
    super(message);
    this.name = 'AiProviderError';
  }
}

export interface BuiltRequest {
  url: string;
  headers: Record<string, string>;
  body: unknown;
}

const isOpenAiStyle = (p: AiProvider) => p === 'openai' || p === 'ollama' || p === 'openai_compatible';

export function buildRequest(config: AiConfig, req: AiRequest): BuiltRequest {
  const maxTokens = req.maxTokens ?? DEFAULT_MAX_TOKENS;
  const json = { 'content-type': 'application/json' };

  if (config.provider === 'anthropic') {
    return {
      url: `${config.baseUrl}/v1/messages`,
      headers: { ...json, 'x-api-key': config.apiKey ?? '', 'anthropic-version': '2023-06-01' },
      body: {
        model: config.model,
        max_tokens: maxTokens,
        ...(req.system ? { system: req.system } : {}),
        ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
        messages: req.messages,
      },
    };
  }

  if (config.provider === 'gemini') {
    return {
      url: `${config.baseUrl}/models/${encodeURIComponent(config.model)}:generateContent`,
      // The key goes in a header, not the query string, so it never lands in a proxy or access log.
      headers: { ...json, 'x-goog-api-key': config.apiKey ?? '' },
      body: {
        ...(req.system ? { systemInstruction: { parts: [{ text: req.system }] } } : {}),
        contents: req.messages.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
        generationConfig: {
          maxOutputTokens: maxTokens,
          ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
        },
      },
    };
  }

  // openai, ollama, openai_compatible: the OpenAI chat completions shape.
  return {
    url: `${config.baseUrl}/chat/completions`,
    headers: { ...json, ...(config.apiKey ? { authorization: `Bearer ${config.apiKey}` } : {}) },
    body: {
      model: config.model,
      // OpenAI's newer models reject max_tokens; everything else that speaks this API still wants it.
      ...(config.provider === 'openai' ? { max_completion_tokens: maxTokens } : { max_tokens: maxTokens }),
      ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
      messages: [...(req.system ? [{ role: 'system', content: req.system }] : []), ...req.messages],
    },
  };
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** Reads the model's text and token counts out of a provider's reply. Throws AiProviderError when
 * the reply has no text - a safety-blocked or empty answer is an error, not an empty string. */
export function parseResponse(config: AiConfig, data: unknown): AiResponse {
  const d = (data ?? {}) as Record<string, any>;
  let text = '';
  let usage: AiResponse['usage'] = { inputTokens: null, outputTokens: null };

  if (config.provider === 'anthropic') {
    const blocks: { type?: string; text?: string }[] = Array.isArray(d.content) ? d.content : [];
    text = blocks.filter((b) => b.type === 'text' && typeof b.text === 'string').map((b) => b.text).join('');
    usage = { inputTokens: num(d.usage?.input_tokens), outputTokens: num(d.usage?.output_tokens) };
  } else if (config.provider === 'gemini') {
    const parts: { text?: string }[] = Array.isArray(d.candidates?.[0]?.content?.parts) ? d.candidates[0].content.parts : [];
    text = parts.map((p) => (typeof p.text === 'string' ? p.text : '')).join('');
    usage = { inputTokens: num(d.usageMetadata?.promptTokenCount), outputTokens: num(d.usageMetadata?.candidatesTokenCount) };
  } else if (isOpenAiStyle(config.provider)) {
    const content = d.choices?.[0]?.message?.content;
    text = typeof content === 'string' ? content : '';
    usage = { inputTokens: num(d.usage?.prompt_tokens), outputTokens: num(d.usage?.completion_tokens) };
  }

  if (!text) throw new AiProviderError('The model returned an empty reply', null);
  return { text, provider: config.provider, model: config.model, usage };
}

/** Pulls a readable message out of an upstream error body (every provider nests it differently),
 * falling back to the start of the raw text. Never includes request headers, so no key can leak. */
export function errorMessageFrom(body: string): string {
  try {
    const d = JSON.parse(body) as Record<string, any>;
    const msg = d.error?.message ?? d.message ?? (typeof d.error === 'string' ? d.error : undefined);
    if (typeof msg === 'string' && msg) return msg.slice(0, ERROR_BODY_LIMIT);
  } catch {
    // Not JSON - use the raw text below.
  }
  return body.slice(0, ERROR_BODY_LIMIT);
}

/** Models that have told us they don't accept a `temperature` (newer Claude and OpenAI reasoning
 * models reject it with a 400), so later calls skip it instead of failing once first. */
const noTemperature = new Set<string>();
const modelKey = (config: AiConfig) => `${config.provider}|${config.baseUrl}|${config.model}`;

export async function callProvider(config: AiConfig, req: AiRequest, fetchImpl: typeof fetch = fetch): Promise<AiResponse> {
  if (req.temperature !== undefined && noTemperature.has(modelKey(config))) {
    return callProvider(config, { ...req, temperature: undefined }, fetchImpl);
  }
  const built = buildRequest(config, req);
  let res: Response;
  try {
    res = await fetchImpl(built.url, {
      method: 'POST',
      headers: built.headers,
      body: JSON.stringify(built.body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      // Never follow a redirect: with a user-supplied base URL, a host could 307 this POST (and its
      // key header) on to an address inside the network. A 3xx just reads as a failed request.
      redirect: 'manual',
    });
  } catch (err) {
    const timedOut = err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError');
    throw new AiProviderError(timedOut ? 'The AI provider took too long to answer' : 'Could not reach the AI provider', null);
  }
  if (!res.ok) {
    // Where a person-supplied address may point inside the network (the operator allowed private
    // addresses), only the status comes back: the body of an error from whatever it points at would
    // otherwise be a way to read internal services. A public address can show its own error text.
    const rawBody = await res.text().catch(() => '');
    // The model refuses the sampling setting: remember that and run the request again without it.
    if (res.status === 400 && req.temperature !== undefined && /temperature/i.test(errorMessageFrom(rawBody))) {
      noTemperature.add(modelKey(config));
      return callProvider(config, { ...req, temperature: undefined }, fetchImpl);
    }
    const detail = config.hideErrorBody ? '' : errorMessageFrom(rawBody);
    const retryAfter = Number(res.headers.get('retry-after'));
    throw new AiProviderError(`The AI provider returned ${res.status}${detail ? `: ${detail}` : ''}`, res.status, Number.isFinite(retryAfter) && retryAfter > 0 ? Math.round(retryAfter) : null);
  }
  return parseResponse(config, await res.json().catch(() => null));
}

const MODELS_TIMEOUT_MS = 15_000;
const MAX_MODELS = 500;

/** The model names a provider offers, for the settings dropdown. Every provider has a "list models"
 * call (Ollama and OpenAI-style servers answer `/models`, Anthropic `/v1/models`, Gemini `/models`).
 * Same safety rules as a normal request: no redirects, and no error text shown back when
 * `hideErrorBody` is set. Gemini lists only models that can generate text. */
export async function listModels(config: AiConfig, fetchImpl: typeof fetch = fetch): Promise<string[]> {
  let url: string;
  let headers: Record<string, string>;
  if (config.provider === 'anthropic') {
    url = `${config.baseUrl}/v1/models?limit=1000`;
    headers = { 'x-api-key': config.apiKey ?? '', 'anthropic-version': '2023-06-01' };
  } else if (config.provider === 'gemini') {
    url = `${config.baseUrl}/models?pageSize=1000`;
    headers = { 'x-goog-api-key': config.apiKey ?? '' };
  } else {
    url = `${config.baseUrl}/models`;
    headers = config.apiKey ? { authorization: `Bearer ${config.apiKey}` } : {};
  }
  let res: Response;
  try {
    res = await fetchImpl(url, { method: 'GET', headers, signal: AbortSignal.timeout(MODELS_TIMEOUT_MS), redirect: 'manual' });
  } catch (err) {
    const timedOut = err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError');
    throw new AiProviderError(timedOut ? 'The AI provider took too long to answer' : 'Could not reach the AI provider', null);
  }
  if (!res.ok) {
    const detail = config.hideErrorBody ? '' : errorMessageFrom(await res.text().catch(() => ''));
    throw new AiProviderError(`The AI provider returned ${res.status}${detail ? `: ${detail}` : ''}`, res.status);
  }
  const d = (await res.json().catch(() => null)) as Record<string, any> | null;
  const names: string[] = [];
  if (config.provider === 'gemini') {
    for (const m of Array.isArray(d?.models) ? d.models : []) {
      const methods: unknown = m?.supportedGenerationMethods;
      if (typeof m?.name === 'string' && (!Array.isArray(methods) || methods.includes('generateContent'))) names.push(m.name.replace(/^models\//, ''));
    }
  } else {
    for (const m of Array.isArray(d?.data) ? d.data : []) if (typeof m?.id === 'string') names.push(m.id);
  }
  return [...new Set(names.map((n) => n.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b)).slice(0, MAX_MODELS);
}
