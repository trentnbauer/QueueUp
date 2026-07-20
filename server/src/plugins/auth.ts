import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { env } from '../config/env.js';
import { prisma } from '../db/client.js';
import { HttpError } from '../util/httpError.js';
import { buildAuthProviders } from '../services/authProviders/registry.js';
import type { AuthProvider } from '../services/authProviders/types.js';
import { extractSteamId64 } from '../services/steamLibrary.js';

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

/** A signed-in identity can match a user three ways: it's their primary sign-in (User.oidcSub),
 * it's a provider they linked afterward (LinkedIdentity), or - Steam only - it's a Steam account
 * linked via the pre-existing User.steamId64 column (see that field's comment; linkAccount in
 * auth.ts routes still writes Steam links there instead of LinkedIdentity). Checked in that order
 * since the first two are exact-match lookups and this one needs the extra extraction step. */
async function findUserByOidcSub(oidcSub: string) {
  const primary = await prisma.user.findUnique({ where: { oidcSub } });
  if (primary) return primary;

  const linked = await prisma.linkedIdentity.findUnique({ where: { oidcSub }, include: { user: true } });
  if (linked) return linked.user;

  const steamId64 = extractSteamId64(oidcSub);
  if (steamId64) return prisma.user.findUnique({ where: { steamId64 } });

  return null;
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
  const existing = await findUserByOidcSub(profile.oidcSub);
  const isAdmin = emailIsAdmin || (existing?.isAdmin ?? false);

  if (existing) {
    // Refresh profile fields from whichever provider was just used to sign in, same as before -
    // this can now be a linked (non-primary) provider, not just the primary one, which means the
    // displayed name/avatar reflects whichever account you most recently logged in with.
    return prisma.user.update({
      where: { id: existing.id },
      data: { email: profile.email, displayName: profile.displayName, avatarUrl: profile.avatarUrl, isAdmin },
    });
  }

  return prisma.user.create({ data: { ...profile, avatarColor: randomAvatarColor(), isAdmin } });
}

const AVATAR_COLORS = ['#E8734A', '#4A8FE8', '#6FBF73', '#B87DE8', '#E8C34A', '#4AE8D0'];
function randomAvatarColor() {
  return AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];
}

/** Every provider prefixes User.oidcSub with its own name (see subPrefix in the OIDC provider
 * config, and the literal "discord:"/"steam:" prefixes in their providers) - so the provider a
 * user originally signed up with is recoverable from the column itself, with no separate column
 * needed to track it. */
function primaryProviderOf(oidcSub: string): string {
  return oidcSub.split(':')[0];
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

export { getOrCreateUser, computeIsAdmin, primaryProviderOf };
