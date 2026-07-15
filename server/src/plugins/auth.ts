import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { env } from '../config/env.js';
import { prisma } from '../db/client.js';
import { HttpError } from '../util/httpError.js';
import { buildAuthProviders } from '../services/authProviders/registry.js';
import type { AuthProvider } from '../services/authProviders/types.js';

const DEV_USER = {
  oidcSub: 'dev-user',
  email: 'dev@localhost',
  displayName: 'Dev User',
  avatarColor: '#8b5cf6',
  avatarUrl: null,
};

declare module 'fastify' {
  interface FastifyInstance {
    authProviders: Map<string, AuthProvider>;
  }
  interface FastifyRequest {
    currentUserId: () => Promise<string | null>;
    requireAuth: () => Promise<string>;
  }
}

// DEV_FAKE_AUTH already bypasses all real access control, so the dev user is always admin too.
// Otherwise admin status is granted by email allowlist (ADMIN_EMAILS), re-checked on every login
// so it can be added/removed by editing .env without touching the database.
function computeIsAdmin(email: string): boolean {
  if (env.DEV_FAKE_AUTH) return true;
  const admins = env.ADMIN_EMAILS.split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return admins.includes(email.toLowerCase());
}

async function getOrCreateUser(profile: {
  oidcSub: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
}) {
  const isAdmin = computeIsAdmin(profile.email);
  return prisma.user.upsert({
    where: { oidcSub: profile.oidcSub },
    update: { email: profile.email, displayName: profile.displayName, avatarUrl: profile.avatarUrl, isAdmin },
    create: { ...profile, avatarColor: randomAvatarColor(), isAdmin },
  });
}

const AVATAR_COLORS = ['#E8734A', '#4A8FE8', '#6FBF73', '#B87DE8', '#E8C34A', '#4AE8D0'];
function randomAvatarColor() {
  return AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];
}

export default fp(async function authPlugin(app: FastifyInstance) {
  let authProviders = new Map<string, AuthProvider>();

  if (!env.DEV_FAKE_AUTH) {
    authProviders = await buildAuthProviders();
  } else {
    app.log.warn('DEV_FAKE_AUTH is enabled — every request will be authenticated as a hardcoded dev user. Do NOT use this in production.');
  }

  app.decorate('authProviders', authProviders);

  app.decorateRequest('currentUserId', async function (this: FastifyRequest) {
    if (env.DEV_FAKE_AUTH) {
      const devUser = await getOrCreateUser(DEV_USER);
      return devUser.id;
    }
    return this.session.userId ?? null;
  });

  app.decorateRequest('requireAuth', async function (this: FastifyRequest) {
    const userId = await this.currentUserId();
    if (!userId) {
      throw new HttpError(401, 'Not signed in');
    }
    return userId;
  });

  app.setErrorHandler((error: FastifyError, _request, reply: FastifyReply) => {
    const statusCode = (error as { statusCode?: number }).statusCode ?? 500;
    if (statusCode >= 500) app.log.error(error);
    reply.status(statusCode).send({ error: error.message });
  });
});

export { getOrCreateUser };
