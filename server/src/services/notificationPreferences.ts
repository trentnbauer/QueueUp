import type { EmailAlertType } from '@queueup/shared';
import { prisma } from '../db/client.js';

/** Whether an alert row should be written at all: the person wants it in their bell (default yes)
 * **or** by email. The row is what the email digest is built from, so skipping it when only the
 * bell is off would silently drop an email-only alert - the bell hides it instead (see
 * hiddenInAppTypes). */
export async function wantsAlert(userId: string, type: EmailAlertType): Promise<boolean> {
  const row = await prisma.notificationPreference.findUnique({ where: { userId_type: { userId, type } }, select: { inApp: true, email: true } });
  return (row?.inApp ?? true) || (row?.email ?? false);
}

/** The alert types this person has switched off in their bell. Their rows still exist (so email
 * can send them) but are left out of the bell's list and counts. */
export async function hiddenInAppTypes(userId: string): Promise<EmailAlertType[]> {
  const rows = await prisma.notificationPreference.findMany({ where: { userId, inApp: false }, select: { type: true } });
  return rows.map((r) => r.type as EmailAlertType);
}
