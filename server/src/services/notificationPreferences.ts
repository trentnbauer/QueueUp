import type { EmailAlertType } from '@queueup/shared';
import { prisma } from '../db/client.js';

/** Whether a person wants this alert in their bell (default yes). For alert types that support
 * turning it off. */
export async function isInAppEnabled(userId: string, type: EmailAlertType): Promise<boolean> {
  const row = await prisma.notificationPreference.findUnique({ where: { userId_type: { userId, type } }, select: { inApp: true } });
  return row?.inApp ?? true;
}
