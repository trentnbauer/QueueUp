import { AI_PROVIDERS, type AdminAiResponse, type AiProvider, type SetAdminAiRequest } from '@queueup/shared';
import { prisma } from '../../db/client.js';
import { HttpError } from '../../util/httpError.js';
import { clearConfigValue, getConfigSource, getConfigValue, setConfigValue, type ConfigKey } from '../configResolver.js';
import { clearLastFallback, fallbackToPublic, getLastFallback, mergeFallbacks, sealFallbacks, validateParts } from './aiFallbacks.js';
import { isServerPrimaryDisabled, readServerFallbacks, SERVER_FALLBACKS_KEY, SERVER_PRIMARY_DISABLED_KEY } from './aiConfig.js';
import { PROVIDER_DEFAULTS } from './providers.js';

/** The Administrator's AI screen: the server-wide first provider (any part of which may be pinned by
 * a Docker env var, and then isn't editable here) and its backups. */
async function getEnv() {
  return (await import('../../config/env.js')).env;
}

export async function describeAdminAi(): Promise<AdminAiResponse> {
  const env = await getEnv();
  const envFor = { AI_PROVIDER: env.AI_PROVIDER, AI_API_KEY: env.AI_API_KEY, AI_BASE_URL: env.AI_BASE_URL, AI_MODEL: env.AI_MODEL } as const;
  const keys = Object.keys(envFor) as (keyof typeof envFor)[];
  const [sources, values, fallbacks, disabled] = await Promise.all([
    Promise.all(keys.map((k) => getConfigSource(k, envFor[k]))),
    Promise.all(keys.map((k) => getConfigValue(k, envFor[k]))),
    readServerFallbacks(),
    isServerPrimaryDisabled(),
  ]);
  const src = Object.fromEntries(keys.map((k, i) => [k, sources[i]])) as AdminAiResponse['sources'];
  const val = Object.fromEntries(keys.map((k, i) => [k, values[i]]));
  const provider = (AI_PROVIDERS as readonly string[]).includes(val.AI_PROVIDER ?? '') ? (val.AI_PROVIDER as AiProvider) : null;
  return {
    provider,
    model: val.AI_MODEL ?? null,
    baseUrl: val.AI_BASE_URL ?? null,
    sources: src,
    disabled,
    fallbacks: fallbacks.map(fallbackToPublic),
    lastFallback: getLastFallback('server'),
    providers: [...AI_PROVIDERS],
  };
}

export async function saveAdminAi(actorId: string, input: SetAdminAiRequest): Promise<AdminAiResponse> {
  const env = await getEnv();
  const { provider, model, baseUrl } = validateParts(input, true);
  const defaults = PROVIDER_DEFAULTS[provider];
  const keyProvided = typeof input.apiKey === 'string' && input.apiKey.trim() !== '';
  if (input.apiKey !== undefined && input.apiKey !== null && typeof input.apiKey !== 'string') throw new HttpError(400, 'apiKey must be text');

  // Nothing is written until every part has been checked, so a bad backup doesn't half-save the rest.
  const existing = await readServerFallbacks();
  const fallbacks = input.fallbacks === undefined ? null : mergeFallbacks(existing, input.fallbacks, true);
  if (defaults.needsKey && !keyProvided && !env.AI_API_KEY && !(await getConfigValue('AI_API_KEY', undefined))) {
    throw new HttpError(400, 'An API key is required for this provider');
  }

  const parts: [ConfigKey, string | null, string | undefined][] = [
    ['AI_PROVIDER', provider, env.AI_PROVIDER],
    ['AI_MODEL', model, env.AI_MODEL],
    ['AI_BASE_URL', baseUrl, env.AI_BASE_URL],
  ];
  // The key is only touched when sent: omitted keeps it, '' or null removes it.
  if (input.apiKey !== undefined) parts.push(['AI_API_KEY', keyProvided ? (input.apiKey as string).trim() : null, env.AI_API_KEY]);
  for (const [key, value, fromEnv] of parts) {
    if (fromEnv) continue;
    if (value) await setConfigValue(key, value, actorId);
    else await clearConfigValue(key);
  }
  if (input.disabled !== undefined) {
    if (input.disabled === true) {
      await prisma.appSetting.upsert({
        where: { key: SERVER_PRIMARY_DISABLED_KEY },
        create: { key: SERVER_PRIMARY_DISABLED_KEY, value: 'true', updatedBy: actorId },
        update: { value: 'true', updatedBy: actorId },
      });
    } else {
      await prisma.appSetting.deleteMany({ where: { key: SERVER_PRIMARY_DISABLED_KEY } });
    }
  }
  if (fallbacks) {
    const sealed = sealFallbacks(fallbacks, env.SESSION_SECRET);
    if (sealed) {
      await prisma.appSetting.upsert({
        where: { key: SERVER_FALLBACKS_KEY },
        create: { key: SERVER_FALLBACKS_KEY, value: sealed, updatedBy: actorId },
        update: { value: sealed, updatedBy: actorId },
      });
    } else {
      await prisma.appSetting.deleteMany({ where: { key: SERVER_FALLBACKS_KEY } });
    }
  }
  clearLastFallback('server');
  return describeAdminAi();
}
