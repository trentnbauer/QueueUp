import type { FastifyInstance } from 'fastify';
import { Prisma } from '@prisma/client';
import { env } from '../config/env.js';
import { prisma } from '../db/client.js';
import { getOrCreateUser } from '../plugins/auth.js';
import { toUserDto } from '../util/dto.js';
import { HttpError } from '../util/httpError.js';
import { extractSteamId64, resolveSteamId64 } from '../services/steamLibrary.js';
import { setOwnedPlatforms } from '../services/userSettings.js';
import type { UpdateOwnedPlatformsRequest } from '@squadqueue/shared';

/** Attaches a verified Steam identity to an already-signed-in user's account (User.steamId64),
 * rather than creating/upserting a user by oidcSub like a normal login. Returns the URL to
 * redirect the browser to, encoding success/failure as a query param since this runs at the tail
 * of a full-page redirect flow with no other channel back to the UI. */
async function linkSteamAccount(targetUserId: string, provider: string, oidcSub: string): Promise<string> {
  if (provider !== 'steam') {
    return `${env.APP_BASE_URL}/?steamLinkError=${encodeURIComponent('Only a Steam account can be linked.')}`;
  }
  const steamId64 = extractSteamId64(oidcSub);
  if (!steamId64) {
    return `${env.APP_BASE_URL}/?steamLinkError=${encodeURIComponent('Steam did not return a valid account.')}`;
  }

  // oidcSub is the primary-sign-in identity column - if this exact Steam account is already
  // someone's primary sign-in (a different user), it can't also be linked as a secondary identity
  // here, since resolveSteamId64() would then find two different SquadQueue users claiming the
  // same Steam account.
  const primaryOwner = await prisma.user.findUnique({ where: { oidcSub } });
  if (primaryOwner && primaryOwner.id !== targetUserId) {
    return `${env.APP_BASE_URL}/?steamLinkError=${encodeURIComponent('That Steam account already signs in to a different SquadQueue account.')}`;
  }

  try {
    await prisma.user.update({ where: { id: targetUserId }, data: { steamId64 } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return `${env.APP_BASE_URL}/?steamLinkError=${encodeURIComponent('That Steam account is already linked to another SquadQueue account.')}`;
    }
    throw err;
  }
  return `${env.APP_BASE_URL}/?steamLinked=1`;
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

  // Lets an already-signed-in user (any provider) attach a Steam account without switching their
  // sign-in identity - e.g. a Discord user wants Steam library import, which needs a Steam ID on
  // file. Reuses the normal Steam OpenID handshake; only what happens after verification differs
  // (see the linkTargetUserId branch in the callback below) - regular login is untouched.
  app.get('/auth/steam/link', authRateLimit, async (request, reply) => {
    if (env.DEV_FAKE_AUTH) {
      return reply.redirect(env.APP_BASE_URL);
    }

    const userId = await request.requireAuth();
    const provider = app.authProviders.get('steam');
    if (!provider) {
      throw new HttpError(404, 'Steam sign-in is not configured on this server.');
    }

    request.session.linkTargetUserId = userId;
    const authUrl = await provider.buildAuthUrl(request);
    return reply.redirect(authUrl);
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
      return reply.redirect(await linkSteamAccount(linkTargetUserId, request.params.provider, profile.oidcSub));
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

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return reply.send({ user: null });

    return reply.send({
      user: toUserDto(user),
      steamLinked: resolveSteamId64(user) !== null,
      ownedPlatforms: user.ownedPlatforms,
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
