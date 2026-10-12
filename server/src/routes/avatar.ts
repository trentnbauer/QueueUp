import type { FastifyInstance } from 'fastify';
import { AVATAR_CHOICES, type AvatarChoice, type AvatarSettings } from '@queueup/shared';
import { prisma } from '../db/client.js';
import { HttpError } from '../util/httpError.js';
import { effectiveAvatarUrl, gravatarExists, gravatarUrl, readSources } from '../services/avatars.js';

/** Choosing where the profile picture comes from: Automatic (whatever the last sign-in gave), Steam,
 * Discord, Gravatar, or just the colour and first letter. There is no upload: pictures only ever come
 * from those services. The colour is the Personal Shelf colour (see setShelfColor). */
export default async function avatarRoutes(app: FastifyInstance) {
  app.get('/api/me/avatar', async (request): Promise<AvatarSettings> => {
    const userId = await request.requireAuth();
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const sources = readSources(user.avatarSources);
    return {
      choice: (AVATAR_CHOICES as readonly string[]).includes(user.avatarChoice) ? (user.avatarChoice as AvatarChoice) : 'auto',
      blocked: user.avatarBlocked,
      options: {
        steam: sources.steam ?? null,
        discord: sources.discord ?? null,
        gravatar: user.emailVerified ? gravatarUrl(user.email) : null,
      },
    };
  });

  app.put<{ Body: { choice?: string } }>('/api/me/avatar', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (request) => {
    const userId = await request.requireAuth();
    const choice = request.body?.choice;
    if (typeof choice !== 'string' || !(AVATAR_CHOICES as readonly string[]).includes(choice)) throw new HttpError(400, 'Unknown picture choice');
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.avatarBlocked && choice !== 'letter') throw new HttpError(400, 'An administrator removed your picture, so only your colour and letter can be used.');

    const sources = readSources(user.avatarSources);
    if (choice === 'steam' && !sources.steam) throw new HttpError(400, 'No Steam picture yet. Sign in with or link Steam first.');
    if (choice === 'discord' && !sources.discord) throw new HttpError(400, 'No Discord picture yet. Sign in with or link Discord first.');
    if (choice === 'gravatar') {
      if (!user.emailVerified) throw new HttpError(400, 'Gravatar needs an email address your sign-in provider has verified.');
      if (!(await gravatarExists(gravatarUrl(user.email)))) throw new HttpError(400, 'No Gravatar was found for your email address.');
    }
    // "auto" shows whatever picture the account has now; the next sign-in refreshes it.
    const latest = user.avatarUrl ?? sources.provider ?? sources.discord ?? sources.steam ?? null;
    const avatarUrl = effectiveAvatarUrl({ ...user, avatarChoice: choice }, sources, latest);
    await prisma.user.update({ where: { id: userId }, data: { avatarChoice: choice, avatarUrl } });
    return { choice, avatarUrl };
  });
}
