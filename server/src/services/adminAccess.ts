import { prisma } from '../db/client.js';
import { HttpError } from '../util/httpError.js';

/** Any administrator: an Administrator or a Super administrator (#1102). */
export async function requireAdmin(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user?.isAdmin) {
    throw new HttpError(403, 'Administrator access required');
  }
  return user;
}

/** A Super administrator - for anything destructive or hard to undo (#1102). */
export async function requireSuperAdmin(userId: string) {
  const user = await requireAdmin(userId);
  if (!user.isSuperAdmin) {
    throw new HttpError(403, 'Only a Super administrator can do this');
  }
  return user;
}

/** Why this administrator can't view the app as this person (#1102), or null when they can. */
export function viewAsRefusal(actor: { id: string; isSuperAdmin: boolean }, target: { id: string; isSuperAdmin: boolean }): string | null {
  if (actor.id === target.id) return 'That is you';
  if (target.isSuperAdmin && !actor.isSuperAdmin) return 'Only a Super administrator can view the app as a Super administrator';
  return null;
}
