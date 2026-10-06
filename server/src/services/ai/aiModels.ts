import { AI_PROVIDERS, type AiModelsRequest, type AiModelsResponse, type AiProvider } from '@queueup/shared';
import { HttpError } from '../../util/httpError.js';
import { getServerAiChain, getUserAiChain, normalizeBaseUrl } from './aiConfig.js';
import { assertPublicTarget } from './aiNetworkGuard.js';
import { AiProviderError, PROVIDER_DEFAULTS, listModels, type AiConfig } from './providers.js';

const isProvider = (v: unknown): v is AiProvider => typeof v === 'string' && (AI_PROVIDERS as readonly string[]).includes(v);

/** Asks the provider an entry points at which models it has, for the dropdown in AI settings. The
 * address and key come from what is on screen (so it works before saving), falling back to the saved
 * key of the entry at `index` when none was typed. A person's own address follows the same rules as
 * a real AI request: custom addresses only where the server allows them, and never one that points
 * inside the server's own network unless the operator allows that. The Administrator's own settings
 * are trusted. */
export async function listModelsFor(scope: { userId: string } | 'server', input: AiModelsRequest): Promise<AiModelsResponse> {
  if (!isProvider(input?.provider)) throw new HttpError(400, `provider must be one of: ${AI_PROVIDERS.join(', ')}`);
  const { provider } = input;
  const env = (await import('../../config/env.js')).env;

  const rawUrl = typeof input.baseUrl === 'string' && input.baseUrl.trim() ? input.baseUrl : null;
  const baseUrl = rawUrl ? normalizeBaseUrl(rawUrl) : PROVIDER_DEFAULTS[provider].baseUrl;
  if (!baseUrl) throw new HttpError(400, 'A base URL is required for this provider');
  const custom = !!rawUrl || provider === 'ollama' || provider === 'openai_compatible';
  const mine = scope !== 'server';
  if (mine && custom && !env.AI_ALLOW_USER_BASE_URL) {
    throw new HttpError(403, 'This server only lets you use the hosted providers (Anthropic, OpenAI, Gemini) at their standard address');
  }

  // A key typed now wins; otherwise the saved one for the same provider at that position.
  let apiKey = typeof input.apiKey === 'string' && input.apiKey.trim() ? input.apiKey.trim() : null;
  if (!apiKey && Number.isInteger(input.index) && (input.index as number) >= 0) {
    const chain = scope === 'server' ? await getServerAiChain({ includeDisabled: true }) : await getUserAiChain(scope.userId, { includeDisabled: true });
    const saved = chain[input.index as number];
    if (saved && saved.provider === provider) apiKey = saved.apiKey;
  }
  if (PROVIDER_DEFAULTS[provider].needsKey && !apiKey) throw new HttpError(400, 'Enter the API key first, so the provider can list its models');

  const userSupplied = mine && custom;
  if (userSupplied && !env.AI_ALLOW_PRIVATE_BASE_URL) {
    try {
      await assertPublicTarget(baseUrl);
    } catch (err) {
      throw new HttpError(424, err instanceof Error ? err.message : 'That AI address is not allowed');
    }
  }
  const config: AiConfig = { provider, model: '', baseUrl, apiKey, userSupplied, hideErrorBody: userSupplied && !!env.AI_ALLOW_PRIVATE_BASE_URL };
  try {
    return { models: await listModels(config) };
  } catch (err) {
    if (err instanceof AiProviderError) throw new HttpError(424, err.message);
    throw err;
  }
}
