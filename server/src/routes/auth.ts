import type { FastifyInstance } from 'fastify';
import { Prisma } from '@prisma/client';
import { env } from '../config/env.js';
import { prisma } from '../db/client.js';
import { getOrCreateUser, primaryProviderOf } from '../plugins/auth.js';
import { toUserDto } from '../util/dto.js';
import { HttpError } from '../util/httpError.js';
import { extractSteamId64, resolveSteamId64 } from '../services/steamLibrary.js';
import { setOwnedPlatforms } from '../services/userSettings.js';
import type { OAuthProfile } from '../services/authProviders/types.js';
import type { UpdateOwnedPlatformsRequest } from '@queueup/shared';

/** Attaches a verified secondary identity to an already-signed-in user's account, rather than
 * creating/upserting a user by oidcSub like a normal login (see getOrCreateUser). Steam is the one
 * exception - it still writes User.steamId64 as it always has (see that field's comment); every
 * other provider gets a LinkedIdentity row. Returns the URL to redirect the browser to, encoding
 * success/failure as a query param since this runs at the tail of a full-page redirect flow with
 * no other channel back to the UI. */
async function linkAccount(targetUserId: string, provider: string, profile: OAuthProfile): Promise<string> {
  if (provider === 'steam') {
    const steamId64 = extractSteamId64(profile.oidcSub);
    if (!steamId64) {
      return `${env.APP_BASE_URL}/?accountLinkError=${encodeURIComponent('Steam did not return a valid account.')}`;
    }

    // oidcSub is the primary-sign-in identity column - if this exact Steam account is already
    // someone's primary sign-in (a different user), it can't also be linked as a secondary identity
    // here, since resolveSteamId64() would then find two different QueueUp users claiming the
    // same Steam account.
    const primaryOwner = await prisma.user.findUnique({ where: { oidcSub: profile.oidcSub } });
    if (primaryOwner && primaryOwner.id !== targetUserId) {
      return `${env.APP_BASE_URL}/?accountLinkError=${encodeURIComponent('That Steam account already signs in to a different QueueUp account.')}`;
    }

    try {
      await prisma.user.update({ where: { id: targetUserId }, data: { steamId64 } });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        return `${env.APP_BASE_URL}/?accountLinkError=${encodeURIComponent('That Steam account is already linked to another QueueUp account.')}`;
      }
      throw err;
    }
    return `${env.APP_BASE_URL}/?accountLinked=steam`;
  }

  // Same "already someone else's primary sign-in" guard as Steam above, generalized - the
  // LinkedIdentity table's own unique(oidcSub) constraint (caught as P2002 below) only protects
  // against colliding with another *linked* identity, not with someone's primary User.oidcSub.
  const primaryOwner = await prisma.user.findUnique({ where: { oidcSub: profile.oidcSub } });
  if (primaryOwner && primaryOwner.id !== targetUserId) {
    return `${env.APP_BASE_URL}/?accountLinkError=${encodeURIComponent(`That ${provider} account already signs in to a different QueueUp account.`)}`;
  }

  try {
    // Upsert rather than create so relinking the same provider (e.g. switching which Google
    // account is linked) replaces the existing row instead of failing on the (userId, provider)
    // unique constraint.
    await prisma.linkedIdentity.upsert({
      where: { userId_provider: { userId: targetUserId, provider } },
      update: { oidcSub: profile.oidcSub },
      create: { userId: targetUserId, provider, oidcSub: profile.oidcSub },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return `${env.APP_BASE_URL}/?accountLinkError=${encodeURIComponent(`That ${provider} account is already linked to another QueueUp account.`)}`;
    }
    throw err;
  }
  return `${env.APP_BASE_URL}/?accountLinked=${provider}`;
}

/** Removes a linked (non-primary) identity from a user's account. Always refuses to remove the
 * provider baked into User.oidcSub - every account has that one identity by construction (see
 * primaryProviderOf), so protecting it is what guarantees a user can never unlink their way down
 * to zero sign-in methods. */
async function unlinkAccount(userId: string, provider: string): Promise<void> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (provider === primaryProviderOf(user.oidcSub)) {
    throw new HttpError(400, `Can't unlink your primary sign-in method (${provider}).`);
  }

  if (provider === 'steam') {
    await prisma.user.update({ where: { id: userId }, data: { steamId64: null } });
    return;
  }

  await prisma.linkedIdentity.deleteMany({ where: { userId, provider } });
}

export default async function authRoutes(app: FastifyInstance) {
  app.get('/api/auth/providers', async () => {
    if (env.DEV_FAKE_AUTH) return { providers: [] };
    return { providers: Array.from(app.authProviders.keys()) };
  });

  // Login/callback get a tighter limit than the global default - these are the endpoints an
  // attacker would actually hammer to brute-force or abuse a sign-in flow.
  const authRateLimit = { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } };

  app.get<{ Params: { provider: string } }>('/auth/:provider/login', authRateLimit, async (request, reply) => {
    if (env.DEV_FAKE_AUTH) {
      return reply.redirect(env.APP_BASE_URL);
    }

    const provider = app.authProviders.get(request.params.provider);
    if (!provider) {
      throw new HttpError(404, `Unknown sign-in method "${request.params.provider}"`);
    }

    const authUrl = await provider.buildAuthUrl(request);
    return reply.redirect(authUrl);
  });

  // Lets an already-signed-in user attach another provider's account without switching their
  // primary sign-in identity - e.g. to add a second way to log in, or (Steam specifically) because
  // Steam library import needs a Steam ID on file. Reuses that provider's normal OAuth/OpenID
  // handshake; only what happens after verification differs (see the linkTargetUserId branch in
  // the callback below) - regular login is untouched.
  app.get<{ Params: { provider: string } }>('/auth/:provider/link', authRateLimit, async (request, reply) => {
    if (env.DEV_FAKE_AUTH) {
      return reply.redirect(env.APP_BASE_URL);
    }

    const userId = await request.requireAuth();
    const provider = app.authProviders.get(request.params.provider);
    if (!provider) {
      throw new HttpError(404, `Unknown sign-in method "${request.params.provider}"`);
    }

    request.session.linkTargetUserId = userId;
    const authUrl = await provider.buildAuthUrl(request);
    return reply.redirect(authUrl);
  });

  app.delete<{ Params: { provider: string } }>('/auth/:provider/unlink', authRateLimit, async (request, reply) => {
    const userId = await request.requireAuth();
    await unlinkAccount(userId, request.params.provider);
    return reply.send({ ok: true });
  });

  app.get<{ Params: { provider: string } }>('/auth/:provider/callback', authRateLimit, async (request, reply) => {
    if (env.DEV_FAKE_AUTH) {
      return reply.redirect(env.APP_BASE_URL);
    }

    const provider = app.authProviders.get(request.params.provider);
    if (!provider) {
      throw new HttpError(404, `Unknown sign-in method "${request.params.provider}"`);
    }

    const profile = await provider.handleCallback(request);

    const linkTargetUserId = request.session.linkTargetUserId;
    if (linkTargetUserId) {
      delete request.session.linkTargetUserId;
      return reply.redirect(await linkAccount(linkTargetUserId, request.params.provider, profile));
    }

    const user = await getOrCreateUser(profile);

    // Regenerate the session ID on successful login (issues a fresh cookie) so a pre-auth session
    // ID can never carry over into an authenticated one.
    await request.session.regenerate();
    request.session.userId = user.id;
    delete request.session.authCodeVerifier;
    delete request.session.authState;

    return reply.redirect(env.APP_BASE_URL);
  });

  app.get('/auth/logout', async (request, reply) => {
    await request.session.destroy();
    return reply.redirect(env.APP_BASE_URL);
  });

  app.get('/api/me', async (request, reply) => {
    const userId = await request.currentUserId();
    if (!userId) return reply.send({ user: null });

    const user = await prisma.user.findUnique({ where: { id: userId }, include: { linkedIdentities: true } });
    if (!user) return reply.send({ user: null });

    const primaryProvider = primaryProviderOf(user.oidcSub);
    // Steam is folded in here even though it isn't a LinkedIdentity row (see linkAccount above) -
    // from the frontend's perspective it's just another linked provider like any other.
    const linkedProviders = [
      primaryProvider,
      ...(user.steamId64 && primaryProvider !== 'steam' ? ['steam'] : []),
      ...user.linkedIdentities.map((identity) => identity.provider),
    ];

    return reply.send({
      user: toUserDto(user),
      steamLinked: resolveSteamId64(user) !== null,
      ownedPlatforms: user.ownedPlatforms,
      primaryProvider,
      linkedProviders,
    });
  });

  // A per-user preference, not tied to any room - scopes the Personal Shelf's add-game flow the
  // same way a Room's platform scopes it there. Empty array means "no opt-in yet", i.e. show
  // everything, so existing users see no change in behavior until they tick something.
  app.patch<{ Body: UpdateOwnedPlatformsRequest }>('/api/me/owned-platforms', async (request, reply) => {
    const userId = await request.requireAuth();
    const ownedPlatforms = await setOwnedPlatforms(userId, request.body?.platforms);
    return reply.send({ ownedPlatforms });
  });
}
