import type { FastifyInstance } from 'fastify';
import { Prisma } from '@prisma/client';
import { env } from '../config/env.js';
import { prisma } from '../db/client.js';
import { getOrCreateUser, primaryProviderOf } from '../plugins/auth.js';
import { toUserDto } from '../util/dto.js';
import { HttpError } from '../util/httpError.js';
import { extractSteamId64, resolveSteamId64 } from '../services/steamLibrary.js';
import { setOwnedPlatforms } from '../services/userSettings.js';
import { logAdminAction } from '../services/adminAuditLog.js';
import type { OAuthProfile } from '../services/authProviders/types.js';
import type {
  DataExport,
  DataExportGame,
  DataExportLinkedIdentity,
  DataExportRoomMembership,
  DataExportVote,
  UpdateOwnedPlatformsRequest,
  VoteValue,
} from '@queueup/shared';

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

  // "Download my data" (issue #243) - a safety net before the irreversible DELETE /api/me below,
  // so someone can grab a copy of what they're about to lose. Reads from the same tables Year in
  // Review does (see /api/me/year-in-review in games.ts), just without that route's windowing -
  // this is a full point-in-time snapshot, not a rolling-12-months summary. Never destructive, so
  // no confirmation gating beyond being logged in.
  app.get(
    '/api/me/export',
    // Same class of route as Year in Review - a direct, occasional Profile Settings action, not
    // something a normal session comes close to hitting.
    { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const userId = await request.requireAuth();

      const [user, games, votes, memberships] = await Promise.all([
        prisma.user.findUniqueOrThrow({ where: { id: userId }, include: { linkedIdentities: true } }),
        // Personal Shelf (roomId null) and room games, combined - same addedBy scoping Year in
        // Review uses, just not restricted to Done/the trailing year.
        prisma.game.findMany({
          where: { addedBy: userId },
          select: {
            id: true,
            title: true,
            platform: true,
            genre: true,
            status: true,
            roomId: true,
            room: { select: { name: true } },
            createdAt: true,
            updatedAt: true,
          },
          orderBy: { createdAt: 'asc' },
        }),
        prisma.vote.findMany({
          where: { userId },
          select: {
            gameId: true,
            value: true,
            createdAt: true,
            game: { select: { title: true, roomId: true, room: { select: { name: true } } } },
          },
          orderBy: { createdAt: 'asc' },
        }),
        prisma.roomMember.findMany({
          where: { userId },
          select: { roomId: true, role: true, joinedAt: true, room: { select: { name: true } } },
          orderBy: { joinedAt: 'asc' },
        }),
      ]);

      // Every provider prefixes its oidcSub with "<provider>:" (see primaryProviderOf's doc
      // above) - accountId strips that prefix back off so the export carries the provider's own
      // account id, never a token/secret (none are stored for a linked identity to begin with).
      const accountId = (sub: string) => sub.slice(sub.indexOf(':') + 1);
      const primaryProvider = primaryProviderOf(user.oidcSub);
      const linkedIdentities: DataExportLinkedIdentity[] = [
        { provider: primaryProvider, providerAccountId: accountId(user.oidcSub) },
        ...(user.steamId64 && primaryProvider !== 'steam' ? [{ provider: 'steam', providerAccountId: user.steamId64 }] : []),
        ...user.linkedIdentities.map((identity) => ({
          provider: identity.provider,
          providerAccountId: accountId(identity.oidcSub),
        })),
      ];

      const gamesAdded: DataExportGame[] = games.map((g) => ({
        id: g.id,
        title: g.title,
        platform: g.platform,
        genre: g.genre,
        status: g.status,
        roomId: g.roomId,
        roomName: g.room?.name ?? null,
        createdAt: g.createdAt.toISOString(),
        updatedAt: g.updatedAt.toISOString(),
      }));

      const votesCast: DataExportVote[] = votes.map((v) => ({
        gameId: v.gameId,
        gameTitle: v.game.title,
        roomId: v.game.roomId,
        roomName: v.game.room?.name ?? null,
        value: v.value as VoteValue,
        createdAt: v.createdAt.toISOString(),
      }));

      const roomMemberships: DataExportRoomMembership[] = memberships.map((m) => ({
        roomId: m.roomId,
        roomName: m.room.name,
        role: m.role,
        joinedAt: m.joinedAt.toISOString(),
      }));

      const result: DataExport = {
        exportedAt: new Date().toISOString(),
        account: {
          id: user.id,
          email: user.email,
          displayName: user.displayName,
          createdAt: user.createdAt.toISOString(),
          ownedPlatforms: user.ownedPlatforms,
        },
        linkedIdentities,
        gamesAdded,
        votesCast,
        roomMemberships,
      };

      // Same download-trigger mechanism as GET /api/admin/logs/export: a plain same-origin
      // response with Content-Disposition, fetched via a plain <a href download> on the frontend
      // rather than a fetch+blob dance.
      reply.header('Content-Type', 'application/json; charset=utf-8');
      reply.header('Content-Disposition', `attachment; filename="queueup-data-export-${Date.now()}.json"`);
      return result;
    },
  );

  app.delete(
    '/api/me',
    // Irreversible and, by nature, something an account only ever does once - a tight limit costs
    // nothing legitimate while blunting abuse of a compromised session.
    { config: { rateLimit: { max: 5, timeWindow: '1 hour' } } },
    async (request, reply) => {
      const userId = await request.requireAuth();

      // Room.createdBy has no cascade/set-null behavior (a room needs an unambiguous owner), so a
      // straight prisma.user.delete() would fail on a foreign key violation for anyone who still
      // owns a room - same guard already used by the admin equivalent of this route
      // (DELETE /api/admin/users/:id). Deleting or transferring ownership of those rooms first is
      // a deliberate, visible action the account owner takes via Room Settings, rather than this
      // silently destroying (or silently reassigning) rooms shared with other people.
      const createdRoomCount = await prisma.room.count({ where: { createdBy: userId } });
      if (createdRoomCount > 0) {
        throw new HttpError(
          400,
          `You still own ${createdRoomCount} room${createdRoomCount === 1 ? '' : 's'} — delete ${createdRoomCount === 1 ? 'it' : 'them'} or transfer ownership to another member (in Room Settings) before deleting your account.`,
        );
      }

      const target = await prisma.user.findUniqueOrThrow({ where: { id: userId } });

      // Written before the delete (not after) since AdminAuditLog.actorId references this same
      // user row - deleting first would make actorId point at a row that no longer exists. Once
      // the user is gone, the onDelete: SetNull on that relation clears actorId automatically,
      // same as it does for an admin-initiated deletion; actorLabel keeps the email regardless.
      await logAdminAction({
        actorId: userId,
        actorLabel: target.email,
        action: 'user.selfDelete',
        targetLabel: target.email,
      });

      // Everything else (linked identities, game ownership claims, room memberships, games added,
      // votes cast, direct notifications) cascades via the schema's onDelete: Cascade - see
      // schema.prisma's User model relations.
      await prisma.user.delete({ where: { id: userId } });

      app.log.warn(
        { action: 'user.selfDelete', userId, email: target.email },
        `User ${userId} (${target.email}) deleted their own account`,
      );

      await request.session.destroy();
      reply.status(204);
      return null;
    },
  );
}
