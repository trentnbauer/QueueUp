import { randomUUID } from 'node:crypto';
import { AI_MAX_FALLBACKS, AI_PROVIDERS, type AiFallbackEntry, type AiFallbackInput, type AiFallbackNotice, type AiProvider } from '@queueup/shared';
import { HttpError } from '../../util/httpError.js';
import { decryptSetting, encryptSetting } from '../settingsCrypto.js';
import { PROVIDER_DEFAULTS } from './providers.js';

/** The backup providers behind a person's (or the server's) first one: tried in order when it fails.
 * Stored as one encrypted JSON list, so a key is never readable at rest and the list stays together. */

export interface StoredFallback {
  id: string;
  provider: AiProvider;
  model: string | null;
  baseUrl: string | null;
  apiKey: string | null;
  /** Switched off: kept in the list but skipped when making a call. Absent means on. */
  disabled?: boolean;
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

/** The provider, model and address of one entry, checked and trimmed. `allowCustomUrl` is false on a
 * server where people may not point AI at their own address. */
export function validateParts(
  input: { provider?: unknown; model?: unknown; baseUrl?: unknown },
  allowCustomUrl: boolean,
): { provider: AiProvider; model: string | null; baseUrl: string | null } {
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
  if (needsCustomUrl && !allowCustomUrl) {
    throw new HttpError(403, 'This server only lets you use the hosted providers (Anthropic, OpenAI, Gemini) at their standard address');
  }
  return { provider, model, baseUrl };
}

/** Reads a stored list. Anything unreadable (wrong secret, damaged) is an empty list. */
export function parseFallbacks(json: string | null | undefined): StoredFallback[] {
  if (!json) return [];
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];
  const out: StoredFallback[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object' || !isProvider((item as { provider?: unknown }).provider)) continue;
    const e = item as Record<string, unknown>;
    out.push({
      id: typeof e.id === 'string' && e.id ? e.id : randomUUID(),
      provider: e.provider as AiProvider,
      model: typeof e.model === 'string' && e.model ? e.model : null,
      baseUrl: typeof e.baseUrl === 'string' && e.baseUrl ? e.baseUrl : null,
      apiKey: typeof e.apiKey === 'string' && e.apiKey ? e.apiKey : null,
      ...(e.disabled === true ? { disabled: true } : {}),
    });
  }
  return out.slice(0, AI_MAX_FALLBACKS);
}

/** Decrypts and parses a list stored with `sealFallbacks`. */
export function openFallbacks(stored: string | null | undefined, secret: string): StoredFallback[] {
  if (!stored) return [];
  const json = decryptSetting(stored, secret);
  return json === null ? [] : parseFallbacks(json);
}

/** Encrypts a list for storage; null when it's empty. */
export function sealFallbacks(list: StoredFallback[], secret: string): string | null {
  return list.length ? encryptSetting(JSON.stringify(list), secret) : null;
}

/** Turns what the client sent into the list to store. An entry with a known `id` and an omitted
 * `apiKey` keeps its saved key (unless its provider changed, which is a different account). */
export function mergeFallbacks(existing: StoredFallback[], input: unknown, allowCustomUrl: boolean): StoredFallback[] {
  if (!Array.isArray(input)) throw new HttpError(400, 'fallbacks must be a list');
  if (input.length > AI_MAX_FALLBACKS) throw new HttpError(400, `At most ${AI_MAX_FALLBACKS} backup providers`);
  const byId = new Map(existing.map((e) => [e.id, e]));
  const seen = new Set<string>();
  return (input as AiFallbackInput[]).map((raw) => {
    const parts = validateParts(raw, allowCustomUrl);
    const prior = typeof raw.id === 'string' ? byId.get(raw.id) : undefined;
    let apiKey: string | null;
    if (raw.apiKey === undefined) apiKey = prior && prior.provider === parts.provider ? prior.apiKey : null;
    else if (raw.apiKey === null || (typeof raw.apiKey === 'string' && !raw.apiKey.trim())) apiKey = null;
    else if (typeof raw.apiKey === 'string') apiKey = raw.apiKey.trim();
    else throw new HttpError(400, 'apiKey must be text');
    if (PROVIDER_DEFAULTS[parts.provider].needsKey && !apiKey) throw new HttpError(400, 'An API key is required for this provider');
    // A repeated or unknown id gets a fresh one, so ids stay unique within the list.
    const id = prior && !seen.has(prior.id) ? prior.id : randomUUID();
    seen.add(id);
    const disabled = raw.disabled === undefined ? !!prior?.disabled : raw.disabled === true;
    return { id, ...parts, apiKey, ...(disabled ? { disabled: true } : {}) };
  });
}

export function fallbackToPublic(e: StoredFallback): AiFallbackEntry {
  return { id: e.id, provider: e.provider, model: e.model, baseUrl: e.baseUrl, hasApiKey: !!e.apiKey, disabled: !!e.disabled };
}

// The latest takeover per owner ('server', or `user:<id>`), so the settings screens can warn about
// it. Kept in memory: a restart forgets it, which is fine for a nudge.
const lastFallbacks = new Map<string, AiFallbackNotice>();

export const recordFallback = (owner: string, notice: AiFallbackNotice) => void lastFallbacks.set(owner, notice);
export const getLastFallback = (owner: string): AiFallbackNotice | null => lastFallbacks.get(owner) ?? null;
/** The person fixed or replaced their settings, so the warning no longer applies. */
export const clearLastFallback = (owner: string) => void lastFallbacks.delete(owner);
