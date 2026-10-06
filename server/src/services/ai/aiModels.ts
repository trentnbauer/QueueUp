import { type AiModelsRequest, type AiModelsResponse } from '@queueup/shared';
import { HttpError } from '../../util/httpError.js';
import { getEntryParts } from './aiConfig.js';
import { assertPublicTarget } from './aiNetworkGuard.js';
import { AiProviderError, PROVIDER_DEFAULTS, listModels, type AiConfig } from './providers.js';

/** Asks the provider a saved entry points at which models it has, for the dropdown in AI settings.
 * The address and key come from what is saved for that entry (its position in the settings list), never
 * from the request, so this cannot be pointed at an address the settings do not already hold. A
 * person's own address follows the same rules as a real AI request: custom addresses only where the
 * server allows them, and never one that points inside the server's own network unless the operator
 * allows that. The Administrator's own settings are trusted. */
export async function listModelsFor(scope: { userId: string } | 'server', input: AiModelsRequest): Promise<AiModelsResponse> {
  const parts = await getEntryParts(scope, input?.index as number);
  if (!parts) throw new HttpError(404, 'That provider is not saved yet. Save it first, then load its models.');
  const env = (await import('../../config/env.js')).env;

  const baseUrl = parts.baseUrl ?? PROVIDER_DEFAULTS[parts.provider].baseUrl;
  if (!baseUrl) throw new HttpError(400, 'A base URL is required for this provider');
  const mine = scope !== 'server';
  const userSupplied = mine && parts.userSupplied;
  if (userSupplied && !env.AI_ALLOW_USER_BASE_URL) {
    throw new HttpError(403, 'This server only lets you use the hosted providers (Anthropic, OpenAI, Gemini) at their standard address');
  }
  if (PROVIDER_DEFAULTS[parts.provider].needsKey && !parts.apiKey) throw new HttpError(400, 'Enter and save the API key first, so the provider can list its models');

  if (userSupplied && !env.AI_ALLOW_PRIVATE_BASE_URL) {
    try {
      await assertPublicTarget(baseUrl);
    } catch (err) {
      throw new HttpError(424, err instanceof Error ? err.message : 'That AI address is not allowed');
    }
  }
  const config: AiConfig = { provider: parts.provider, model: '', baseUrl: baseUrl.replace(/\/+$/, ''), apiKey: parts.apiKey, userSupplied, hideErrorBody: userSupplied && !!env.AI_ALLOW_PRIVATE_BASE_URL };
  try {
    return { models: await listModels(config) };
  } catch (err) {
    if (err instanceof AiProviderError) throw new HttpError(424, err.message);
    throw err;
  }
}
