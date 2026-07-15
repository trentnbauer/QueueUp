import type { FastifyInstance } from 'fastify';
import { env } from '../config/env.js';
import { prisma } from '../db/client.js';
import { getOrCreateUser } from '../plugins/auth.js';
import { toUserDto } from '../util/dto.js';
import { HttpError } from '../util/httpError.js';
import { extractSteamId64 } from '../services/steamLibrary.js';

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

  app.get<{ Params: { provider: string } }>('/auth/:provider/callback', authRateLimit, async (request, reply) => {
    if (env.DEV_FAKE_AUTH) {
      return reply.redirect(env.APP_BASE_URL);
    }

    const provider = app.authProviders.get(request.params.provider);
    if (!provider) {
      throw new HttpError(404, `Unknown sign-in method "${request.params.provider}"`);
    }

    const profile = await provider.handleCallback(request);
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

    return reply.send({ user: toUserDto(user), steamLinked: extractSteamId64(user.oidcSub) !== null });
  });
}
