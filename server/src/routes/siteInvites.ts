import type { FastifyInstance } from 'fastify';
import { env } from '../config/env.js';
import { prisma } from '../db/client.js';
import { requireAdmin } from '../services/adminAccess.js';
import { logAdminAction } from '../services/adminAuditLog.js';
import { generateSiteInviteCode, isSiteInviteUsable } from '../services/signupInvites.js';
import { HttpError } from '../util/httpError.js';

export interface SiteInviteDto {
  id: string;
  code: string;
  label: string;
  maxUses: number | null;
  uses: number;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  active: boolean;
}

function toDto(i: { id: string; code: string; label: string; maxUses: number | null; uses: number; expiresAt: Date | null; revokedAt: Date | null; createdAt: Date }): SiteInviteDto {
  return {
    id: i.id,
    code: i.code,
    label: i.label,
    maxUses: i.maxUses,
    uses: i.uses,
    expiresAt: i.expiresAt?.toISOString() ?? null,
    revokedAt: i.revokedAt?.toISOString() ?? null,
    createdAt: i.createdAt.toISOString(),
    active: isSiteInviteUsable(i),
  };
}

const MAX_SITE_INVITES_LISTED = 200;

/** Administrator-made site invites for SIGNUP_MODE=invite (#1096). */
export default async function siteInviteRoutes(app: FastifyInstance) {
  const limit = { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } };

  app.get('/api/admin/site-invites', limit, async (request) => {
    await requireAdmin(await request.requireAuth());
    const invites = await prisma.siteInvite.findMany({ orderBy: { createdAt: 'desc' }, take: MAX_SITE_INVITES_LISTED });
    return { signupMode: env.SIGNUP_MODE, invites: invites.map(toDto) };
  });

  app.post<{ Body: { label?: unknown; maxUses?: unknown; expiresInDays?: unknown } }>('/api/admin/site-invites', limit, async (request, reply) => {
    const actorId = await request.requireAuth();
    const actor = await requireAdmin(actorId);
    const { label, maxUses, expiresInDays } = request.body ?? {};
    if (label !== undefined && typeof label !== 'string') throw new HttpError(400, 'Label must be text');
    if (maxUses != null && (!Number.isInteger(maxUses) || (maxUses as number) < 1 || (maxUses as number) > 10000)) throw new HttpError(400, 'Uses must be a whole number from 1 to 10000');
    if (expiresInDays != null && (!Number.isInteger(expiresInDays) || (expiresInDays as number) < 1 || (expiresInDays as number) > 365)) throw new HttpError(400, 'Expiry must be a whole number of days from 1 to 365');
    const created = await prisma.siteInvite.create({
      data: {
        code: generateSiteInviteCode(),
        label: (label ?? '').trim().slice(0, 100),
        maxUses: (maxUses as number | null | undefined) ?? null,
        expiresAt: expiresInDays != null ? new Date(Date.now() + (expiresInDays as number) * 24 * 60 * 60 * 1000) : null,
        createdBy: actorId,
      },
    });
    await logAdminAction({ actorId, actorLabel: actor.email, action: 'siteInvite.create', targetLabel: created.label || created.id, metadata: { inviteId: created.id, maxUses: created.maxUses } });
    reply.status(201);
    return { invite: toDto(created) };
  });

  app.delete<{ Params: { id: string } }>('/api/admin/site-invites/:id', limit, async (request, reply) => {
    const actorId = await request.requireAuth();
    const actor = await requireAdmin(actorId);
    const invite = await prisma.siteInvite.findUnique({ where: { id: request.params.id } });
    if (!invite) throw new HttpError(404, 'Invite not found');
    if (!invite.revokedAt) {
      await prisma.siteInvite.update({ where: { id: invite.id }, data: { revokedAt: new Date() } });
      await logAdminAction({ actorId, actorLabel: actor.email, action: 'siteInvite.revoke', targetLabel: invite.label || invite.id, metadata: { inviteId: invite.id } });
    }
    reply.status(204);
    return reply.send();
  });
}
