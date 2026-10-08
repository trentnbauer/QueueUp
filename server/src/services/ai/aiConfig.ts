import { AI_PROVIDERS, type AiFallbackNotice, type AiProvider, type AiSettingsResponse, type AiSettingsSource, type SetUserAiSettingsRequest, type UserAiSettings } from '@queueup/shared';
import { prisma } from '../../db/client.js';
import { HttpError } from '../../util/httpError.js';
import { getConfigValue } from '../configResolver.js';
import { decryptSetting, encryptSetting } from '../settingsCrypto.js';
import {
  clearLastFallback,
  fallbackToPublic,
  getLastFallback,
  mergeFallbacks,
  normalizeBaseUrl,
  openFallbacks,
  recordFallback,
  sealFallbacks,
  validateParts,
  type StoredFallback,
} from './aiFallbacks.js';
import { AiProviderError, callProvider, PROVIDER_DEFAULTS, type AiConfig, type AiRequest, type AiResponse } from './providers.js';
import { chargeServerAiUse, type AiCharge } from './aiQuota.js';
import { recordServerAiUsage } from './aiServerUsage.js';
import { assertPublicTarget } from './aiNetworkGuard.js';
import { runAiJob } from './aiJobs.js';
import { coolDownSeconds, coolingReason, cooldownKey, endCooldown, startCooldown } from './aiCooldown.js';
import { unlockBadgeQuietly } from '../badges.js';

/** Works out which AI settings a call uses and makes the call. A person's own settings win, when the
 * server allows them; otherwise the server-wide ones (env, or Administrator settings as the
 * fallback) apply; with neither, AI is simply off. API keys are encrypted at rest with a key derived
 * from SESSION_SECRET (see settingsCrypto.ts) and only ever decrypted here, in memory, for a call.
 * Loaded lazily so this module stays importable without a parsed env (its unit tests). */
async function getEnv() {
  return (await import('../../config/env.js')).env;
}

const isProvider = (v: unknown): v is AiProvider => typeof v === 'string' && (AI_PROVIDERS as readonly string[]).includes(v);

export { normalizeBaseUrl };

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

/** The provider a person's own call would try first, or null when they have none, can't use them,
 * everything is switched off, or the settings are unusable. */
export async function getUserAiConfig(userId: string): Promise<AiConfig | null> {
  return (await getUserAiChain(userId))[0] ?? null;
}

/** Backups saved in Administrator settings. Not an env var: they're only ever set from the settings screen. */
export const SERVER_FALLBACKS_KEY = 'AI_FALLBACKS';

export async function readServerFallbacks(): Promise<StoredFallback[]> {
  const row = await prisma.appSetting.findUnique({ where: { key: SERVER_FALLBACKS_KEY } });
  return row?.value ? openFallbacks(row.value, (await getEnv()).SESSION_SECRET) : [];
}

/** `userSupplied` marks a person's own backups: any that use a custom address (or a provider that
 * needs one) are flagged so each request is checked against the server's network. The operator's own
 * backups (Administrator settings) are trusted and left unflagged. */
const fallbackConfigs = (list: StoredFallback[], allowCustomUrl: boolean, userSupplied = false, includeDisabled = false): AiConfig[] =>
  list
    .filter((e) => includeDisabled || !e.disabled)
    .filter((e) => allowCustomUrl || (!e.baseUrl && e.provider !== 'ollama' && e.provider !== 'openai_compatible'))
    .map((e) => {
      const config = buildConfig(e.provider, e);
      const custom = !!e.baseUrl || e.provider === 'ollama' || e.provider === 'openai_compatible';
      return config && userSupplied && custom ? { ...config, userSupplied: true } : config;
    })
    .filter((c): c is AiConfig => c !== null);

/** Whether the server's first provider is switched off (kept saved, not used). Not an env var: the
 * switch is only ever set from the settings screen, so it works even when the provider itself is set by Docker. */
export const SERVER_PRIMARY_DISABLED_KEY = 'AI_PRIMARY_DISABLED';

export async function isServerPrimaryDisabled(): Promise<boolean> {
  const row = await prisma.appSetting.findUnique({ where: { key: SERVER_PRIMARY_DISABLED_KEY } });
  return row?.value === 'true';
}

/** The server's first provider, then its backups in order, leaving out anything switched off (unless
 * `includeDisabled`, which keeps positions matching the settings list). */
export async function getServerAiChain(opts: { includeDisabled?: boolean } = {}): Promise<AiConfig[]> {
  const [first, backups, off] = await Promise.all([getServerAiConfig(), readServerFallbacks(), isServerPrimaryDisabled()]);
  return [...(first && (opts.includeDisabled || !off) ? [first] : []), ...fallbackConfigs(backups, true, false, !!opts.includeDisabled)];
}

/** The person's first provider, then their backups in order, leaving out anything switched off
 * (unless `includeDisabled`). Empty when they have nothing usable, can't use their own settings, or
 * their first provider is unusable. */
export async function getUserAiChain(userId: string, opts: { includeDisabled?: boolean } = {}): Promise<AiConfig[]> {
  const env = await getEnv();
  if (!env.AI_ALLOW_USER_SETTINGS) return [];
  const row = await prisma.userAiSettings.findUnique({ where: { userId } });
  if (!row || !isProvider(row.provider)) return [];
  // A saved custom address only counts while the server still allows one.
  const usesCustomUrl = !!row.baseUrl || PROVIDER_DEFAULTS[row.provider].baseUrl === null || row.provider === 'ollama';
  if (usesCustomUrl && !env.AI_ALLOW_USER_BASE_URL) return [];
  const built = buildConfig(row.provider, { model: row.model, baseUrl: row.baseUrl, apiKey: await readUserKey(userId, row.apiKeyEncrypted) });
  if (!built) return [];
  const first = usesCustomUrl ? { ...built, userSupplied: true } : built;
  const backups = openFallbacks(row.fallbacksEncrypted, env.SESSION_SECRET);
  return [...(opts.includeDisabled || !row.disabled ? [first] : []), ...fallbackConfigs(backups, env.AI_ALLOW_USER_BASE_URL, true, !!opts.includeDisabled)];
}

/** The settings of the member sponsoring this room's AI (see roomAi.ts), or null when there is no
 * sponsor, they've left the room, or their own settings are no longer usable. Only the sponsor's
 * personal settings are read, by reference - nothing is copied onto the room. */
async function getRoomSponsorId(roomId: string): Promise<string | null> {
  const room = await prisma.room.findUnique({ where: { id: roomId }, select: { aiKeyOwnerId: true } });
  if (!room?.aiKeyOwnerId) return null;
  // A sponsor who has left (or been removed) stops funding the room straight away.
  const stillMember = await prisma.roomMember.findUnique({
    where: { roomId_userId: { roomId, userId: room.aiKeyOwnerId } },
    select: { userId: true },
  });
  return stillMember ? room.aiKeyOwnerId : null;
}

export async function getRoomSponsorAiConfig(roomId: string): Promise<AiConfig | null> {
  const sponsorId = await getRoomSponsorId(roomId);
  return sponsorId ? getUserAiConfig(sponsorId) : null;
}

/** What a call uses: the person's own settings, else (when the call is for a room) the room
 * sponsor's, else the server's, else null. A call with no person and no room (a background job)
 * only ever uses the server's. */
export async function resolveAiConfig(
  userId?: string,
  roomId?: string,
): Promise<{ config: AiConfig; source: Exclude<AiSettingsSource, 'none'> } | null> {
  if (userId) {
    const own = await getUserAiConfig(userId);
    if (own) return { config: own, source: 'user' };
  }
  if (roomId) {
    const sponsored = await getRoomSponsorAiConfig(roomId);
    if (sponsored) return { config: sponsored, source: 'room' };
  }
  const server = (await getServerAiChain())[0];
  return server ? { config: server, source: 'server' } : null;
}

/** The providers a call would try, in order, with where they came from and whose warning slot they use. */
export async function resolveAiChain(
  userId?: string,
  roomId?: string,
): Promise<{ configs: AiConfig[]; source: Exclude<AiSettingsSource, 'none'>; owner: string } | null> {
  // The server's own AI always sits at the very end, as the last resort when everything the person
  // (or the room's sponsor) set up has failed.
  const server = await getServerAiChain();
  const lastResort = server.map((c) => ({ ...c, viaServer: true }));
  if (userId) {
    const own = await getUserAiChain(userId);
    if (own.length) return { configs: [...own, ...lastResort], source: 'user', owner: `user:${userId}` };
  }
  if (roomId) {
    const sponsorId = await getRoomSponsorId(roomId);
    const sponsored = sponsorId ? await getUserAiChain(sponsorId) : [];
    if (sponsorId && sponsored.length) return { configs: [...sponsored, ...lastResort], source: 'room', owner: `user:${sponsorId}` };
  }
  return server.length ? { configs: server, source: 'server', owner: 'server' } : null;
}

/** Tries each provider in turn until one answers. When the first one failed and a backup answered,
 * that's remembered (and logged) as a warning for the settings screen; when the first one is back
 * to working, the warning clears. Throws a 424 saying which provider failed and why when every
 * provider failed. */
async function runChain(
  configs: AiConfig[],
  owner: string,
  req: AiRequest,
  /** Who to count a use of the server's AI against, when it is reached as a last resort. */
  chargeUserId?: string,
  /** Who to add the server AI's answered calls to, for the monthly use in Administrator settings.
   * `wholeChain` says every entry is the server's own AI (not just a last resort). */
  usage?: { userId: string; wholeChain: boolean },
): Promise<AiResponse & { fallback: AiFallbackNotice | null }> {
  let firstFailure: { config: AiConfig; message: string } | null = null;
  const failures: string[] = [];
  const allowPrivate = (await getEnv()).AI_ALLOW_PRIVATE_BASE_URL;
  // A provider that recently failed in a way that will not fix itself (no credit, a bad key) is skipped for a
  // few minutes (#1043) - unless every provider is in that state, or there is only one (the Test button), in
  // which case it is tried anyway.
  const keys = configs.map((c) => cooldownKey(c));
  const reasons = keys.map((k) => coolingReason(k));
  const skipCooling = reasons.some((r) => r === null);
  for (const [i, base] of configs.entries()) {
    const cooled = skipCooling ? reasons[i] : null;
    if (cooled) {
      const minutes = Math.max(1, Math.ceil(cooled.secondsLeft / 60));
      failures.push(`${base.provider} (${base.model}): skipped for about ${minutes} more minute${minutes === 1 ? '' : 's'} after: ${cooled.message}`);
      firstFailure ??= { config: base, message: cooled.message };
      continue;
    }
    // A person-supplied address must not point inside the server's own network unless the operator
    // allows it (a LAN or Docker-host Ollama). Resolved fresh for every request, so a name that is
    // later re-pointed inward is caught. Where private addresses are allowed, the provider's error
    // text is withheld instead, so a person can't read internal services through a failure message.
    const config: AiConfig = base.userSupplied && allowPrivate ? { ...base, hideErrorBody: true } : base;
    try {
      if (config.userSupplied && !allowPrivate) {
        try {
          await assertPublicTarget(config.baseUrl);
        } catch (err) {
          throw new AiProviderError(err instanceof Error ? err.message : 'That AI address is not allowed', null);
        }
      }
      // Reaching the server's AI as a last resort costs the operator, so it counts against the
      // person's daily allowance like any other use of it (and is given back if it fails too).
      let charge: AiCharge | null = null;
      if (config.viaServer && chargeUserId) {
        try {
          charge = await chargeServerAiUse(chargeUserId);
        } catch (err) {
          if (!(err instanceof HttpError)) throw err;
          failures.push(`Server AI: ${err.message}`);
          firstFailure ??= { config, message: err.message };
          continue;
        }
      }
      let res: AiResponse;
      try {
        res = await callProvider(config, req);
      } catch (err) {
        await charge?.refund();
        throw err;
      }
      endCooldown(keys[i]);
      if (usage && (usage.wholeChain || config.viaServer)) await recordServerAiUsage(usage.userId, res.usage);
      if (!firstFailure) {
        clearLastFallback(owner);
        return { ...res, fallback: null };
      }
      const fallback: AiFallbackNotice = {
        at: new Date().toISOString(),
        failedProvider: firstFailure.config.provider,
        failedModel: firstFailure.config.model,
        error: firstFailure.message,
        usedProvider: config.provider,
        usedModel: config.model,
      };
      recordFallback(owner, fallback);
      console.warn(`AI provider ${fallback.failedProvider} (${fallback.failedModel}) failed for ${owner}: ${fallback.error}. Used ${fallback.usedProvider} (${fallback.usedModel}) instead.`);
      return { ...res, fallback };
    } catch (err) {
      if (!(err instanceof AiProviderError)) throw err;
      const wait = coolDownSeconds(err);
      if (wait !== null) startCooldown(keys[i], wait, err.message);
      failures.push(`${config.provider} (${config.model}): ${err.message}`);
      firstFailure ??= { config, message: err.message };
    }
  }
  // 424, not 502: it is the AI provider that failed, not this server's own upstream, and a 5xx
  // body is often replaced by a reverse proxy's error page, which hid the reason from the person
  // pressing Test. Every provider is named with what it said (never including a key).
  throw new HttpError(424, configs.length > 1 ? `All ${configs.length} AI providers failed. ${failures.join(' | ')}` : `The AI provider failed. ${failures[0]}`);
}

/** Makes an AI call with the right settings. This is the one entry point features should use; pass
 * `roomId` when the call is on behalf of a room so its sponsor's settings can apply. The caller is
 * responsible for having checked the person may act in that room. Throws a 400 when no AI is set
 * up, and a 502 when the provider fails (the message says why, never including the key). When the
 * settings name backups, a failing provider falls through to the next one; `fallback` says so. */
export async function aiComplete(
  req: AiRequest,
  opts: { userId?: string; roomId?: string; /** What kind of request this is, for the activity list shown to the person. */ label?: string } = {},
): Promise<AiResponse & { source: AiSettingsSource; fallback: AiFallbackNotice | null }> {
  const resolved = await resolveAiChain(opts.userId, opts.roomId);
  if (!resolved) throw new HttpError(400, 'AI is not set up. Add a provider in your account settings, or ask the server admin to set one.');
  // Only the operator's own key is rationed; a person's or a sponsor's key costs the server nothing.
  const charge = resolved.source === 'server' && opts.userId ? await chargeServerAiUse(opts.userId) : null;
  try {
    const res = await runAiJob(opts.userId, opts.label ?? 'ai', () => runChain(
        resolved.configs,
        resolved.owner,
        req,
        resolved.source === 'server' ? undefined : opts.userId,
        opts.userId ? { userId: opts.userId, wholeChain: resolved.source === 'server' } : undefined,
      ),
    );
    if (opts.userId) unlockBadgeQuietly(opts.userId, 'first_ai_used');
    return { ...res, source: resolved.source };
  } catch (err) {
    // The provider failing is not the person's doing - give the use back.
    await charge?.refund();
    throw err;
  }
}

/** What is saved for one entry of the settings list (0 is the first, then the backups), even when it
 * can't be used yet because no model has been chosen. Read from storage, never from a request. */
export interface EntryParts {
  provider: AiProvider;
  model: string | null;
  baseUrl: string | null;
  apiKey: string | null;
  /** The address was entered by a person (their own settings), so it is subject to the address rules. */
  userSupplied: boolean;
}

export async function getEntryParts(scope: { userId: string } | 'server', index: number): Promise<EntryParts | null> {
  if (!Number.isInteger(index) || index < 0) return null;
  const env = await getEnv();
  if (scope === 'server') {
    if (index === 0) {
      const provider = await getConfigValue('AI_PROVIDER', env.AI_PROVIDER);
      if (!isProvider(provider)) return null;
      const [model, baseUrl, apiKey] = await Promise.all([
        getConfigValue('AI_MODEL', env.AI_MODEL),
        getConfigValue('AI_BASE_URL', env.AI_BASE_URL),
        getConfigValue('AI_API_KEY', env.AI_API_KEY),
      ]);
      return { provider, model: model ?? null, baseUrl: baseUrl ?? null, apiKey: apiKey ?? null, userSupplied: false };
    }
    const e = (await readServerFallbacks())[index - 1];
    return e ? { provider: e.provider, model: e.model, baseUrl: e.baseUrl, apiKey: e.apiKey, userSupplied: false } : null;
  }
  if (!env.AI_ALLOW_USER_SETTINGS) return null;
  const row = await prisma.userAiSettings.findUnique({ where: { userId: scope.userId } });
  if (!row || !isProvider(row.provider)) return null;
  const custom = (provider: AiProvider, baseUrl: string | null) => !!baseUrl || PROVIDER_DEFAULTS[provider].baseUrl === null || provider === 'ollama';
  if (index === 0) {
    return { provider: row.provider, model: row.model, baseUrl: row.baseUrl, apiKey: await readUserKey(scope.userId, row.apiKeyEncrypted), userSupplied: custom(row.provider, row.baseUrl) };
  }
  const e = openFallbacks(row.fallbacksEncrypted, env.SESSION_SECRET)[index - 1];
  return e ? { provider: e.provider, model: e.model, baseUrl: e.baseUrl, apiKey: e.apiKey, userSupplied: custom(e.provider, e.baseUrl) } : null;
}

/** Tests one saved provider on its own (its position in the settings list: 0 is the first, then the
 * backups), with no falling through to the others, so a broken entry shows up as broken even when a
 * later one would have covered for it. Uses the saved settings, not unsaved edits. */
export async function aiCompleteEntry(
  scope: { userId: string } | 'server',
  index: number,
  req: AiRequest,
): Promise<AiResponse & { fallback: AiFallbackNotice | null }> {
  // Read by position from what is saved (a switched-off or half-finished entry counts too), so the
  // position always matches the settings list.
  const parts = await getEntryParts(scope, index);
  if (!parts) throw new HttpError(404, 'That provider is not saved yet. Save your changes, then test it.');
  const built = buildConfig(parts.provider, parts);
  if (!built) {
    throw new HttpError(
      400,
      !(parts.model || PROVIDER_DEFAULTS[parts.provider].model) ? 'Choose a model for this provider first (use Load models), then save.' : 'This provider is missing its address or API key. Fill it in and save.',
    );
  }
  const env = await getEnv();
  if (scope !== 'server' && parts.userSupplied && !env.AI_ALLOW_USER_BASE_URL) throw new HttpError(403, 'This server does not allow a custom AI address in personal settings');
  const config: AiConfig = parts.userSupplied ? { ...built, userSupplied: true } : built;
  // A throwaway owner, so a test never touches the "first provider failed" notice a real call leaves.
  return runAiJob(scope === 'server' ? undefined : scope.userId, 'test', () => runChain([config], 'entry-test', req));
}

/** Same as aiComplete but for the server-wide settings only (the Administrator's "test" button). */
export async function aiCompleteWithServer(req: AiRequest): Promise<AiResponse & { fallback: AiFallbackNotice | null }> {
  const configs = await getServerAiChain();
  if (!configs.length) throw new HttpError(400, 'No server-wide AI provider is set up. Set a provider and model first.');
  return runChain(configs, 'server', req);
}

function toUserSettings(
  row: { provider: string; model: string | null; baseUrl: string | null; apiKeyEncrypted: string | null; fallbacksEncrypted?: string | null; disabled?: boolean },
  secret: string,
): UserAiSettings | null {
  if (!isProvider(row.provider)) return null;
  const fallbacks = openFallbacks(row.fallbacksEncrypted, secret).map(fallbackToPublic);
  return { provider: row.provider, model: row.model, baseUrl: row.baseUrl, hasApiKey: !!row.apiKeyEncrypted, disabled: !!row.disabled, fallbacks };
}

/** Everything the settings screen needs: the person's own settings, the server's (without a key),
 * and which of them a call would use. */
export async function describeAiSettings(userId: string): Promise<AiSettingsResponse> {
  const env = await getEnv();
  const [row, serverChain, resolved] = await Promise.all([
    prisma.userAiSettings.findUnique({ where: { userId } }),
    getServerAiChain(),
    resolveAiConfig(userId),
  ]);
  const server = serverChain[0];
  return {
    user: row ? toUserSettings(row, env.SESSION_SECRET) : null,
    server: server ? { provider: server.provider, model: server.model, baseUrl: server.baseUrl } : null,
    lastFallback: getLastFallback(`user:${userId}`),
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
  const { provider, model, baseUrl } = validateParts(input, env.AI_ALLOW_USER_BASE_URL);
  const defaults = PROVIDER_DEFAULTS[provider];

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

  // Backups left out stay as saved; a list (even an empty one) replaces them.
  const fallbacksEncrypted =
    input.fallbacks === undefined
      ? (existing?.fallbacksEncrypted ?? null)
      : sealFallbacks(mergeFallbacks(openFallbacks(existing?.fallbacksEncrypted, env.SESSION_SECRET), input.fallbacks, env.AI_ALLOW_USER_BASE_URL), env.SESSION_SECRET);

  const row = await prisma.userAiSettings.upsert({
    where: { userId },
    create: { userId, provider, model, baseUrl, apiKeyEncrypted, fallbacksEncrypted, disabled: input.disabled === true },
    update: { provider, model, baseUrl, apiKeyEncrypted, fallbacksEncrypted, ...(input.disabled !== undefined ? { disabled: input.disabled === true } : {}) },
  });
  clearLastFallback(`user:${userId}`);
  return toUserSettings(row, env.SESSION_SECRET)!;
}

export async function clearUserAiSettings(userId: string): Promise<void> {
  await prisma.userAiSettings.deleteMany({ where: { userId } });
  clearLastFallback(`user:${userId}`);
  // Rooms this person was sponsoring have nothing left to point at.
  await prisma.room.updateMany({ where: { aiKeyOwnerId: userId }, data: { aiKeyOwnerId: null } });
}
