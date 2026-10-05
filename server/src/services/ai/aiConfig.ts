import { AI_PROVIDERS, type AiProvider, type AiSettingsResponse, type AiSettingsSource, type SetUserAiSettingsRequest, type UserAiSettings } from '@queueup/shared';
import { prisma } from '../../db/client.js';
import { HttpError } from '../../util/httpError.js';
import { getConfigValue } from '../configResolver.js';
import { decryptSetting, encryptSetting } from '../settingsCrypto.js';
import { AiProviderError, callProvider, PROVIDER_DEFAULTS, type AiConfig, type AiRequest, type AiResponse } from './providers.js';

/** Works out which AI settings a call uses and makes the call. A person's own settings win, when the
 * server allows them; otherwise the server-wide ones (env, or Administrator settings as the
 * fallback) apply; with neither, AI is simply off. API keys are encrypted at rest with a key derived
 * from SESSION_SECRET (see settingsCrypto.ts) and only ever decrypted here, in memory, for a call.
 * Loaded lazily so this module stays importable without a parsed env (its unit tests). */
async function getEnv() {
  return (await import('../../config/env.js')).env;
}

const isProvider = (v: unknown): v is AiProvider => typeof v === 'string' && (AI_PROVIDERS as readonly string[]).includes(v);

/** A base URL a server will call: http(s) only, no embedded credentials, no query or fragment, no
 * trailing slash. Throws a 400 with a message fit to show the person. */
export function normalizeBaseUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new HttpError(400, 'The base URL is not a valid address');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new HttpError(400, 'The base URL must start with http:// or https://');
  if (url.username || url.password) throw new HttpError(400, 'Leave the username and password out of the base URL');
  if (url.search || url.hash) throw new HttpError(400, 'Leave the query and fragment out of the base URL');
  return url.toString().replace(/\/+$/, '');
}

/** Fills a provider's defaults into whatever was set. Null when something required is still missing
 * (no model, or no address for a provider that has none by default, or no key where one is needed). */
export function buildConfig(
  provider: AiProvider,
  parts: { model?: string | null; baseUrl?: string | null; apiKey?: string | null },
): AiConfig | null {
  const defaults = PROVIDER_DEFAULTS[provider];
  const model = parts.model || defaults.model;
  const baseUrl = parts.baseUrl || defaults.baseUrl;
  const apiKey = parts.apiKey || null;
  if (!model || !baseUrl) return null;
  if (defaults.needsKey && !apiKey) return null;
  return { provider, model, baseUrl: baseUrl.replace(/\/+$/, ''), apiKey };
}

const warnedUnreadable = new Set<string>();

async function readUserKey(userId: string, stored: string | null): Promise<string | null> {
  if (!stored) return null;
  const key = decryptSetting(stored, (await getEnv()).SESSION_SECRET);
  if (key === null && !warnedUnreadable.has(userId)) {
    warnedUnreadable.add(userId);
    console.warn(`A saved AI API key for user ${userId} can't be decrypted (SESSION_SECRET changed?) - it has to be entered again.`);
  }
  return key;
}

/** The server-wide settings (env first, then Administrator settings), or null when not set up. */
export async function getServerAiConfig(): Promise<AiConfig | null> {
  const env = await getEnv();
  const provider = await getConfigValue('AI_PROVIDER', env.AI_PROVIDER);
  if (!isProvider(provider)) return null;
  const [model, baseUrl, apiKey] = await Promise.all([
    getConfigValue('AI_MODEL', env.AI_MODEL),
    getConfigValue('AI_BASE_URL', env.AI_BASE_URL),
    getConfigValue('AI_API_KEY', env.AI_API_KEY),
  ]);
  return buildConfig(provider, { model, baseUrl, apiKey });
}

/** The person's own settings, or null when they have none, can't use them, or they're unusable. */
export async function getUserAiConfig(userId: string): Promise<AiConfig | null> {
  const env = await getEnv();
  if (!env.AI_ALLOW_USER_SETTINGS) return null;
  const row = await prisma.userAiSettings.findUnique({ where: { userId } });
  if (!row || !isProvider(row.provider)) return null;
  // A saved custom address only counts while the server still allows one.
  const usesCustomUrl = !!row.baseUrl || PROVIDER_DEFAULTS[row.provider].baseUrl === null || row.provider === 'ollama';
  if (usesCustomUrl && !env.AI_ALLOW_USER_BASE_URL) return null;
  return buildConfig(row.provider, { model: row.model, baseUrl: row.baseUrl, apiKey: await readUserKey(userId, row.apiKeyEncrypted) });
}

/** What a call for this person uses: their own settings, else the server's, else null. A call with
 * no person (a background job) only ever uses the server's. */
export async function resolveAiConfig(userId?: string): Promise<{ config: AiConfig; source: Exclude<AiSettingsSource, 'none'> } | null> {
  if (userId) {
    const own = await getUserAiConfig(userId);
    if (own) return { config: own, source: 'user' };
  }
  const server = await getServerAiConfig();
  return server ? { config: server, source: 'server' } : null;
}

/** Makes an AI call with the right settings. This is the one entry point features should use.
 * Throws a 400 when no AI is set up, and a 502 when the provider fails (the message says why,
 * never including the key). */
export async function aiComplete(req: AiRequest, opts: { userId?: string } = {}): Promise<AiResponse & { source: AiSettingsSource }> {
  const resolved = await resolveAiConfig(opts.userId);
  if (!resolved) throw new HttpError(400, 'AI is not set up. Add a provider in your account settings, or ask the server admin to set one.');
  try {
    const res = await callProvider(resolved.config, req);
    return { ...res, source: resolved.source };
  } catch (err) {
    if (err instanceof AiProviderError) throw new HttpError(502, err.message);
    throw err;
  }
}

/** Same as aiComplete but for the server-wide settings only (the Administrator's "test" button). */
export async function aiCompleteWithServer(req: AiRequest): Promise<AiResponse> {
  const config = await getServerAiConfig();
  if (!config) throw new HttpError(400, 'No server-wide AI provider is set up. Set a provider and model first.');
  try {
    return await callProvider(config, req);
  } catch (err) {
    if (err instanceof AiProviderError) throw new HttpError(502, err.message);
    throw err;
  }
}

function toUserSettings(row: { provider: string; model: string | null; baseUrl: string | null; apiKeyEncrypted: string | null }): UserAiSettings | null {
  if (!isProvider(row.provider)) return null;
  return { provider: row.provider, model: row.model, baseUrl: row.baseUrl, hasApiKey: !!row.apiKeyEncrypted };
}

/** Everything the settings screen needs: the person's own settings, the server's (without a key),
 * and which of them a call would use. */
export async function describeAiSettings(userId: string): Promise<AiSettingsResponse> {
  const env = await getEnv();
  const [row, server, resolved] = await Promise.all([
    prisma.userAiSettings.findUnique({ where: { userId } }),
    getServerAiConfig(),
    resolveAiConfig(userId),
  ]);
  return {
    user: row ? toUserSettings(row) : null,
    server: server ? { provider: server.provider, model: server.model, baseUrl: server.baseUrl } : null,
    effectiveSource: resolved?.source ?? 'none',
    userSettingsAllowed: env.AI_ALLOW_USER_SETTINGS,
    userBaseUrlAllowed: env.AI_ALLOW_USER_BASE_URL,
    providers: [...AI_PROVIDERS],
  };
}

/** Saves the person's own settings, validating them first. An API key left out keeps the one saved
 * (so changing the model doesn't mean pasting the key again); null or '' removes it. */
export async function saveUserAiSettings(userId: string, input: SetUserAiSettingsRequest): Promise<UserAiSettings> {
  const env = await getEnv();
  if (!env.AI_ALLOW_USER_SETTINGS) throw new HttpError(403, 'This server does not allow personal AI settings');
  if (!isProvider(input?.provider)) throw new HttpError(400, `provider must be one of: ${AI_PROVIDERS.join(', ')}`);
  const { provider } = input;
  const defaults = PROVIDER_DEFAULTS[provider];

  const model = typeof input.model === 'string' && input.model.trim() ? input.model.trim().slice(0, 200) : null;
  if (!model && !defaults.model) throw new HttpError(400, 'A model name is required for this provider');

  const rawUrl = typeof input.baseUrl === 'string' && input.baseUrl.trim() ? input.baseUrl : null;
  const baseUrl = rawUrl ? normalizeBaseUrl(rawUrl) : null;
  if (!baseUrl && !defaults.baseUrl) throw new HttpError(400, 'A base URL is required for this provider');
  // The server makes this request, so a custom address is only for instances that opted in.
  const needsCustomUrl = !!baseUrl || provider === 'ollama' || provider === 'openai_compatible';
  if (needsCustomUrl && !env.AI_ALLOW_USER_BASE_URL) {
    throw new HttpError(403, 'This server only lets you use the hosted providers (Anthropic, OpenAI, Gemini) at their standard address');
  }

  const existing = await prisma.userAiSettings.findUnique({ where: { userId } });
  let apiKeyEncrypted: string | null;
  if (input.apiKey === undefined) {
    // Keep the saved key, unless it belonged to a different provider's account.
    apiKeyEncrypted = existing && existing.provider === provider ? existing.apiKeyEncrypted : null;
  } else if (input.apiKey === null || (typeof input.apiKey === 'string' && !input.apiKey.trim())) {
    apiKeyEncrypted = null;
  } else if (typeof input.apiKey === 'string') {
    apiKeyEncrypted = encryptSetting(input.apiKey.trim(), env.SESSION_SECRET);
    warnedUnreadable.delete(userId);
  } else {
    throw new HttpError(400, 'apiKey must be text');
  }
  if (defaults.needsKey && !apiKeyEncrypted) throw new HttpError(400, 'An API key is required for this provider');

  const row = await prisma.userAiSettings.upsert({
    where: { userId },
    create: { userId, provider, model, baseUrl, apiKeyEncrypted },
    update: { provider, model, baseUrl, apiKeyEncrypted },
  });
  return toUserSettings(row)!;
}

export async function clearUserAiSettings(userId: string): Promise<void> {
  await prisma.userAiSettings.deleteMany({ where: { userId } });
}
