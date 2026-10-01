import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { Prisma } from '@prisma/client';
import { env } from '../config/env.js';
import { prisma } from '../db/client.js';
import { HttpError } from '../util/httpError.js';
import { buildAuthProviders } from '../services/authProviders/registry.js';
import type { AuthProvider } from '../services/authProviders/types.js';
import { extractSteamId64 } from '../services/steamLibrary.js';

const DEV_USER = {
  oidcSub: 'dev-user',
  email: 'dev@localhost',
  emailVerified: true,
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
function computeIsAdmin(email: string, opts: { devFakeAuth: boolean; adminEmails: string; emailVerified?: boolean }): boolean {
  if (opts.devFakeAuth) return true;
  // An address the provider hasn't verified proves nothing about who's signing in - see
  // OAuthProfile.emailVerified.
  if (opts.emailVerified === false) return false;
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

/** Returns `isNewUser` alongside the row (issue #359) - the auth callback uses it to flag a fresh
 * session as `isNewAccount`, one-shot-consumed by GET /api/me to auto-open the Import Library
 * modal on that account's very first visit. */
async function getOrCreateUser({ emailVerified, ...profile }: {
  oidcSub: string;
  email: string;
  emailVerified: boolean;
  displayName: string;
  avatarUrl: string | null;
}) {
  const emailIsAdmin = computeIsAdmin(profile.email, { devFakeAuth: env.DEV_FAKE_AUTH, adminEmails: env.ADMIN_EMAILS, emailVerified });
  // ADMIN_EMAILS grants admin on every login, but must never revoke it - an admin promoted through
  // the Settings panel (see admin.ts's PATCH /api/admin/users/:id/admin) has no email in that list
  // by definition, and would otherwise lose admin status the next time they signed in.
  const existing = await findUserByOidcSub(profile.oidcSub);
  const isAdmin = emailIsAdmin || (existing?.isAdmin ?? false);

  if (existing) {
    // Refresh email/avatar from whichever provider was just used to sign in (this can be a linked,
    // non-primary provider). displayName is deliberately NOT refreshed: it's user-editable via
    // PATCH /api/me/display-name, and overwriting it on login reset edits (#682).
    const user = await prisma.user.update({
      where: { id: existing.id },
      data: { email: profile.email, avatarUrl: profile.avatarUrl, isAdmin },
    });
    return { user, isNewUser: false };
  }

  try {
    const user = await prisma.user.create({ data: { ...profile, avatarColor: randomAvatarColor(), isAdmin } });
    return { user, isNewUser: true };
  } catch (err) {
    // Lost a race against a concurrent request for this same not-yet-existing account (issue
    // #447) - e.g. two tabs completing the same OAuth login around the same instant, or (under
    // DEV_FAKE_AUTH, which calls this on every request - see currentUserId below) several of the
    // app's own on-load requests all seeing "no user yet" at once. Same P2002-fallback pattern as
    // POST /api/rooms/join: the unique constraint on oidc_sub is the actual source of truth for
    // who won, so the loser here just re-fetches that row instead of 500ing. Reported as
    // isNewUser: false since this request didn't create it - whichever request actually won the
    // race is the one whose isNewAccount flag should fire.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const user = await prisma.user.findUniqueOrThrow({ where: { oidcSub: profile.oidcSub } });
      return { user, isNewUser: false };
    }
    throw err;
  }
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
      const { user: devUser } = await getOrCreateUser(DEV_USER);
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
    // A request body with the wrong type in it (a number where a string id goes, an object for a
    // boolean) reaches Prisma as a query it refuses to build - that's the caller's mistake, not a
    // server fault, so it gets a 400 instead of a logged 500.
    if (error instanceof Prisma.PrismaClientValidationError) {
      reply.status(400).send({ error: 'Invalid request' });
      return;
    }
    const statusCode = (error as { statusCode?: number }).statusCode ?? 500;
    // Below 500, error.message is always something a route deliberately wrote for the caller
    // (HttpError, Fastify's own body/param validation) - safe to forward as-is. At/above 500 it's
    // an unexpected exception (a Prisma error, a DB timeout, a null-deref) whose message can carry
    // internal detail - schema/column names, connection strings, file paths - so only the server
    // log gets the real message; the client gets a generic one.
    if (statusCode >= 500) {
      app.log.error(error);
      reply.status(statusCode).send({ error: 'Internal server error' });
      return;
    }
    const code = (error as { code?: unknown }).code;
    // A string code set by our own HttpError subclasses (e.g. restore's SessionKeyError) lets the
    // client tell error cases apart without matching on the message. Fastify's own errors carry
    // FST_* codes, which stay server-side.
    reply.status(statusCode).send(typeof code === 'string' && error instanceof HttpError ? { error: error.message, code } : { error: error.message });
  });
});

export { getOrCreateUser, computeIsAdmin, primaryProviderOf };
