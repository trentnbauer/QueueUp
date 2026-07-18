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

// Steam and Discord (when a user denies the email scope) have no real email, so those providers
// synthesize a placeholder under one of these domains (see steamProvider.ts, discordProvider.ts).
// Such an address must never be treated as a verified identity for admin-matching purposes - it's
// not exploitable today (it can't collide with a real admin's email), but this guards against that
// changing if ADMIN_EMAILS matching is ever extended (e.g. wildcard/domain rules).
const SYNTHETIC_EMAIL_DOMAINS = ['steamcommunity.unknown', 'discord.unknown'];

function isSyntheticEmail(email: string): boolean {
  const domain = email.toLowerCase().split('@')[1];
  return !!domain && SYNTHETIC_EMAIL_DOMAINS.includes(domain);
}

// DEV_FAKE_AUTH already bypasses all real access control, so the dev user is always admin too.
// Otherwise admin status is granted by email allowlist (ADMIN_EMAILS), re-checked on every login -
// note this only ever *grants*, never revokes (see getOrCreateUser below): removing an email from
// ADMIN_EMAILS stops it granting admin on future logins, but does not strip admin from an account
// that already has it (whether granted this way or via the Settings panel's promote/demote). Use
// the Settings panel, or a direct DB edit, to actually revoke an existing admin.
function computeIsAdmin(email: string, opts: { devFakeAuth: boolean; adminEmails: string }): boolean {
  if (opts.devFakeAuth) return true;
  if (isSyntheticEmail(email)) return false;
  const admins = opts.adminEmails
    .split(',')
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
  const emailIsAdmin = computeIsAdmin(profile.email, { devFakeAuth: env.DEV_FAKE_AUTH, adminEmails: env.ADMIN_EMAILS });
  // ADMIN_EMAILS grants admin on every login, but must never revoke it - an admin promoted through
  // the Settings panel (see admin.ts's PATCH /api/admin/users/:id/admin) has no email in that list
  // by definition, and would otherwise lose admin status the next time they signed in.
  const existing = await prisma.user.findUnique({ where: { oidcSub: profile.oidcSub } });
  const isAdmin = emailIsAdmin || (existing?.isAdmin ?? false);
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

export { getOrCreateUser, computeIsAdmin };
